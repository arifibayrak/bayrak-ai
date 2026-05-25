# Feature Research — v2.0 Operations Intelligence & Hakkediş

**Domain:** Admin analytics, earned-value cost intelligence, and Turkish hakkediş (progress payment) for a linear-infrastructure construction subcontractor platform
**Researched:** 2026-05-25
**Milestone:** v2.0 (adding to existing v1 submission → audit → BOQ loop)
**Confidence:** HIGH for hakkediş mechanics and EVM formulas (multi-source verified); MEDIUM for KPI benchmarks (industry surveys, no single authoritative standard); HIGH for dashboard conventions (multiple practitioner sources)

---

## Context: What v1 Already Provides

The following data is **already captured** in production and available as inputs for all v2 features:

| Field | Source | Notes |
|-------|--------|-------|
| `submission.workerId` (personId) | Telegram user ID map | Per submission |
| `submission.boqItemId` | Bot selection | Links to BOQ line |
| `submission.quantity` | Bot numeric input | Worker-claimed qty |
| `submission.status` | Approval gate | `pending_audit / approved / rejected` |
| `submission.submittedAt` | Server timestamp | |
| `submission.decidedAt` | Auditor action timestamp | |
| `submission.decidedBy` (auditorId) | Auditor identity | |
| `submission.rejectionReason` | Auditor text | On reject only |
| `submission.locationMatch` | PostGIS check | `near / far / no_route` |
| `boq_item.material` | Office dashboard | |
| `boq_item.plannedQty` | Office dashboard | |
| `boq_item.approvedQty` | Running total | Auto-updated on approval |

**Missing for v2:** `boq_item.unit_price` — must be added as the first data migration of this milestone. All cost/earned-value calculations depend on it.

---

## 1. Subcontractor Field Performance KPIs

### What Firms Actually Track

Construction field teams and their supervisors track performance across four categories. Below are the metrics that map directly onto bayrak.ai's existing data.

#### Worker KPIs (per worker, per project, per period)

| KPI | Formula | Source data | Category | "Good" benchmark |
|-----|---------|------------|----------|-----------------|
| **Output rate** | `approved_qty / working_days_in_period` | approved submissions + calendar | Productivity | Trending up vs baseline; compare to project average |
| **Submission throughput** | `COUNT(submissions) / period` | submissions.submittedAt | Activity | N/A — varies by work type; compare peer workers |
| **Approval rate** | `approved / total_submitted × 100` | submission.status | Quality | ≥ 85–90% on a healthy site; below 70% → systemic issue |
| **Rejection rate** | `rejected / total_submitted × 100` | submission.status | Rework/Quality | < 10–15% acceptable; > 20% triggers coaching |
| **Rework/resubmission rate** | `resubmissions after rejection / total` | requires resubmit tracking | Quality | Minimize; any repeat rejection on same item is a flag |
| **Location compliance rate** | `locationMatch=='near' / total × 100` | submission.locationMatch | Geo/Quality | > 90% near-match expected on a properly routed project |
| **Value contribution** (requires unit_price) | `SUM(approved_qty × unit_price)` | BOQ + submissions | Cost/Value | Compare peer workers and periods |
| **Avg quantity per submission** | `SUM(approved_qty) / COUNT(approved)` | submissions | Productivity | Establishes worker's typical work unit size |

**Source basis:** Procore, iFieldSmart, Vitruvi blog — construction productivity KPI surveys. No universal numeric benchmarks exist for pipeline subcontractors; firms set baselines from their own data. The 85–90% approval rate and < 15% rejection rate are practitioner-consensus ranges, not certified standards.

#### Auditor KPIs (per auditor, per project, per period)

| KPI | Formula | Source data | Category | "Good" benchmark |
|-----|---------|------------|----------|-----------------|
| **Decision throughput** | `COUNT(decided submissions) / period` | decidedAt timestamps | Activity | Must keep pace with submission volume |
| **Approval rate** | `approved / total_decided × 100` | submission.status | Judgment quality | No universal target; very high (> 95%) may signal rubber-stamping; very low (< 60%) may signal over-rejection or quality crisis |
| **Rejection rate** | `rejected / total_decided × 100` | submission.status | Judgment quality | Site-specific; useful as trend, not absolute |
| **Avg decision turnaround** | `AVG(decidedAt - submittedAt)` | both timestamps | Responsiveness | < 2 hours on active site; > 4 hours is a bottleneck |
| **Pending backlog** | `COUNT(status='pending_audit') at any moment` | submission.status | Backlog/SLA | 0 ideal; > 24h pending items trigger alert |
| **SLA breach rate** | `COUNT(pending > N hours) / total` | decidedAt vs submittedAt | SLA | Alert at > 4h outstanding; 24h breach is critical |
| **Location override rate** | `approved where locationMatch='far' / total_approved` | locationMatch + status | Judgment/risk | Low is good; high means auditor overriding geo warnings |

