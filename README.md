<div align="center">

# 🛡️ RIFT 2026: Forensics Engine

### *Money Muling Detection · Graph Theory Track*

[![Live Demo](https://img.shields.io/badge/🚀_Live_Demo-Online-success?style=for-the-badge)](https://rift-2026-hy4a.onrender.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![D3.js](https://img.shields.io/badge/D3.js-F9A03C?style=for-the-badge&logo=d3.js&logoColor=white)](https://d3js.org/)
[![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)

> **Detect. Expose. Disrupt.**  
> A high-precision financial fraud detection engine that uncovers sophisticated money muling networks through multi-pattern graph analysis, temporal clustering, and layered shell network identification — processing 10,000 transactions in under **0.35 seconds**.

### 🔗 [https://rift-2026-hy4a.onrender.com/](https://rift-2026-hy4a.onrender.com/)

</div>

---

## 📋 Table of Contents

- [Live Demo](#-live-demo)
- [Tech Stack](#-tech-stack)
- [System Architecture](#-system-architecture)
- [Algorithm Approach](#-algorithm-approach)
- [Suspicion Score Methodology](#-suspicion-score-methodology)
- [Installation & Setup](#-installation--setup)
- [Usage Instructions](#-usage-instructions)
- [Performance Benchmarks](#-performance-benchmarks)
- [Known Limitations](#-known-limitations)
- [Team Members](#-team-members)

---

## 🚀 Live Demo

**→ [https://rift-2026-hy4a.onrender.com/](https://rift-2026-hy4a.onrender.com/)**

Upload any transaction CSV and get instant fraud ring detection with interactive graph visualization.

**Required CSV columns:**

| Column | Type | Example |
|--------|------|---------|
| `transaction_id` | String | `TXN_00000001` |
| `sender_id` | String | `ACC_00123` |
| `receiver_id` | String | `ACC_00456` |
| `amount` | Float | `15000.00` |
| `timestamp` | DateTime | `2024-01-21 03:01:00` |

> ⚠️ **Note:** The free-tier deployment on Render.com may take **30–60 seconds** to wake up after inactivity (cold start). This is a hosting limitation — once loaded, the engine itself runs in milliseconds.

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 18 + TypeScript | Component-based dashboard UI |
| **Build Tool** | Vite | Fast HMR development & production bundling |
| **Visualization** | D3.js v7 | Force-directed interactive network graph |
| **Styling** | Tailwind CSS | Utility-first responsive design |
| **Animation** | Framer Motion | Smooth state transitions |
| **Backend** | Node.js + Express | REST API server |
| **Algorithm** | Pure TypeScript | Zero external graph libraries — all from scratch |
| **Deployment** | Render.com | Full-stack cloud hosting |
| **Icons** | Lucide React | UI icon system |

---

## 🏗️ System Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                        CLIENT  (React + Vite)                      │
│                                                                    │
│  ┌──────────────┐    ┌────────────────────────┐   ┌─────────────┐ │
│  │  FileUpload  │───▶│       App.tsx           │──▶│  D3 Graph   │ │
│  │    .tsx      │    │  (State Orchestrator)   │   │    Viz      │ │
│  └──────────────┘    └───────────┬────────────┘   └─────────────┘ │
│                                  │  POST /api/analyze              │
└──────────────────────────────────┼────────────────────────────────┘
                                   │ JSON { fraud_rings, suspicious_accounts, summary }
┌──────────────────────────────────▼────────────────────────────────┐
│                       SERVER  (Node.js + Express)                  │
│                                                                    │
│   ┌────────────────────────────────────────────────────────────┐  │
│   │                   DetectionEngine.ts                        │  │
│   │                                                             │  │
│   │   constructor(transactions)                                 │  │
│   │     └─▶ buildGraph()                                        │  │
│   │           ├─▶ adjacency  Map<string, Set<string>>           │  │
│   │           └─▶ accountTx  Map<string, Transaction[]>         │  │
│   │                    │                                        │  │
│   │   analyze()        ▼                                        │  │
│   │     ├─▶ detectCycles(min=3, max=5)                          │  │
│   │     │      └─▶ fills cycleAccounts Set<string>              │  │
│   │     ├─▶ detectSmurfing()                                    │  │
│   │     │      └─▶ sliding window · merchant guard              │  │
│   │     ├─▶ detectShell(cycleAccounts)                          │  │
│   │     │      └─▶ pass-through ratio · temporal ordering       │  │
│   │     └─▶ Risk Scoring + Deduplication                        │  │
│   │              └─▶ DetectionResult                            │  │
│   └────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

### Project Structure

```
RIFT-2026/
├── src/
│   ├── components/
│   │   ├── FileUpload.tsx           # CSV ingestion & column validation
│   │   └── GraphVisualization.tsx   # D3.js force-directed network graph
│   ├── services/
│   │   └── detectionEngine.ts       # Core fraud detection algorithm
│   ├── lib/
│   │   └── utils.ts                 # cn() utility + shared helpers
│   ├── App.tsx                      # Dashboard UI & API orchestration
│   ├── types.ts                     # Shared TypeScript interfaces
│   ├── main.tsx                     # React entry point
│   └── index.css                    # Global styles
├── server.ts                        # Express API server
├
│   
│  
│   
│  
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 🧠 Algorithm Approach

The engine runs **three independent fraud detectors** sequentially with cross-contamination guards between them. Every algorithm is implemented from scratch in TypeScript — no external graph libraries.

---

### Pattern 1 — Circular Fund Routing (Cycle Detection)

**Detects:** Closed transaction loops where money circles through accounts to obscure its origin.

```
A → B → C → A           (3-hop)
A → B → C → D → A       (4-hop)
A → B → C → D → E → A   (5-hop)
```

**Algorithm: DFS with canonical deduplication**

```
1. Build directed adjacency graph from all transactions
2. For each node, run DFS back to the starting node
3. When path returns to start AND length ∈ [3,5] → candidate cycle
4. Canonicalize: generate all rotations + reversals, pick lexicographic min
5. Only emit if canonical key not previously seen
6. Store all cycle members in cycleAccounts → used by shell detector
```

**Why canonical normalization matters:**  
The cycle `A→B→C` can be discovered starting from A, B, or C — and the reverse `C→B→A` also traverses the same ring. Without normalization, each ring is reported 6 times. Our `canonicalize()` reduces all representations to a single key.

**Complexity:** `O(V · E^d)` where `d = max depth (5)`, pruned by visited set and emitted cache.

---

### Pattern 2 — Smurfing / Fan-In Fan-Out

**Detects:** Aggregator accounts that collect many small deposits from different senders, then rapidly disperse them — a classic technique to evade reporting thresholds.

```
S1 ──┐
S2 ──┤
S3 ──┼──▶  AGGREGATOR  ──▶  R1, R2, R3 ... Rn
...  ┤
Sn ──┘
```

**Algorithm: Two-pointer sliding window**

```
1. For each account, collect all incoming transactions, sort by timestamp
2. Slide a 72-hour window across the sorted list (two-pointer technique)
3. Track the window with the most transactions → densest burst
4. Check: unique senders in burst ≥ 10 (MIN_UNIQUE threshold)
5. Check outgoing within same window: unique receivers ≥ 10 → full smurfing
6. If outgoing < 10 → fan-in only (lower confidence, still flagged)
7. Apply merchant/payroll guard before emitting
8. Calculate risk score and emit ring if risk ≥ 0.65
```

**Why sliding window over fixed anchor:**  
A naive implementation anchors to the account's oldest transaction. If an account was opened 6 months ago with one transfer, then laundered money in a recent 72-hour burst, the naive approach misses it entirely. The sliding window finds the densest burst regardless of account age.

**Merchant / payroll guard:**
```
Merchant  → fan-in > 100  AND  outgoing = 0  AND  avg amount > 2000  → skip
Payroll   → unique receivers > 100  AND  incoming ≤ 5               → skip
```

**Complexity:** `O(A · T log T)` where `A` = accounts, `T` = transactions (sort dominates).

---

### Pattern 3 — Layered Shell Networks

**Detects:** Chains of hollow "pass-through" accounts used to layer and distance funds from their source before reaching the final destination.

```
SOURCE  ──▶  SHELL_B  ──▶  SHELL_C  ──▶  DESTINATION
  (A)           (B)           (C)              (D)
```

**Algorithm: Directed 4-hop chain search with three guards**

```
1. Skip if account A is in cycleAccounts (prevent cross-contamination)
2. For each neighbor B: check isShellIntermediate(B)
3. For each neighbor C of B: check isShellIntermediate(C), C ≠ A
4. For each neighbor D of C: D ∉ {A,B,C}, no back-edge D→A (not a cycle)
5. Verify temporal ordering: time(A→B) < time(B→C) < time(C→D)
6. Calculate risk from chain speed, emit ring
```

**isShellIntermediate — three conditions (all required):**

```
Condition 1: total transactions = 2 or 3
             → Low activity = suspicious; high-activity accounts are not shells

Condition 2: has BOTH incoming AND outgoing
             → Pure senders/receivers are not pass-throughs

Condition 3: pass-through ratio = min(totalOut/totalIn, totalIn/totalOut) ≥ 0.6
             → Nearly all received funds must be forwarded onward
```

**Pass-through ratio in practice:**

| Account | Receives | Sends | Ratio | Is Shell? |
|---------|----------|-------|-------|-----------|
| Shell intermediary | $3,000 | $2,850 | 0.95 | ✅ Yes |
| Normal person (paid rent) | $1,000 | $60 | 0.06 | ❌ No |
| Normal person (small gift) | $500 | $50 | 0.10 | ❌ No |

**Temporal ordering** prevents false positives from accounts that happened to transfer money in both directions at unrelated times.

**Complexity:** `O(V · D³)` where `D` = average out-degree, heavily pruned by `isShellIntermediate` rejecting >95% of accounts.

---

### Cross-Pattern Deduplication Guard

```
Run order:
  1. detectCycles()     → populate cycleAccounts
  2. detectSmurfing()   → independent
  3. detectShell(cycleAccounts) → excludes all cycle accounts

Result merging:
  Account in multiple rings → suspicion_score = max of all ring scores
                           → detected_patterns = union of all patterns
                           → ring_id = ring with highest risk score
```

**Why order matters:** Every node in a 5-node cycle has exactly 2 transactions and a near-equal in/out ratio — indistinguishable from a shell intermediary without context. Running cycles first and passing the `cycleAccounts` exclusion set to the shell detector eliminates this entire class of false positives.

---

## 📊 Suspicion Score Methodology

Every flagged account receives a `suspicion_score` from **0.0 to 100.0** based on pattern type and statistical density.

### Cycle Score

```
score = 85.0  (fixed)
```
Cycles are high-confidence fraud signals. Any confirmed circular routing between 3–5 accounts is near-certain laundering activity, justifying a fixed high score.

---

### Smurfing Score

```
senderScore = min(uniqueSenders / 30, 1.0)
hubFactor   = min((uniqueSenders + uniqueReceivers) / 40, 1.0)

Full smurfing (fan-in + fan-out):
  risk = 0.5 × senderScore + 0.3 × hubFactor + 0.2

Fan-in only:
  risk = 0.5 × senderScore + 0.15

score = clamp(risk, 0, 1) × 100
Minimum threshold to emit: 65.0
```

**Score examples:**

| Senders | Receivers | Type | Score |
|---------|-----------|------|-------|
| 10 | 10 | Full | 65.3 |
| 18 | 14 | Full | 74.0 |
| 22 | 12 | Full | 82.2 |
| 27 | 17 | Full | 95.0 |
| 30 | 25 | Full | 100.0 |
| 30 | — | Fan-in | 65.0 |

---

### Shell Score

```
spread = time(C→D) − time(A→B)

speedScore = 1.00  if spread < 24 hours   (rapid layering — high suspicion)
           = 0.75  if spread ≥ 24 hours   (slower layering)

risk  = 0.7 × speedScore + 0.1
score = risk × 100

Fast chain  → 80.0
Slow chain  → 62.5
```

Faster fund flow through shell intermediaries indicates higher operational urgency — characteristic of active laundering rather than coincidental transfers.

---

### Multi-Pattern Accounts

When an account is implicated in rings of different types:
```
suspicion_score   = max(all ring scores)
detected_patterns = merged list (e.g. ["smurfing", "shell"])
ring_id           = ID of the highest-scoring ring
```

---

## ⚙️ Installation & Setup

### Prerequisites

- **Node.js** v18 or higher
- **npm** v9 or higher

### 1. Clone the repository

```bash
git clone https://github.com/rishek18/rift-2026-forensics.git
cd rift-2026-forensics
```

### 2. Install dependencies

```bash
npm install
```

### 3. Environment setup

```bash
cp .env.example .env
# Default: API runs on port 3000, frontend on port 5173
```

### 4. Start in development mode

```bash
npm run dev
# Starts both frontend + API server concurrently
```

### 5. Or start separately

```bash
npm run server    # API only  → http://localhost:3000
npm run client    # UI only   → http://localhost:5173
```

### 6. Build for production

```bash
npm run build
npm start
```

---

## 📖 Usage Instructions

### Step-by-step via the Web UI

1. Visit **[https://rift-2026-hy4a.onrender.com/](https://rift-2026-hy4a.onrender.com/)**
2. Click the upload area and select your CSV file
3. Wait for analysis — results appear in under 1 second for most datasets
4. Explore results in two views:
   - **Graph View** — interactive D3.js force-directed network
   - **Fraud Rings** — scrollable table with all detected rings

### Graph View Controls

| Action | Input |
|--------|-------|
| Zoom in / out | Mouse wheel |
| Pan canvas | Click + drag background |
| Reposition node | Click + drag node |
| View account details | Click any node |
| Filter by pattern | ALL · CYCLE · SMURFING · SHELL buttons |
| Full graph toggle | "Show Full Graph" button (datasets > 1,000 txns) |

### Direct API Usage

```bash
curl -X POST https://rift-2026-hy4a.onrender.com/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "transactions": [
      {
        "transaction_id": "TXN_001",
        "sender_id":      "ACC_A",
        "receiver_id":    "ACC_B",
        "amount":         5000,
        "timestamp":      "2024-01-15 10:00:00"
      }
    ]
  }'
```

**Response:**
```json
{
  "suspicious_accounts": [
    {
      "account_id":        "ACC_SM_AGG1",
      "suspicion_score":   79.6,
      "detected_patterns": ["smurfing"],
      "ring_id":           "RING_004"
    }
  ],
  "fraud_rings": [
    {
      "ring_id":          "RING_004",
      "member_accounts":  ["ACC_SM_AGG1", "ACC_SS_001", "..."],
      "pattern_type":     "smurfing",
      "risk_score":       79.6
    }
  ],
  "summary": {
    "total_accounts_analyzed":    1289,
    "suspicious_accounts_flagged": 285,
    "fraud_rings_detected":        18,
    "processing_time_seconds":     0.064
  }
}
```

### Included Test Datasets

| File | Transactions | Expected Rings | Description |
|------|-------------|----------------|-------------|
| `test_766.csv` | 766 | 9 | Smoke test — 3 per pattern |
| `test_2000.csv` | 2,000 | 18 | Medium — 6 per pattern |
| `test_5000.csv` | 5,000 | 30 | Large — 10 per pattern |
| `test_10000.csv` | 10,000 | 45 | Stress test — 15 per pattern |

Each dataset includes legitimate merchant/payroll traps that must **not** be flagged.

---

## 📈 Performance Benchmarks

| Dataset | Accounts | Fraud Rings | Processing Time | Competition Requirement |
|---------|----------|-------------|----------------|------------------------|
| 766 txns | 648 | 9 | **0.028s** | ≤ 30s ✅ |
| 2,000 txns | 1,289 | 18 | **0.064s** | ≤ 30s ✅ |
| 5,000 txns | ~2,400 | 30 | **~0.15s** | ≤ 30s ✅ |
| 10,000 txns | ~4,200 | 45 | **~0.35s** | ≤ 30s ✅ |

> Benchmarks run on Render.com free-tier instance. Local hardware will be faster.

### Trap Account False-Positive Rate: 0%

| Trap Pattern | Accounts Tested | Incorrectly Flagged |
|-------------|----------------|---------------------|
| High-volume merchants | 4 | 0 |
| Payroll processors | 4 | 0 |
| 2-node cycles (A↔B) | 2 | 0 |
| Stale smurfing (>72h) | 2 | 0 |
| Low fan-in (<10 senders) | 2 | 0 |
| Non-passthrough (ratio <0.6) | 2 | 0 |
| Out-of-order temporal chains | 1 | 0 |
| High-tx intermediaries (>3 txs) | 1 | 0 |

---

## ⚠️ Known Limitations

### Algorithm Limitations

**1. Maximum cycle length is 5**  
Rings with 6+ hops are not detected. Real-world laundering rarely exceeds 5 hops (each hop increases operational risk), but deeply nested networks would be missed.

**2. Smurfing threshold is fixed at 10 unique senders**  
Coordinated networks with 7–9 senders are not flagged. The threshold is intentionally conservative to minimize false positives, but it creates a blind spot for smaller coordinated rings.

**3. Shell detection is limited to exactly 4-hop chains**  
Longer layering sequences (5+ hops) are not detected as a single shell ring. Sub-segments may be captured if they independently qualify.

**4. First transaction used for temporal ordering**  
When multiple transactions exist between the same account pair, only the earliest is used for shell temporal ordering. Repeated transfers between the same pair are not aggregated.

**5. No temporal decay on risk scores**  
Fraud activity from 12 months ago scores identically to activity from last week. A recency-weighted scoring model would improve operational prioritization.

### System Limitations

**6. In-memory processing only**  
The full dataset is loaded into RAM. Files larger than ~50MB may cause degraded performance or timeouts on the free-tier deployment.

**7. Single-threaded Node.js execution**  
The detection engine runs on the main thread. Datasets exceeding ~50,000 transactions would benefit from a Web Worker or worker_threads implementation.

**8. No persistent storage**  
Analysis results exist only in browser memory. Use **Export JSON** before closing or refreshing the page.

**9. CSV format only**  
The uploader accepts CSV files only. JSON, Excel (.xlsx), Parquet, and database connections are not supported.

**10. Render.com cold starts**  
Free-tier deployment sleeps after 15 minutes of inactivity. The first request after a sleep period may take 30–60 seconds. This is a hosting constraint, not an algorithm issue.

---

## 👥 Team Members

| Name : DARSHAN B
        RISHEK J
        NAVITH

---

## 📄 License

Built for **RIFT 2026: Forensics Engine** — Money Muling Detection / Graph Theory Track.

---

<div align="center">

*"Follow the money. The graph never lies."*

**[🚀 Live Demo](https://rift-2026-hy4a.onrender.com/) · [🐛 Report Bug](https://github.com/your-username/rift-2026-forensics/issues) · [📖 API Docs](#-usage-instructions)**

</div>
