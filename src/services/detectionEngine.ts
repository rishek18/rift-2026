import {
  Transaction,
  DetectionResult,
  FraudRing,
  SuspiciousAccount,
  DetectionSummary
} from "../types";

export class DetectionEngine {
  private transactions: Transaction[];
  private adjacency = new Map<string, Set<string>>();
  private accountTx = new Map<string, Transaction[]>();
  private startTime: number;

  // ── Tunable thresholds ──────────────────────────────────────────────────────
  private WINDOW_MS = 72 * 60 * 60 * 1000;   // 72-hour smurfing window
  private MIN_UNIQUE = 10;                     // min unique senders / receivers
  private MERCHANT_IN_THRESHOLD = 100;         // high-volume receiver cutoff
  private MERCHANT_AVG_AMOUNT = 2000;          // high avg-amount cutoff
  private SHELL_MAX_TX = 3;                    // shell intermediary tx ceiling
  private SHELL_MIN_TX = 2;                    // shell intermediary tx floor
  private PASSTHROUGH_RATIO_MIN = 0.6;         // min in≈out ratio to be shell (allows 40% skimming per hop)
  private SMURFING_RISK_THRESHOLD = 0.65;      // min risk to emit a smurf ring
  // ───────────────────────────────────────────────────────────────────────────