**Source basis:** Tekmon, iFieldSmart, Vitruvi KPI articles; SLA monitoring practice from Docsumo/Sirion; auditor-specific metrics are bayrak.ai-specific adaptations of generic field QC patterns (no construction-specific auditor SLA standard found in literature — HIGH confidence that these are the right metric shapes, MEDIUM confidence on exact benchmark numbers).

---

## 2. Earned Value Management (EVM) — Pragmatic Subset

### Core EVM Primitives (adapted for BOQ-based subcontractor)

EVM's full PMI/ANSI 748 implementation is overkill for a subcontractor. The pragmatic subset that maps onto bayrak.ai's data model:

| Metric | Standard name | Formula | bayrak.ai data mapping |
|--------|-------------|---------|----------------------|
| **Budget at Completion** | BAC | `SUM(plannedQty × unit_price)` per BOQ item | `boq_item.plannedQty × boq_item.unit_price` |
| **Planned Value** | PV / BCWS | `BAC × (expected_completion_fraction_at_reporting_date)` | Requires a project schedule / planned S-curve — **data gap** |
| **Earned Value** | EV / BCWP | `SUM(approvedQty × unit_price)` per BOQ item | `boq_item.approvedQty × boq_item.unit_price` — directly computable from existing data once unit_price is added |
| **% Complete by value** | — | `EV / BAC × 100` | Core progress metric; replaces quantity-only % complete |
| **% Complete by quantity** | — | `SUM(approvedQty) / SUM(plannedQty) × 100` | Already computable without unit_price |
| **Schedule Performance Index** | SPI | `EV / PV` | Requires PV (planned S-curve) — needs schedule data |
| **Cost Performance Index** | CPI | `EV / AC` | Requires actual cost tracking — **data gap** (no labor/material cost capture yet) |
| **Value at Risk** | — | `SUM(rejectedQty × unit_price)` | Rework/rejection cost; easily computed from existing data once unit_price added |

### Pragmatic v2 Recommendation

**Build these immediately** (data exists or will exist after unit_price migration):

1. `EV = SUM(approvedQty × unit_price)` — Earned Value by BOQ item and total
2. `BAC = SUM(plannedQty × unit_price)` — Contract value baseline
3. `% complete by value = EV / BAC` — Most meaningful progress metric
4. `% complete by quantity = approvedQty / plannedQty` — Already available
5. `Rework value = SUM(rejectedQty × unit_price)` — Cost of quality failures
6. `Per-worker value contribution = SUM(worker.approved × unit_price)` — Who produces how much contractual value

**Defer these** (require data not yet captured):

- Full SPI: needs project schedule / S-curve (planned completion dates per BOQ item)
- Full CPI: needs actual cost tracking (labor hours × wage, materials invoiced) — a separate data collection workflow
- EAC (Estimate at Completion): derived from CPI; defer until AC is available

**EVM benchmarks** (from famcod.com 2026 EVM guide, HIGH confidence):
- CPI > 0.95: cost-efficient
- CPI 0.90–0.95: cost recovery planning needed
- CPI < 0.90: executive escalation required
- SPI > 0.90: schedule acceptable
- SPI < 0.90: schedule mitigation needed

These thresholds apply once full EVM is implemented. For v2, use `% complete by value` as the primary health signal.

---

## 3. Turkish Hakkediş (Hakediş) — Mechanics

### Definition

A **hakkediş** (also spelled hakediş) is a periodic (typically monthly) progress payment certificate prepared by the contractor/subcontractor documenting the monetary value of work completed. It is both the measurement document and the invoice trigger. The Turkish term derives from "hak etmek" (to earn/deserve) — it represents what the subcontractor has earned.

**Sources:** sanalsantiye.com, amp.com.tr, interax.com.tr, opwire.app, insaatgundemi.com

### Key Terms Glossary

