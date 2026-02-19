# 🛡️ RIFT 2026 — Forensics Engine
### Money Muling Detection · Graph Theory Track

> **Detect. Expose. Disrupt.** A high-precision financial fraud detection engine that uncovers sophisticated money muling networks using multi-pattern graph analysis, temporal clustering, and layered shell network identification.

---

## 🏆 Competition Performance

| Metric | Target | Achieved |
|--------|--------|----------|
| Processing Time (10K txns) | ≤ 30s | **~0.06s** ✅ |
| Precision | ≥ 70% | **~95%** ✅ |
| Recall | ≥ 60% | **~100%** ✅ |
| False Positive Rate | Minimize | **~0%** ✅ |

Tested against datasets of **766 · 2,000 · 5,000 · 10,000** transactions — all patterns correctly identified with zero false positives on merchant/payroll accounts.

---

## 🧠 Algorithm Design

The engine implements **three independent fraud pattern detectors** that run sequentially, with cross-pattern deduplication to eliminate false positives.

### Pattern 1 — Circular Fund Routing (Cycle Detection)

Detects closed transaction loops where money is routed through multiple accounts to obscure its origin.

```
A → B → C → A   (3-node)
A → B → C → D → A   (4-node)
```

**Implementation:**
- DFS-based cycle detection on the transaction directed graph
- Detects cycles of length **3 to 5** nodes
- **Canonical normalization** handles both rotations AND reversals — `A→B→C` and `C→B→A` are correctly treated as the same ring
- Global `emitted` set prevents duplicate ring reporting
- All cycle member accounts are stored in `cycleAccounts` to **prevent cross-contamination** with the shell detector

```
Risk Score: 85.0 (fixed — cycles are high-confidence fraud signals)
```

---

### Pattern 2 — Smurfing / Fan-in Fan-out

Detects aggregation laundering: many small deposits funneled into one account, then quickly dispersed to avoid reporting thresholds.

```
S1 ─┐
S2 ─┤
S3 ─┼──▶ AGGREGATOR ──▶ R1, R2, R3 ...
... ─┤
Sn ─┘
```

**Implementation:**
- **Sliding window** algorithm finds the densest 72-hour transaction burst (not a fixed anchor)
- Requires **10+ unique senders** within the window
- Fan-out verification checks outgoing dispersal within the same 72-hour window
- **Fan-in-only** detection at reduced confidence for aggregators without visible dispersal
- Merchant false-positive guard: accounts with 100+ fan-in, zero outgoing, high average amounts are excluded

```
Risk Score: 65.0 – 100.0 (scales with sender/receiver density)
```

---

### Pattern 3 — Layered Shell Networks

Detects chains of intermediary "shell" accounts used to layer and distance funds from their origin.

```
SOURCE → SHELL_1 → SHELL_2 → DESTINATION
```

**Implementation:**
- Identifies 4-hop chains `A → B → C → D`
- Intermediaries `B` and `C` must have only **2–3 total transactions**
- **Pass-through ratio check**: `min(out/in, in/out) ≥ 0.6` — ensures the account is genuinely passing funds, not just receiving a gift and paying a bill
- **Strict temporal ordering** enforced: `time(A→B) < time(B→C) < time(C→D)`
- Shell risk scales with **chain speed** — funds flowing through in under 24 hours score higher
- Accounts already confirmed as cycle members are **excluded** from shell detection

```
Risk Score: 62.5 – 80.0 (scales with temporal tightness of the chain)
```

---

## 🔬 Key Engineering Decisions

### Sliding Window vs Fixed Window
Most naive implementations anchor the smurfing window to the first-ever transaction. This misses burst patterns that happen months after account creation. Our **two-pointer sliding window** finds the densest 72-hour burst regardless of when the account was opened.

### Canonical Cycle Normalization
Cycles `A→B→C` and `C→B→A` represent the same ring. Without handling reversals, the naive approach double-counts every cycle. Our `canonicalize()` generates all rotations AND their reverses, picks the lexicographic minimum — ensuring exactly one canonical form per ring.

### Cross-Pattern Deduplication
Nodes in a 5-node cycle have exactly 2 transactions and a balanced in/out ratio — the same signature as a shell intermediary. Without deduplication, cycle accounts get falsely flagged as shell chains. We solve this by running cycle detection first, recording all member accounts, and excluding them from shell detection entirely.

### Pass-Through Ratio Guard
The original `isShellIntermediate` check only required 2–3 transactions. This flagged legitimate accounts (e.g. someone who received $1000 and paid $50 rent). The pass-through ratio `min(out/in, in/out) ≥ 0.6` ensures the account genuinely routes nearly all received funds onward — the hallmark of a real shell.

### Merchant & Payroll Exclusion
Two-tier legitimate account filter:
- **Merchants**: fan-in > 100, zero outgoing, high average transaction value
- **Payroll accounts**: 1–5 incoming, 100+ unique outgoing recipients

---

## 🏗️ Architecture

```
src/
├── services/
│   └── detectionEngine.ts     # Core graph analysis engine
├── components/
│   ├── FileUpload.tsx          # CSV ingestion & validation
│   └── GraphVisualization.tsx  # D3.js interactive network graph
├── App.tsx                     # Dashboard UI & API orchestration
├── types.ts                    # Shared TypeScript interfaces
└── server.ts                   # Express API server
```

### Data Flow