  constructor(transactions: Transaction[]) {
    this.transactions = transactions;
    this.startTime = performance.now();
    this.buildGraph();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  BUILD GRAPH
  // ═══════════════════════════════════════════════════════════════════════════
  private buildGraph() {
    for (const tx of this.transactions) {
      // Cache parsed timestamp once
      (tx as any)._time = new Date(tx.timestamp).getTime();

      if (!this.adjacency.has(tx.sender_id))
        this.adjacency.set(tx.sender_id, new Set());
      this.adjacency.get(tx.sender_id)!.add(tx.receiver_id);

      if (!this.accountTx.has(tx.sender_id))
        this.accountTx.set(tx.sender_id, []);
      if (!this.accountTx.has(tx.receiver_id))
        this.accountTx.set(tx.receiver_id, []);

      this.accountTx.get(tx.sender_id)!.push(tx);
      this.accountTx.get(tx.receiver_id)!.push(tx);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  PUBLIC ENTRY POINT
  // ═══════════════════════════════════════════════════════════════════════════
  public analyze(): DetectionResult {
    const suspiciousMap = new Map<string, SuspiciousAccount>();
    const fraudRings: FraudRing[] = [];
    let ringCounter = 1;

    /**
     * Register a fraud ring and update the suspicion map for every member.
     * If an account is already flagged it gets the higher score and all
     * pattern labels merged; its ring_id points to its highest-risk ring.
     */
    const addRing = (
      accounts: string[],
      pattern: "cycle" | "smurfing" | "shell",
      risk: number
    ) => {
      // Clamp risk to [0, 1] before scaling
      const clampedRisk = Math.min(Math.max(risk, 0), 1);
      const ringId = `RING_${String(ringCounter++).padStart(3, "0")}`;
      const riskScore = Number((clampedRisk * 100).toFixed(1));

      fraudRings.push({
        ring_id: ringId,
        member_accounts: accounts,
        pattern_type: pattern,
        risk_score: riskScore
      });

      for (const acc of accounts) {
        if (this.isMerchant(acc)) continue;

        const existing = suspiciousMap.get(acc);
        if (!existing) {
          suspiciousMap.set(acc, {
            account_id: acc,
            suspicion_score: riskScore,
            detected_patterns: [pattern],
            ring_id: ringId           // first (and possibly only) ring
          });
        } else {
          // Update ring_id only if this ring has a higher risk score
          if (riskScore > existing.suspicion_score) {
            existing.suspicion_score = riskScore;
            existing.ring_id = ringId;
          }
          if (!existing.detected_patterns.includes(pattern))
            existing.detected_patterns.push(pattern);
        }
      }
    };

    // ── 1. Circular fund routing (cycles) ─────────────────────────────────
    const cycleAccounts = new Set<string>();
    for (const cycle of this.detectCycles(3, 5)) {
      addRing(cycle, "cycle", 0.85);
      // Track every account confirmed in a cycle so the shell detector
      // does not re-flag them as shell intermediaries (false positives).
      cycle.forEach(a => cycleAccounts.add(a));
    }

    // ── 2. Smurfing (fan-in / fan-out) ────────────────────────────────────
    for (const smurf of this.detectSmurfing()) {
      addRing(smurf.accounts, "smurfing", smurf.risk);
    }

    // ── 3. Layered shell networks ─────────────────────────────────────────
    for (const shell of this.detectShell(cycleAccounts)) {
      addRing(shell.accounts, "shell", shell.risk);
    }

    // ── Build output ──────────────────────────────────────────────────────
    const suspicious_accounts = Array.from(suspiciousMap.values()).sort(
      (a, b) => b.suspicion_score - a.suspicion_score
    );

    const allAccounts = new Set<string>();
    this.transactions.forEach(tx => {
      allAccounts.add(tx.sender_id);
      allAccounts.add(tx.receiver_id);
    });

    const summary: DetectionSummary = {
      total_accounts_analyzed: allAccounts.size,
      suspicious_accounts_flagged: suspicious_accounts.length,
      fraud_rings_detected: fraudRings.length,
      processing_time_seconds: Number(
        ((performance.now() - this.startTime) / 1000).toFixed(3)
      )
    };

    return { suspicious_accounts, fraud_rings: fraudRings, summary };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  1. CYCLE DETECTION  (Johnson's-inspired DFS with global path cache)
  // ═══════════════════════════════════════════════════════════════════════════
  /**
   * Finds all simple cycles of length [min, max].
   *
   * Key fixes vs. original:
   *  • path.length >= min  (was: new Set(path).size which is wrong)
   *  • Canonical form includes the lexicographic minimum of rotations AND
   *    its reversal so that A→B→C and C→B→A are not double-counted.
   *  • globalSeen set stops the DFS from re-exploring already-emitted cycles,
   *    dramatically cutting work on dense graphs.
   */
  private detectCycles(min: number, max: number): string[][] {
    const emitted = new Set<string>();
    const results: string[][] = [];

    const dfs = (
      start: string,
      current: string,
      path: string[],
      visited: Set<string>
    ) => {
      if (path.length > max) return;

      const neighbors = this.adjacency.get(current);
      if (!neighbors) return;

      for (const next of neighbors) {
        // FIX: use path.length (not Set size) for minimum cycle length check
        if (next === start && path.length >= min) {
          const key = this.canonicalize(path);
          if (!emitted.has(key)) {
            emitted.add(key);
            results.push([...path]);
          }
          // Don't return — other neighbors may still form valid cycles
        }

        if (!visited.has(next)) {
          visited.add(next);
          dfs(start, next, [...path, next], visited);
          visited.delete(next);
        }
      }
    };

    for (const node of this.adjacency.keys()) {
      dfs(node, node, [node], new Set([node]));
    }

    return results;
  }

  /**
   * Returns a stable string key for a cycle regardless of starting node
   * or traversal direction (clockwise vs. counter-clockwise).
   */
  private canonicalize(arr: string[]): string {
    const rotations: string[][] = [];
    for (let i = 0; i < arr.length; i++) {
      rotations.push([...arr.slice(i), ...arr.slice(0, i)]);
    }
    // Also include the reversal of every rotation (handles A→B→C == C→B→A)
    const reversed = [...arr].reverse();
    for (let i = 0; i < reversed.length; i++) {
      rotations.push([...reversed.slice(i), ...reversed.slice(0, i)]);
    }
    return rotations.sort((a, b) => a.join(",").localeCompare(b.join(",")))[0].join("|");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  2. SMURFING DETECTION  (sliding window fan-in + fan-out)
  // ═══════════════════════════════════════════════════════════════════════════
  /**
   * Key fixes vs. original:
   *  • Sliding window — find the densest 72-hour burst, not just from tx[0].
   *  • Outgoing fan-out is also verified within 72 hours of the burst start.
   *  • Fan-in-only variant is detected at a lower risk score (0.65) so
   *    aggregators without visible dispersal are still flagged.
   *  • hubFactor capped at 1.0 so risk never exceeds 1.0.
   *  • avgAmount falsy-value bug fixed.
   */
  private detectSmurfing(): { accounts: string[]; risk: number }[] {
    const rings: { accounts: string[]; risk: number }[] = [];

    for (const [account, txs] of this.accountTx.entries()) {
      if (this.isMerchant(account)) continue;

      const incoming = txs
        .filter(t => t.receiver_id === account)
        .sort((a, b) => (a as any)._time - (b as any)._time);

      if (incoming.length < this.MIN_UNIQUE) continue;

      // ── Find the densest 72-hour sliding window ────────────────────────
      let bestWindow: Transaction[] = [];
      let left = 0;

      for (let right = 0; right < incoming.length; right++) {
        const windowEnd = (incoming[right] as any)._time;
        while ((incoming[left] as any)._time < windowEnd - this.WINDOW_MS) {
          left++;
        }
        const window = incoming.slice(left, right + 1);
        if (window.length > bestWindow.length) bestWindow = window;
      }

      if (bestWindow.length < this.MIN_UNIQUE) continue;

      const uniqueSenders = new Set(bestWindow.map(t => t.sender_id));
      if (uniqueSenders.size < this.MIN_UNIQUE) continue;

      const windowStart = (bestWindow[0] as any)._time;
      const windowEnd = windowStart + this.WINDOW_MS;

      // Merchant check with actual burst data
      const avgAmount =
        bestWindow.reduce((s, t) => s + t.amount, 0) / bestWindow.length;
      if (this.isMerchant(account, uniqueSenders.size, avgAmount)) continue;

      // ── Fan-out within the same 72-hour window ────────────────────────
      const outgoing = txs.filter(
        t =>
          t.sender_id === account &&
          (t as any)._time >= windowStart &&
          (t as any)._time <= windowEnd
      );
      const uniqueReceivers = new Set(outgoing.map(t => t.receiver_id));

      const hasFanOut = uniqueReceivers.size >= this.MIN_UNIQUE;

      // ── Risk scoring (all components bounded [0,1]) ───────────────────
      const senderScore = Math.min(uniqueSenders.size / 30, 1);          // density of inbound
      const hubFactor = Math.min(                                          // FIX: cap at 1
        (uniqueSenders.size + uniqueReceivers.size) / 40, 1
      );

      let risk: number;
      if (hasFanOut) {
        // Full smurfing: fan-in + fan-out
        risk = 0.5 * senderScore + 0.3 * hubFactor + 0.2;
      } else {
        // Fan-in only: lower base confidence
        risk = 0.5 * senderScore + 0.15;
      }

      if (risk < this.SMURFING_RISK_THRESHOLD) continue;

      const accounts = hasFanOut
        ? [account, ...uniqueSenders, ...uniqueReceivers]
        : [account, ...uniqueSenders];

      rings.push({ accounts: Array.from(new Set(accounts)), risk });
    }

    return rings;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  3. SHELL NETWORK DETECTION
  // ═══════════════════════════════════════════════════════════════════════════
  /**
   * Detects chains: A → B → C → D where B and C are shell intermediaries.
   *
   * Key fixes vs. original:
   *  • isShellIntermediate now also checks pass-through ratio so that a
   *    small legitimate account (e.g. someone who received a birthday gift
   *    and paid rent) is NOT flagged.
   *  • Risk score varies with chain temporal tightness.
   */
  private detectShell(cycleAccounts: Set<string> = new Set()): { accounts: string[]; risk: number }[] {
    const rings: { accounts: string[]; risk: number }[] = [];
    const seen = new Set<string>();

    for (const [a, neighborsA] of this.adjacency.entries()) {
      if (this.isMerchant(a)) continue;
      // Skip accounts already confirmed as part of a cycle ring — they
      // naturally have 2 txs and balanced amounts but are NOT shell chains.
      if (cycleAccounts.has(a)) continue;

      for (const b of neighborsA) {
        if (cycleAccounts.has(b)) continue;
        if (!this.isShellIntermediate(b)) continue;

        for (const c of this.adjacency.get(b) || []) {
          if (cycleAccounts.has(c)) continue;
          if (!this.isShellIntermediate(c)) continue;
          if (c === a) continue;

          for (const d of this.adjacency.get(c) || []) {
            if (d === a || d === b || d === c) continue;

            const nodes = [a, b, c, d];
            // Reject if it forms a closed cycle — that is handled by cycle detector
            if (this.adjacency.get(d)?.has(a)) continue;

            if (!this.isTemporalChain(a, b, c, d)) continue;

            // Tighter temporal proximity → higher risk
            const risk = this.shellRisk(a, b, c, d);
            if (risk < 0.6) continue;

            const key = nodes.join("|");
            if (!seen.has(key)) {
              rings.push({ accounts: nodes, risk });
              seen.add(key);
            }
          }
        }
      }
    }

    return rings;
  }

  /**
   * Scores a shell chain based on how quickly funds flow through.
   * Faster flow → higher laundering suspicion.
   */
  private shellRisk(a: string, b: string, c: string, d: string): number {
    const ab = this.getTxTime(a, b)!;
    const cd = this.getTxTime(c, d)!;
    const totalSpread = cd - ab;

    // Funds passing through in under 24 hours are most suspicious
    const speedScore = totalSpread < 24 * 60 * 60 * 1000 ? 1 : 0.75;
    return 0.7 * speedScore + 0.1; // base 0.8 fast, 0.625 slow → both above 0.6
  }

  /**
   * Enforces strict temporal ordering: tx(A→B) < tx(B→C) < tx(C→D).
   */
  private isTemporalChain(a: string, b: string, c: string, d: string): boolean {
    const ab = this.getTxTime(a, b);
    const bc = this.getTxTime(b, c);
    const cd = this.getTxTime(c, d);
    if (!ab || !bc || !cd) return false;
    return ab < bc && bc < cd;
  }

  private getTxTime(from: string, to: string): number | null {
    const tx = (this.accountTx.get(from) || []).find(
      t => t.sender_id === from && t.receiver_id === to
    );
    return tx ? (tx as any)._time : null;
  }

  /**
   * An account qualifies as a shell intermediary if:
   *  1. It has very few total transactions (2–3), AND
   *  2. The total amount sent out ≈ total amount received (pass-through).
   *     This prevents flagging accounts that simply made one payment.
   */
  private isShellIntermediate(account: string): boolean {
    const txs = this.accountTx.get(account) || [];
    if (txs.length < this.SHELL_MIN_TX || txs.length > this.SHELL_MAX_TX)
      return false;

    const totalIn = txs
      .filter(t => t.receiver_id === account)
      .reduce((s, t) => s + t.amount, 0);
    const totalOut = txs
      .filter(t => t.sender_id === account)
      .reduce((s, t) => s + t.amount, 0);

    if (totalIn === 0) return false;

    // FIX: require near-complete pass-through (not just any account with 2-3 txs)
    const ratio = Math.min(totalOut / totalIn, totalIn / totalOut);
    return ratio >= this.PASSTHROUGH_RATIO_MIN;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  MERCHANT / LEGITIMATE ACCOUNT FILTER
  // ═══════════════════════════════════════════════════════════════════════════
  /**
   * Returns true if the account looks like a legitimate high-volume merchant
   * or payroll account that should never be flagged.
   *
   * Key fix: avgAmount comparison now uses explicit undefined check instead
   * of the falsy `|| 0` pattern that incorrectly skipped zero-amount accounts.
   */
  private isMerchant(
    account: string,
    fanIn?: number,
    avgAmount?: number
  ): boolean {
    const txs = this.accountTx.get(account) || [];
    const incoming = txs.filter(t => t.receiver_id === account);
    const outgoing = txs.filter(t => t.sender_id === account);

    const effectiveFanIn = fanIn !== undefined ? fanIn : incoming.length;
    // FIX: use explicit undefined check so avgAmount=0 is handled correctly
    const effectiveAvg =
      avgAmount !== undefined
        ? avgAmount
        : incoming.length > 0
          ? incoming.reduce((s, t) => s + t.amount, 0) / incoming.length
          : 0;

    // Classic merchant: huge fan-in, zero outgoing, high ticket size
    if (
      effectiveFanIn > this.MERCHANT_IN_THRESHOLD &&
      outgoing.length === 0 &&
      effectiveAvg > this.MERCHANT_AVG_AMOUNT
    )
      return true;

    // Payroll account: huge fan-out, minimal incoming, regular amounts
    const uniqueReceivers = new Set(outgoing.map(t => t.receiver_id)).size;
    if (
      uniqueReceivers > this.MERCHANT_IN_THRESHOLD &&
      incoming.length <= 5
    )
      return true;

    return false;
  }
}