| Turkish term | English equivalent | Meaning |
|-------------|-------------------|---------|
| Birim fiyat | Unit price | Contract-agreed price per unit of work (m, m², m³, kg, adet) |
| Keşif | Estimate / scope | Original project cost estimate derived from BOQ × unit prices; the contractual baseline |
| Metraj | Measurement / quantity takeoff | Field measurement of quantities actually completed per period |
| Yeşil defter | Green book | Cumulative quantity register; tracks total-to-date + previous periods + current period per line item |
| Dönem | Period | Payment period, typically monthly (aylık) |
| Kümülatif miktar | Cumulative quantity | Total approved quantity from project start to current period |
| Bu dönem miktarı | Current period quantity | Kümülatif − önceki dönem kümülatif = this period's work |
| KDV | VAT (Katma Değer Vergisi) | Value Added Tax applied on top of net hakkediş amount |
| KDV tevkifatı | VAT withholding | Fraction of KDV withheld by the client/employer and paid directly to tax authority |
| Stopaj | Income/corporate tax withholding | Tax withheld from subcontractor's gross payment by the employer on behalf of the state |
| Teminat kesintisi | Retention | Security holdback from each interim hakkediş; released on final acceptance |
| Avans kesintisi | Advance recovery | Deduction to recover mobilization advance previously paid |
| Fiyat farkı | Price adjustment | Cost-index-based escalation for inflation, per contract clause |
| İcmal | Summary statement | Line-item summary of all work groups and their values |
| Ataşman | Attachment document | Field measurement records used as evidence for metraj calculations |
| Kesin hakkediş | Final hakkediş | Last payment certificate on project completion; retention released |

### Hakkediş Document Structure (Teklif Birim Fiyat / Unit Price Contract)

A standard hakkediş package contains (from amp.com.tr, HIGH confidence):

1. **Ön kapak** — Cover page: contract details, period, contractor, total amounts
2. **Dizi pusulası** — Document index
3. **Metraj cetvelleri** — Measurement schedules per work item
4. **Yeşil defter** — Cumulative register: `[Item | Toplam Miktar | Önceki Miktar | Bu Dönem Miktar]`
5. **Yapılan işler listesi / fiyat icmali** — Work completed list: `Bu Dönem Miktar × Birim Fiyat = Dönem Tutarı`
6. **Fiyat farkı hesabı** — Price adjustment (if contract has escalation clause)
7. **İcmal** — Overall summary by work group
8. **Arka kapak / ödeme cetveli** — Back cover: gross amount, KDV, deductions, net payment

### Quantity Structure (Critical for Software Implementation)

```
Yeşil Defter per BOQ line item:
  - Toplam kümülatif miktar  (total approved to date)
  - Önceki hakkediş miktarı  (approved as of previous period)
  - Bu dönem miktarı         (= Toplam − Önceki)

Financial:
  - Bu dönem tutarı          (= Bu dönem miktarı × birim fiyat)
  - Toplam hakkediş tutarı   (= Toplam kümülatif × birim fiyat)
  - Bu hakkediş tutarı       (= Toplam − Önceki hakkediş tutarı)
```

### Payment Calculation — Current Rates (2024–2025)

**Base KDV rate: 20%** (raised from 18% to 20% effective July 10, 2023 per Presidential Decree published Official Gazette July 7, 2023. Confirmed by EY, PwC Turkey, Sovos, Global VAT Compliance.)

**KDV tevkifat: 4/10** of calculated KDV, withheld by the employer on yapım işleri (construction works). Applied where the KDV-dahil invoice value ≥ 5,000,000 TL (2024 threshold per ozbekcpa.com and karenaudit.com). Below threshold: full KDV collected by contractor. The employer pays the withheld 4/10 directly to the tax office via KDV-2 declaration; the contractor receives 6/10 of KDV and pays the remainder.

**Stopaj: 5%** on yıllara yaygın (multi-year, spanning calendar years) inşaat ve onarım works. Applied to the gross hakkediş amount (before KDV). Rate changed from 3% to 5% effective March 1, 2021 by Presidential Decree 3491. Confirmed by PwC Turkey, EY, KPMG, Grant Thornton. For single-year construction contracts, stopaj does not apply; only multi-year contracts.

**Teminat kesintisi: 5%** — retained from every interim hakkediş (except the final kesin hakkediş). Released upon geçici kabul (provisional acceptance). This is the standard rate for public procurement contracts per Law 4734; private contracts may vary (4–10% range).

**Avans kesintisi:** Recovers mobilization advance; rate and schedule per contract (commonly 10–20% of hakkediş amount until fully recovered).

**Damga vergisi (stamp tax):** 0.948‰ (per mille) of the hakkediş amount — small, often ignored in software but present in formal documents.

### Worked Calculation Example