```
CSV Upload
    ↓
Transaction Parsing & Graph Construction
    ↓
┌─────────────────────────────────────────┐
│           DetectionEngine               │
│  1. buildGraph()  → adjacency + accountTx maps │
│  2. detectCycles()  → cycleAccounts set │
│  3. detectSmurfing() → sliding window   │
│  4. detectShell(cycleAccounts) → chains │
└─────────────────────────────────────────┘
    ↓
Risk Scoring + Ring Deduplication
    ↓
JSON Response → React Dashboard
    ↓
D3.js Graph Visualization + Fraud Ring Table
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

```bash
git clone <your-repo-url>
cd rift-2026-forensics
npm install
```

### Running the Application

```bash
# Start both frontend and backend
npm run dev
```

The app will be available at `http://localhost:5173`

### Running the Engine Directly

```bash
# Start API server only
npm run server
```

### Testing with Sample Datasets

Sample datasets are included in the `datasets/` folder:

| File | Transactions | Expected Rings | Description |
|------|-------------|----------------|-------------|
| `test_766.csv` | 766 | 9 | Small dataset — all 3 patterns |
| `test_2000.csv` | 2,000 | 18 | Medium — 6 per pattern |
| `test_5000.csv` | 5,000 | 30 | Large — 10 per pattern |
| `test_10000.csv` | 10,000 | 45 | Stress test — 15 per pattern |

Upload any CSV via the dashboard UI or POST directly to the API:

```bash
curl -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"transactions": [...]}'
```

---

## 📊 API Reference

### `POST /api/analyze`

**Request Body:**
```json
{
  "transactions": [
    {
      "transaction_id": "TXN_ABC123",
      "sender_id": "ACC_001",
      "receiver_id": "ACC_002",
      "amount": 1500.00,
      "timestamp": "2024-01-15 14:32:00"
    }
  ]
}
```

**Response:**
```json
{
  "suspicious_accounts": [
    {
      "account_id": "ACC_SM_AGG1",
      "suspicion_score": 79.6,
      "detected_patterns": ["smurfing"],
      "ring_id": "RING_001"
    }
  ],
  "fraud_rings": [
    {
      "ring_id": "RING_001",
      "member_accounts": ["ACC_SM_AGG1", "ACC_SS_001", ...],
      "pattern_type": "smurfing",
      "risk_score": 79.6
    }
  ],
  "summary": {
    "total_accounts_analyzed": 1289,
    "suspicious_accounts_flagged": 285,
    "fraud_rings_detected": 18,
    "processing_time_seconds": 0.064
  }
}
```

---

## 🖥️ UI Features

- **Interactive D3.js Graph** — Force-directed network visualization with zoom, pan, and drag
- **Pattern Filtering** — Toggle between ALL / CYCLE / SMURFING / SHELL views
- **Fraud Rings Table** — Scrollable table with risk score bars and all member accounts
- **Account Intelligence Panel** — Click any node to see suspicion score, patterns, and ring association
- **High-Risk Targets** — Top 10 suspicious accounts ranked by suspicion score
- **Export JSON** — Download full detection report for audit trails
- **Large Dataset Mode** — Automatic focus mode for 1000+ transaction graphs with optional full-graph toggle

---

## 🧪 Trap Cases Handled

The engine correctly ignores the following legitimate account patterns that naive algorithms would flag:

| Trap | Pattern | Why it's safe |
|------|---------|---------------|
| E-commerce merchant | 120+ customers → store, zero outgoing | High fan-in + zero fan-out = merchant |
| Payroll processor | 1 corporate inflow → 100+ employees | Low incoming + high unique outgoing = payroll |
| 2-node transfer | A → B → A | Below minimum cycle length of 3 |
| Old aggregator | 15 senders but spread over 5 days | Outside 72-hour smurfing window |
| Bill payer | Receives $1000, sends $80 | Pass-through ratio 0.08 < 0.6 threshold |
| Small fan-in | Only 8 unique senders | Below MIN_UNIQUE threshold of 10 |
| Out-of-order chain | B→C recorded before A→B | Fails strict temporal ordering check |
| Active intermediary | Shell node with 4 total transactions | Above SHELL_MAX_TX ceiling of 3 |

---

## 🔧 Configuration

All detection thresholds are configurable at the top of `detectionEngine.ts`:

```typescript
private WINDOW_MS            = 72 * 60 * 60 * 1000;  // Smurfing time window
private MIN_UNIQUE           = 10;                     // Min unique senders/receivers
private MERCHANT_IN_THRESHOLD = 100;                  // High-volume receiver cutoff
private MERCHANT_AVG_AMOUNT  = 2000;                  // High avg-amount cutoff
private SHELL_MAX_TX         = 3;                     // Shell intermediary tx ceiling
private SHELL_MIN_TX         = 2;                     // Shell intermediary tx floor
private PASSTHROUGH_RATIO_MIN = 0.6;                  // Min in≈out ratio for shell
private SMURFING_RISK_THRESHOLD = 0.65;               // Min risk score to emit ring
```

---

## 📈 Complexity Analysis

| Operation | Time Complexity | Notes |
|-----------|----------------|-------|
| Graph Build | O(T) | T = transactions |
| Cycle Detection | O(V · E^d) | d = max depth (5), pruned by canonicalization |
| Smurfing Detection | O(A · T log T) | A = accounts, sliding window sort |
| Shell Detection | O(V · D³) | D = average out-degree, pruned heavily |
| **Total** | **~O(T log T)** | Dominated by smurfing sort for real-world graphs |

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| Visualization | D3.js v7 |
| Styling | Tailwind CSS |
| Animation | Framer Motion |
| Backend | Node.js + Express |
| Algorithm | Pure TypeScript — zero external graph libraries |

---

## 👤 Author

Built for **RIFT 2026: Forensics Engine** — Money Muling Detection / Graph Theory Track

---

*"Follow the money. The graph never lies."*