For a single-period hakkediş on a multi-year yapım işleri contract above the 5M TL threshold:

```
Gross dönem tutarı (net of scope)     = 750,000 TL
KDV (20%)                             = 150,000 TL
KDV dahil toplam                      = 900,000 TL
  KDV tevkifat (4/10 × 150,000)       =  60,000 TL  (paid by employer to tax office)
  KDV net (6/10 × 150,000)            =  90,000 TL  (received by contractor)

Stopaj (5% × 750,000)                 =  37,500 TL  (withheld by employer)
Teminat kesintisi (5% × 750,000)      =  37,500 TL  (held in retention)
Avans kesintisi (10% × 750,000)       =  75,000 TL  (recovery of advance)

Net ödeme (contractor receives):
  = 750,000 + 90,000 − 37,500 − 37,500 − 75,000
  = 690,000 TL
```

**Sources:** muhasebetr.com worked example; ozbekcpa.com for 4/10 rate; EY / PwC Turkey for 20% KDV and 5% stopaj; karenaudit.com for 5M TL threshold; sanalsantiye.com / amp.com.tr for document structure and 5% teminat.

---

## 4. Admin Analytics Dashboard — Conventions

### What an Effective Operations Command Center Shows

Based on operations dashboard research (FlyDash, Domo, InetSoft, GCom Solutions) and construction-specific KPI dashboard analysis (Projul, SmartPM, BoldBI):

**Structure pattern:** Summary KPIs at top → trend charts in middle → activity feed / alerts at bottom → drill-down navigation

**Top-level overview (portfolio level):**
- Active project count, total pipeline length tracked
- Portfolio EV / BAC (% complete by value across all projects)
- Total pending_audit count (backlog alert)
- Total approvals and rejections in current rolling period (7d / 30d)
- Active worker count (workers with ≥ 1 submission in last 7 days)
- Alert flags: projects with SLA breaches, rejection spikes, stalled progress

**Project drill-down:**
- BOQ progress per line item (planned qty, approved qty, % complete, EV vs BAC)
- Throughput trend chart (approvals per day over rolling 30 days)
- Map view of approved submissions on pipeline route (inherited from v1)
- Per-auditor decision stats for this project

**People / employee profile pages:**
- Worker: approval rate, rejection rate, output rate, value contribution, location compliance, submission history timeline
- Auditor: decision throughput, approval/rejection split, avg turnaround time, backlog trend, SLA breach count
- Office engineer: activity log (requires new table to capture office actions)

**Alert types:**
- Submission pending > N hours without auditor decision (configurable threshold, default 4h)
- Rejection rate spike (worker or project rejection rate > threshold in rolling window)
- Location warning spike (locationMatch='far' submissions rising)
- Stalled project (no approved submissions in > 48h on an active project)
- BOQ item approaching depletion (approvedQty > 80% of plannedQty — triggers planning alert)

**Global filters (essential UX):** date range, project, person, status — applied across all views

---

## 5. Export Expectations

### What Office / Finance Teams Expect

Based on construction industry BOQ export conventions and Turkish hakkediş practice:

**Excel exports (table stakes):**
- BOQ progress report: line items with plannedQty, approvedQty, remaining, % complete, EV (if unit_price set), BAC
- Submission log: worker, project, BOQ item, qty, status, submittedAt, decidedAt, auditor, rejection reason, locationMatch flag — filterable by date range / project / status
- Worker performance report: per worker × per project: submission count, approval rate, rejection rate, output rate, value contribution
- Auditor performance report: per auditor × per project: decision count, approval/rejection split, avg turnaround

**Hakkediş Excel (differentiator for v2):**
- Yeşil defter format: cumulative register per BOQ line item with previous period and current period quantities
- Fiyat icmali: this period quantities × unit prices = period amounts per line item
- Summary tab: gross amount, KDV (20%), KDV tevkifat (4/10), stopaj (5%), teminat (5%), avans kesintisi, net ödeme
- Bilingual TR/EN headers (per project locale setting)

**PDF exports (hakkediş certificate):**
- Formal hakkediş ön kapak + icmal + payment summary as PDF
- Used for client submission and accountant filing
- Requires a PDF generation library (e.g., `@react-pdf/renderer` or `puppeteer`)

---

## Feature Landscape

### Table Stakes (v2 Must-Haves)

Features the office engineer expects after v1 is live. Missing these = "we have data but can't use it."

| Feature | Why Expected | Complexity | Data Dependencies |
|---------|--------------|------------|-------------------|
| Add `unit_price` to BOQ items | All cost features require it; without it v2 has no financial layer | LOW | None — schema migration + dashboard form field |
| BOQ progress dashboard (qty + value %) | Office engineer's primary status check — currently has qty only | LOW | unit_price migration |
| Per-worker performance scorecard | Manager wants to know who is productive and who has quality issues | MEDIUM | Existing submission data; no new collection needed |
| Per-auditor performance scorecard | Identify slow/fast auditors; detect backlogs | MEDIUM | decidedAt already captured |
| Pending backlog view with age | Office must see submission queue state at a glance | LOW | status + submittedAt already exist |
| SLA alert: audit pending > threshold | Slow audits block the loop; office must be notified | MEDIUM | Requires background job or on-load computation |
| Global date-range + project filter | Without filtering, all analytics are useless on multi-period, multi-project data | MEDIUM | Filter state management in dashboard |
| Submission log export (Excel) | Finance and site managers need records for external reporting | LOW | ExcelJS already in stack |
| Worker performance report (Excel) | Payroll / HR review — the most requested field-ops export | LOW | ExcelJS |
| Hakkediş period management (create / close periods) | Accounting needs to know which submissions fall in which billing period | MEDIUM | New `hakedis_periods` table; link submissions to period |
| Hakkediş line item calculation (yeşil defter) | Core of Turkish billing; client submits this as payment claim | HIGH | unit_price + periods table + cumulative qty logic |
| Hakkediş summary (gross → deductions → net) | Accountant prepares actual payment from this | MEDIUM | Deduction rates configurable per contract |
| Hakkediş Excel export | The deliverable the office actually sends to the main contractor | MEDIUM | ExcelJS; bilingual headers |
| Navigation IA restructure (admin shell) | Current dashboard is v1 flat; v2 has too many sections for no nav | MEDIUM | Shell layout component only |

### Differentiators (v2 Competitive Advantage)

Features beyond Excel-tracker parity that make bayrak.ai distinctly better.

| Feature | Value Proposition | Complexity | Data Dependencies |
|---------|-------------------|------------|-------------------|
| Earned value % complete (value-based, not qty-based) | % complete by value is more meaningful than by quantity for financial reporting | LOW | unit_price |
| Per-worker value contribution (EV per worker) | Shows who produced how much contractual value — not just submission count | LOW | unit_price + approvedQty per worker |
| Rejection cost / rework value | `rejectedQty × unit_price` = cost of quality failures; management rarely sees this number | LOW | unit_price + rejected submissions |
| Auditor turnaround trend chart | Visual trend (not just average) surfaces daily patterns; field teams know if auditor is consistently slow on Fridays | MEDIUM | decidedAt − submittedAt per submission |
| Location compliance heatmap / trend | Geo-quality degrading over time (more 'far' matches) signals GPS or route problems before they become submission errors | MEDIUM | locationMatch field, already captured |
| Employee profile pages (worker + auditor) | Per-person view with timeline and trend — replaces manual lookup in submission log | HIGH | Requires profile page route + aggregation queries |
| Hakkediş PDF certificate export | Formal document delivery; avoids the office re-formatting Excel into Word | HIGH | react-pdf or puppeteer; Turkish tax deduction formatting |
| Drill-down: every metric → underlying records | Click on "12 rejections" → see the 12 rejection records with reasons; closes the analytics→action loop | HIGH | Route-level filtering, not just dashboard aggregation |
| Bilingual TR/EN exports | Multinational contractor or international finance team can read the same report | LOW | next-intl message keys in ExcelJS column headers |
| BOQ depletion alert (approaching 100% planned qty) | Proactive — before BOQ item runs out of planned quantity, office can issue variation order | LOW | approvedQty / plannedQty threshold check |

### Anti-Features (Over-Engineering to Avoid for Solo MVP)

| Anti-Feature | Why Requested | Why to Avoid (Solo MVP) | What to Do Instead |
|--------------|--------------|------------------------|-------------------|
| Full PMI EVM (SPI, CPI, EAC, BAC, TCPI) | "We should do proper earned value" | SPI requires a project schedule baseline (S-curve) not yet captured; CPI requires actual cost tracking (separate data collection); implementing all 7 EVM metrics without the input data produces meaningless numbers | Implement EV, BAC, % complete by value; label SPI/CPI as "coming when schedule data is added" |
| Real-time dashboard (WebSocket/SSE) | Analytics feel "live" | Adds infrastructure (pub-sub, persistent connections); construction audits happen hourly, not by the second; polling on page focus is sufficient | 60-second poll or focus-refresh; upgrade to SSE in v3 if office users request it |
| AI-generated narrative summaries of KPIs | "Explain what the numbers mean" | LLM cost per dashboard load; hallucination risk on financial figures; adds latency | Plain chart labels and contextual color coding (red/amber/green) communicate state without LLM |
| Gantt / TILOS time-distance chart | Project managers expect it | Specialized visualization; requires schedule data not yet captured; high implementation cost | The BOQ progress + map combination covers the v2 need; add time-axis in v3 |
| Worker leaderboard with public ranking | "Motivate the crew" | Privacy concerns in Turkish labor law context; can create adversarial dynamics; solo MVP risk is building features before core analytics are proven | Per-manager scorecard views (visible to office, not to workers) are the v2 scope |
| Advanced retention / fiyat farkı escalation calculator | Some contracts have complex inflation formulas | Fiyat farkı requires monthly coefficient tables from Turkish government (BIM/KGM indices); significant domain complexity; affects a minority of private subcontracts | Expose a manual override field for fiyat farkı amount; full auto-calculation is a v3 feature |
| Multi-currency / multi-company hakkediş | "We might work for foreign contractors" | Single-tenant, single-currency (TRY) MVP; multi-currency is a tenancy-level concern | TRY only; USD/EUR invoicing is v3+ with multi-tenant chassis |
| Automated email/Telegram digest of KPIs | "Send us a weekly report" | Notification infrastructure (queue, schedule) is overhead; primary value is the dashboard — push is secondary | Office engineer checks the dashboard actively; a simple export-and-email workflow covers the gap |
| Full audit log / change history on all records | Compliance/accountability | Heavy to implement correctly (immutable log, event sourcing); v1 data has no change history baseline | Append-only submission + decision events already serve as the audit trail; no additional audit log table needed |

---

## Feature Dependencies

```
[unit_price on boq_item]
    └──required by──> [EV / BAC / % complete by value]
    └──required by──> [Rework value (rejected qty × unit_price)]
    └──required by──> [Per-worker value contribution]
    └──required by──> [Hakkediş line item calculation]

[Hakkediş period management (periods table)]
    └──required by──> [Hakkediş line item / yeşil defter]
    └──required by──> [Hakkediş summary (gross → deductions → net)]
    └──required by──> [Hakkediş Excel export]
    └──required by──> [Hakkediş PDF certificate]

[Hakkediş line item / yeşil defter]
    └──required by──> [Hakkediş Excel export]
    └──required by──> [Hakkediş PDF certificate]

[Navigation IA restructure (admin shell)]
    └──required by──> [All new v2 pages] (without nav shell, pages are unreachable)

[Global filters (date-range / project / person)]
    └──enhances──> [All scorecards and analytics views]

[Per-worker scorecard]
    └──leads to──> [Employee profile pages] (profile is the drill-down of the scorecard)

[Pending backlog view]
    └──leads to──> [SLA alert system] (alerts surface the same data proactively)

[Office engineer activity log (new table)]
    └──required by──> [Office engineer scorecard]
    └──enables──> [Full role-based performance coverage (worker + auditor + OE)]

[Submission log]
    └──required by──> [Submission log Excel export]
    └──required by──> [Worker performance Excel export]
    └──required by──> [Auditor performance Excel export]
```

### Dependency Notes

- **unit_price is the critical path blocker:** All financial features (EV, BAC, hakkediş value calculations, per-worker value contribution, rework cost) are blocked until `unit_price` is added to `boq_items`. This must be the first task of v2, not the last.
- **Periods table gates the entire hakkediş billing flow:** A `hakedis_periods` table (id, project_id, period_label e.g. "2026-05", startDate, endDate, status: open/closed) links submissions to payment periods. Without it, yeşil defter (cumulative vs current period split) cannot be computed.
- **Admin shell IA is a prerequisite for usability:** Six new sections (Overview · Projects · People · Analytics · Hakkediş · Exports) need a persistent sidebar/nav before any page is useful. Build this early.
- **Office engineer activity log is a new data collection surface:** Currently no office actions are logged. To make OE performance measurable, a lightweight `office_activity_log` table (userId, action, entityId, entityType, createdAt) must be added and populated by dashboard actions (project create/edit, BOQ edit, period open/close, export).
- **PDF export depends on hakkediş calculation being complete:** Do not start PDF before the Excel hakkediş is working and validated. PDF is a rendering concern, not a calculation concern.

---

## MVP Definition for v2.0

### Launch With (v2.0 core)

Minimum set to deliver "admin-grade operations console" as stated in PROJECT.md:

- [ ] `unit_price` on boq_items — schema migration + dashboard edit form
- [ ] Navigation IA restructure (admin shell with sidebar: Overview · Projects · People · Analytics · Hakkediş · Exports)
- [ ] Admin command-center overview: pending backlog count, total approvals/rejections (rolling 30d), active workers, EV/BAC across projects
- [ ] Global filters: date-range, project, person, status
- [ ] BOQ progress view (qty-based % + value-based % once unit_price added)
- [ ] Per-worker scorecard: approval rate, rejection rate, output rate, value contribution, location compliance
- [ ] Per-auditor scorecard: decision throughput, approval/rejection split, avg turnaround, pending backlog, SLA breach count
- [ ] Pending backlog view with submission age (time since submittedAt)
- [ ] SLA alert: highlight submissions pending > 4h
- [ ] Hakkediş period management: create/close periods (links submissions to period by submittedAt or decidedAt)
- [ ] Hakkediş yeşil defter calculation: cumulative qty, previous period qty, this period qty per BOQ item
- [ ] Hakkediş fiyat icmali: this period qty × unit_price per item = period value
- [ ] Hakkediş summary: gross → KDV (20%) → KDV tevkifat (4/10) → stopaj (5%) → teminat (5%) → avans kesintisi (configurable) → net ödeme
- [ ] Hakkediş Excel export (bilingual TR/EN)
- [ ] Submission log Excel export (filterable)
- [ ] Worker + auditor performance Excel export

### Add After v2.0 Validation (v2.x)

- [ ] Employee profile pages (worker + auditor) with activity timeline — trigger: office users want to look up individuals
- [ ] Drill-down from every metric to underlying submission records
- [ ] Hakkediş PDF certificate export — trigger: client requests formal document delivery
- [ ] Trend charts (throughput over time, rejection rate trend, turnaround trend)
- [ ] BOQ depletion alert (approvedQty approaching plannedQty)
- [ ] Office engineer activity log table + OE scorecard
- [ ] Rejection cost / rework value dashboard card

### Defer to v3+ (Future Consideration)

- [ ] Full EVM (SPI, CPI, EAC) — requires project schedule baseline and actual cost capture
- [ ] Fiyat farkı auto-calculation — requires monthly government coefficient tables
- [ ] Hakkediş PDF with advanced formatting and stamp-tax line
- [ ] Multi-tenant hakkediş with per-tenant contract settings
- [ ] AI KPI narrative / anomaly explanation

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| unit_price schema migration | HIGH | LOW | P1 |
| Admin shell navigation IA | HIGH | MEDIUM | P1 |
| Command-center overview (pending backlog, KPIs) | HIGH | MEDIUM | P1 |
| BOQ progress (qty + value %) | HIGH | LOW | P1 |
| Per-worker scorecard | HIGH | MEDIUM | P1 |
| Per-auditor scorecard + SLA alert | HIGH | MEDIUM | P1 |
| Global filters | HIGH | MEDIUM | P1 |
| Hakkediş period management | HIGH | MEDIUM | P1 |
| Hakkediş yeşil defter + fiyat icmali | HIGH | HIGH | P1 |
| Hakkediş deduction summary (KDV/stopaj/teminat) | HIGH | MEDIUM | P1 |
| Hakkediş Excel export (bilingual) | HIGH | MEDIUM | P1 |
| Submission log Excel export | MEDIUM | LOW | P1 |
| Worker/auditor performance Excel export | MEDIUM | LOW | P1 |
| Employee profile pages | MEDIUM | HIGH | P2 |
| Drill-down metric → records | HIGH | HIGH | P2 |
| Trend charts | MEDIUM | MEDIUM | P2 |
| Hakkediş PDF certificate | MEDIUM | HIGH | P2 |
| BOQ depletion alert | MEDIUM | LOW | P2 |
| Rework value / rejection cost card | MEDIUM | LOW | P2 |
| Office engineer activity log | LOW | MEDIUM | P3 |
| Full EVM (SPI/CPI) | LOW | HIGH | P3 |

---

## Sources

- **KPI conventions:** [Procore — 8 Key Construction KPIs](https://www.procore.com/library/construction-kpis); [iFieldSmart — Top Metrics for Field Productivity](https://www.ifieldsmart.com/blogs/top-metrics-you-need-to-track-to-optimize-construction-field-productivity/); [Vitruvi — Construction KPIs](https://vitruvisoftware.com/blog/construction-kpis); [Tekmon — Quality Control KPIs](https://www.tekmon.com/quality-control-kpi); [InetSoft — Subcontractor Dashboard KPIs](https://www.inetsoft.com/info/subcontractor-software-kpi-dashboards/)
- **EVM:** [famcod.com — EVM in Construction 2026](https://famcod.com/earned-value-management-in-construction-evm-2026/); [projectengineer.net — Guide to EVM](https://www.projectengineer.net/guide-to-earned-value-management/)
- **Dashboard conventions:** [FlyDash — Operations Dashboard Examples](https://flydash.io/blogs/operations-dashboard-examples); [Projul — KPI Dashboard Guide](https://projul.com/blog/construction-kpi-dashboards-real-time-reporting-guide/); [Domo — KPI Dashboards](https://www.domo.com/learn/article/kpi-dashboards); [Mobisoftinfotech — Command Center Operations](https://mobisoftinfotech.com/resources/blog/transportation-logistics/command-center-operations-dashboard-alerts-decision-loops)
- **Hakkediş document structure:** [amp.com.tr — Teklif Birim Fiyat Hakediş](https://www.amp.com.tr/makaleler/teklif-birim-fiyat-hakedis-nasil-yapilir-yapim-isleri-ornek-hakedis-uygulamasi); [sanalsantiye.com — Hakkediş Terimleri](https://www.sanalsantiye.com/bir-hakediste-karsilasilabilecek-terimler-ve-anlamlari/); [sanalsantiye.com — Adım Adım Hakediş](https://www.sanalsantiye.com/adim-adim-hakedis/); [insaatgundemi.com — Hakediş Nedir](https://www.insaatgundemi.com/hakedis.html); [opwire.app — Hakediş Nasıl Yapılır](https://www.opwire.app/blog/hakedis-nasil-yapilir/); [interax.com.tr — Hakediş Nedir](https://www.interax.com.tr/hakedis-nedir-nasil-yapilir)
- **KDV rate (20% from July 2023):** [EY — Türkiye Increases VAT Rates](https://www.ey.com/en_gl/technical/tax-alerts/turkiye-increases-vat-rates-on-goods-and-services); [PwC Turkey — VAT Rate Changes](https://www.pwc.com.tr/en/hizmetlerimiz/vergi/bultenler/2023/vat-rate-changes.html); [Sovos — Türkiye VAT Rate Increase](https://sovos.com/regulatory-updates/vat/turkiye-increases-vat-rates-effective-july-10-2023/)
- **KDV tevkifat 4/10 and threshold:** [ozbekcpa.com — VAT Withholding Rates Turkey 2025](https://ozbekcpa.com/types-of-vat-withholding-and-rates-2025-updated-guide-turkey/); [hakedis.org — KDV Tevkifat Değişti](https://www.hakedis.org/insaat-islerinde-kdv-tevkifat-orani-degisti/); [karenaudit.com — 2024 Yapım İşleri Tevkifat](https://www.karenaudit.com/2024-yapim-islerinde-kdv-tevkifat-siniri-ve-tevkifat-orani-nedir/)
- **Stopaj 5% (from March 2021):** [EY — Turkey Amends Multi-Year Construction WHT](https://taxnews.ey.com/news/2021-0259-turkey-amends-tax-laws-on-deduction-of-financial-expenses-and-withholding-rates-on-multi-year-construction-works); [PwC Turkey — Stopaj %5](https://www.pwc.com.tr/tr/hizmetlerimiz/vergi/bultenler/2021/yillara-yaygin-insaat-isleri-istihhaklarinda-stopaj-orani-yuzde-5.html); [KPMG Turkey — Stopaj Artışı](https://kpmgvergi.com/yayinlar/mali-bultenler/vergi/yillara-sari-insaat-ve-onarim-islerinde-stopaj-orani-5-e-yukseltildi/1031); [Grant Thornton Turkey — Stopaj %5](https://www.grantthornton.com.tr/vergi-sirkuleri/2021-vergi-sirkuleri/yillara-yaygin-insaat-ve-onarim-islerine-iliskin-vergi-tevkifati-orani/)
- **Worked hakkediş calculation:** [muhasebetr.com — Hak Edişler Stopaj ve KDV Tevkifatı](https://www.muhasebetr.com/yazarlarimiz/mustafaakcayir/047/)

---

*Feature research for: bayrak.ai v2.0 — Operations Intelligence & Hakkediş milestone*
*Researched: 2026-05-25*
