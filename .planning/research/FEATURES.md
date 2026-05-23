# Feature Research

**Domain:** Field-ops platform for linear-infrastructure construction subcontractors — conversational bot capture, supervisor approval, BOQ tracking, geospatial progress on pipeline routes, AI inspection assist
**Researched:** 2026-05-23
**Confidence:** HIGH (all categories grounded in official product research, industry analysis, and the proven saha sibling project)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features the loop breaks without. "Table stakes" here means: if this is missing, the product is not usable by its target role.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Guided step-by-step bot submission (photo → location → quantity → notes → confirm) | Workers expect the bot to tell them exactly what to do next; free-form input fails in field conditions | MEDIUM | grammY conversation plugin handles state machine; each step must validate type before advancing |
| Inline keyboard project selection | Workers are assigned to multiple projects; unambiguous selection prevents wrong-project submissions | LOW | grammY inline keyboard; project list fetched from DB by Telegram user ID |
| Native Telegram location share enforcement | GPS from Telegram is the only reliable, tamper-resistant location input on a phone; manual text coordinates are not acceptable | MEDIUM | Telegram `message.location` type; bot must explicitly reject text input at the location step |
| Photo requirement enforcement | Photo is the primary audit evidence; optional photo = no audit value | LOW | `message.photo` type check; prompt user to resend as image if text received |
| Numeric quantity enforcement | Quantity is the unit of BOQ deduction; non-numeric or text input causes downstream calculation failures | LOW | Regex/parseFloat check; reprompt on invalid input |
| Pending audit status on submission | Auditors and office engineers need to know submissions are awaiting verification; no status = no oversight | LOW | `status: pending_audit` on insert; core to the state machine |
| Webhook-triggered Telegram notification to auditor | Auditor must receive notification immediately; polling or email would miss the field rhythm | MEDIUM | Telegram `sendMessage` to auditor chat ID; includes photo, map link, quantity, notes |
| Inline Approve/Reject buttons on auditor notification | Auditor must be able to act from their phone without opening a separate app; text-based approval has no audit trail | MEDIUM | grammY callback query handlers; `callback_query:data` with submission ID |
| Reject reason prompt and worker notification | Worker must know why a submission was rejected to correct and resubmit; silent rejection causes rework | LOW | Follow-up `sendMessage` to auditor asking for reason; then notify worker with reason |
| BOQ line item decrement on approval | The core operational output — approved work reduces remaining quantity; without this the office still manually tracks in Excel | HIGH | Transactional: approval update + BOQ decrement in one DB transaction to prevent drift |
| Office dashboard: project and BOQ management | Office engineers create projects, define BOQ line items, assign workers/auditors; without this, the system cannot be configured | HIGH | Next.js App Router pages; Drizzle schema for projects, boq_items, user_assignments |
| GeoJSON route upload | The pipeline route is the spatial backbone; without it there is nothing to project submissions onto | MEDIUM | File upload → parse GeoJSON LineString → store geometry in PostGIS |
| PostGIS nearest-segment matching | Submission GPS must resolve to a pipeline segment to produce the map overlay and enable segment-level BOQ tracking | HIGH | `ST_ClosestPoint` / `ST_LineLocatePoint` on LineString geometry; requires PostGIS extension on Neon |
| Map overlay of approved submissions | Office engineers expect to see verified work on the map — this is the live progress view that replaces the Excel tracker | HIGH | Mapbox GL JS; approved submissions rendered as point markers or colored LineString segments |
| Email magic-link auth for office engineers | Office engineers need secure, low-friction login; password resets in a small team are an operational burden | LOW | Auth.js with email provider; existing saha pattern |
| Turkish-language worker bot | Workers are Turkish speakers; English bot text causes friction and adoption failure | LOW | All grammY reply strings in Turkish; i18n namespace for bot copy |

### Differentiators (Competitive Advantage)

Features that set bayrak.ai apart from generic forms apps, WhatsApp, or spreadsheets — and from the sibling saha project.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Formal on-site auditor approval gate via Telegram | Transforms unverifiable WhatsApp messages into a two-step verified loop; auditor is the human check between claim and record | MEDIUM | Auditor approval is the trust mechanism that justifies BOQ deduction; without it, quantity data is unverified |
| Real geospatial layer (PostGIS + GeoJSON + GPS) | Submissions are located on the actual pipeline route, not a CAD pin; enables segment-level progress queries and spatial anomaly detection | HIGH | Core differentiator over saha (which uses manual CAD pins); requires PostGIS on Neon + Mapbox GL JS |
| Automatic BOQ deduction on auditor approval | Approved work immediately reduces remaining quantity in the BOQ; office always sees real verified quantities without manual entry | HIGH | Depends on: approval gate + work-to-line-item mapping; transactional DB update |
| Linear-infrastructure-specific map view | Progress shown as colored segments along a pipeline route, not generic pin maps; matches how engineers think about pipeline work | HIGH | Mapbox `setPaintProperty` on LineString segments keyed by chainage/segment ID; segment coloring by approval status |
| AI vision/anomaly assist for auditor decision support | Flags when submitted photo and GPS location do not match the claimed segment; helps auditor decide remotely before physical visit | HIGH | Vercel AI SDK + Claude vision; compares photo content + GPS proximity to pipeline route; produces a flag + reason text; requires eval harness |
| Conversational state-machine bot (not a form app) | Native Telegram UX means zero app install friction for field workers; conversational flow is more resilient to partial input than a form | MEDIUM | grammY scenes or conversation plugin for state; Telegram already installed on worker phones |
| TR/EN switchable dashboard | Bilingual from day one signals professionalism for a Turkish/international mixed office team | LOW | next-intl; TR default, EN available; bot stays Turkish-only in v1 |
| GPS-proximity validation at submission time | Bot warns worker if submitted location is far from known pipeline route before they confirm; catches accidental wrong-location submissions | MEDIUM | PostGIS distance query at submission; configurable threshold (e.g., > 200m from route = warning); depends on GeoJSON route upload |

### Anti-Features (Deliberately NOT Building for v1)

Avoid these. They add complexity without proving the core loop. Each has a rationale.

| Anti-Feature | Why Requested | Why Problematic | Alternative |
|--------------|---------------|-----------------|-------------|
| Hakkediş (interim payment certificate) PDF generation | Clients want payment docs | Heavy formatting logic, Turkish regulatory nuance, premature — loop not yet proven; saha already has it | Defer to v2; saha is the reference implementation |
| CAD/DWG viewer and manual pin-on-drawing mapping | Familiar to engineers | Superseded by the GeoJSON+PostGIS geospatial approach; CAD workflows are file-format hell; replaced by GeoJSON upload | GeoJSON LineString upload is the spatial source of truth |
| WhatsApp bot integration | Workers may prefer WhatsApp | Per-message fees, Meta API terms risk, complex webhook auth; Telegram is free and has better bot primitives | Telegram-only in v1 per saha ADR-0005 |
| H&S / legal / supplies form library | Field operations always generate forms | Out-of-scope complexity; bayrak.ai's core value is the comms+geo+audit loop, not a form CMS | Out of scope; saha has form library if needed |
| Multi-tenancy | Platform scale | Premature abstraction; single customer first; multi-tenant chassis is a known v2 path | Single-tenant v1; do not hardcode tenant identity (keep schema extensible) |
| Dedicated mobile-web auditor review UI | Better UX than Telegram for auditors | Telegram inline buttons cover v1; building a mobile web audit view adds a full front-end surface before the loop is validated | Telegram inline approval is the v1 auditor UX |
| Real-time dashboard map updates via WebSocket/SSE | "Live" feels better | Adds infrastructure complexity (pub-sub, persistent connections); map polling on approval is sufficient for a field team that approves hourly, not by the second | Poll on page focus or 60-second interval; upgrade to SSE in v2 if users request it |
| Offline bot submission with sync | Workers may lose signal | grammY state machine is server-side; offline-first requires a local queue (e.g., Telegram queues messages anyway); the Telegram client itself buffers messages when offline and sends on reconnect | Telegram's own message buffer handles momentary signal loss; no additional offline layer needed |
| Gantt / linear schedule view (TILOS-style time-distance diagram) | Project managers expect it | Specialized visualization; high implementation cost relative to v1 value; not the stated core value | The live map with colored segments replaces this for v1; add time-axis in v2 |
| AI auto-extraction of BOQ from uploaded drawings | Automating quantity takeoff | Heavy ML; requires training data; unreliable on Turkish engineering documents; saha ADR-0002 explicitly deferred this | Manual BOQ entry in the office dashboard; structured import from Excel as a v1.x addition |
| Offline-capable Progressive Web App (PWA) for workers | Better than bot for some users | Adds a parallel front-end that competes with the bot; GPS via PWA is less reliable than Telegram native location share | Telegram conversational bot is the worker surface for v1 |
| Per-worker performance dashboards / leaderboards | Management wants productivity visibility | Privacy concerns; not requested by the stated user; premature before core data is flowing | Aggregate project progress is sufficient for v1; worker-level reporting deferred |
| Push notification system (FCM / APNS) | Office engineers want alerts | Telegram webhooks already cover auditor and worker notifications; building a separate push system for office engineers duplicates infrastructure | Office engineers check the dashboard actively; email notification on new approved submission is a v1.x addition if requested |

---

## Feature Dependencies

```
[Worker Bot: project selection]
    └──requires──> [Worker identity: Telegram user ID → project assignment in DB]

[Worker Bot: GPS location step]
    └──requires──> [Native Telegram location share (message.location)]
                       └──powers──> [PostGIS nearest-segment matching]
                                        └──powers──> [Map overlay of approved submissions]
                                        └──powers──> [GPS-proximity validation at submission time]
                                        └──powers──> [AI anomaly flagging: location vs claimed segment]

[Auditor Approve action]
    └──requires──> [Pending submission with photo, location, quantity, notes]
    └──triggers──> [BOQ line item decrement]  ← MUST be transactional
    └──triggers──> [Map segment update]

[BOQ line item decrement]
    └──requires──> [Work-to-BOQ line item mapping] (which BOQ item does this submission decrement?)
    └──requires──> [Approval gate] (never decrement on pending)
    └──requires──> [Auditor Approve action]

[Map overlay of approved submissions]
    └──requires──> [GeoJSON route upload]
    └──requires──> [PostGIS nearest-segment matching]
    └──requires──> [Mapbox GL JS in dashboard]

[AI vision/anomaly assist]
    └──requires──> [Photo stored and accessible at vision inference time]
    └──requires──> [GPS coordinates from submission]
    └──requires──> [Pipeline route geometry for proximity check]
    └──requires──> [Vercel AI SDK + Claude vision model]
    └──enhances──> [Auditor approval decision] (flag presented alongside submission summary)

[Office dashboard: project + BOQ management]
    └──required before──> [Worker bot: project selection] (projects must exist)
    └──required before──> [GeoJSON route upload] (project must exist to attach route to)
    └──required before──> [BOQ line item decrement] (line items must exist)

[Auth.js email magic-link]
    └──gates──> [Office dashboard: all pages]
```

### Dependency Notes

- **BOQ decrement requires work-to-line-item mapping:** The submission flow must capture which BOQ line item the work counts against. This mapping can be done at submission time (worker selects activity type → system resolves to BOQ item) or at approval time (auditor assigns). For v1, resolve at submission: worker selects project → bot infers default BOQ item from project config. Explicit line-item selection by worker is a v1.x enhancement.
- **AI anomaly assist requires photo + GPS at inference time:** Photo is stored in Vercel Blob at submission; GPS is in the DB row. Both are available before auditor review. AI flag is generated asynchronously and attached to the auditor notification. If inference fails, auditor still gets the notification — AI is advisory, not a gate.
- **Map overlay requires both GeoJSON upload AND PostGIS matching:** If either is missing, map shows nothing. Office must upload GeoJSON before workers submit. Add a dashboard warning if a project has no route geometry.
- **Approval gate is the transaction boundary:** BOQ decrement and map update happen atomically on approval. Reject path must not decrement. Duplicate approval callbacks (Telegram may redeliver) must be idempotent.

---

## MVP Definition

### Launch With (v1)

Minimum set to prove the core loop: worker submits → auditor approves → BOQ decrements → map updates.

- [x] Worker identity: Telegram user ID mapped to project assignments
- [x] Conversational bot: step-by-step photo → location → quantity → notes → confirm (Turkish)
- [x] Bot enforces: photo required, native location required, numeric quantity required; reprompts on invalid
- [x] Inline keyboard project selection from assigned projects
- [x] On confirmation: persist with `status: pending_audit`, ping auditor
- [x] Auditor Telegram notification: photo, map link (Google Maps deep link from GPS), quantity, notes, Approve/Reject buttons
- [x] Approve → status approved, BOQ line item decrements (transactional), map updates
- [x] Reject → auditor provides reason, worker notified with reason, status rejected
- [x] Office dashboard: create/edit projects, define BOQ line items, assign workers and auditors
- [x] GeoJSON LineString upload per project
- [x] PostGIS nearest-segment matching on submission GPS
- [x] Mapbox map overlay: approved submissions as point markers on pipeline route
- [x] Auth.js email magic-link for office engineers
- [x] AI vision/anomaly assist: flag on photo/location mismatch, presented to auditor (advisory only; does not block approval)
- [x] TR/EN switchable dashboard; Turkish-only worker bot

### Add After Validation (v1.x)

Add when the core loop is proven and users request these:

- [ ] Explicit BOQ line item selection by worker during submission — trigger: multiple active BOQ items per project cause wrong-item mapping
- [ ] Email notification to office engineer on new approved submission — trigger: office users ask for push
- [ ] Worker submission history view in bot (last N submissions, status) — trigger: workers ask "did my submission go through?"
- [ ] Excel BOQ import — trigger: office engineers find manual entry slow for large BOQs
- [ ] Segment-level progress coloring on map (not just points) — trigger: office finds point markers insufficient for linear progress view
- [ ] GPS-proximity validation warning at submission time — trigger: submissions appearing far from route cause confusion
- [ ] Dashboard summary stats: total approved quantity vs BOQ per line item — trigger: obvious gap once data starts flowing

### Future Consideration (v2+)

Defer until product-market fit is established:

- [ ] Multi-tenancy — build after proving single-tenant, following saha ADR-0001 patterns
- [ ] Hakkediş PDF generation — saha reference implementation exists; add when billing loop is requested
- [ ] Mobile-web auditor review UI — richer than Telegram inline buttons; add when auditors need attachments or offline review
- [ ] Gantt / time-distance (TILOS-style) visualization — add when project managers request time-axis on top of the spatial view
- [ ] Worker-level performance reporting — add with privacy consideration
- [ ] WhatsApp bot — add only if Telegram adoption fails; separate infrastructure decision

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Worker bot: guided submission (all steps) | HIGH | MEDIUM | P1 |
| Worker identity + project assignment | HIGH | LOW | P1 |
| Pending audit status + auditor webhook | HIGH | LOW | P1 |
| Auditor Telegram approval/rejection | HIGH | MEDIUM | P1 |
| BOQ line item decrement on approval (transactional) | HIGH | HIGH | P1 |
| Office dashboard: project + BOQ management | HIGH | HIGH | P1 |
| GeoJSON route upload | HIGH | MEDIUM | P1 |
| PostGIS nearest-segment matching | HIGH | HIGH | P1 |
| Mapbox map overlay | HIGH | HIGH | P1 |
| Auth.js magic-link | MEDIUM | LOW | P1 |
| AI vision/anomaly assist | MEDIUM | HIGH | P1 (in scope per PROJECT.md) |
| TR/EN dashboard i18n | MEDIUM | LOW | P1 |
| GPS-proximity validation at submission | MEDIUM | MEDIUM | P2 |
| Segment-level map coloring | MEDIUM | MEDIUM | P2 |
| Worker submission history in bot | LOW | LOW | P2 |
| Excel BOQ import | MEDIUM | LOW | P2 |
| Dashboard progress stats per BOQ line | HIGH | LOW | P2 |
| Email notifications to office | LOW | LOW | P2 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

---

## Competitor Feature Analysis

| Feature | Generic Form Apps (SafetyCulture, TrueContext) | Pipeline-Specific (Vitruvi, TILOS, ArcGIS Pipeline) | bayrak.ai Approach |
|---------|----------------------------------------------|------------------------------------------------------|---------------------|
| Field data capture | Mobile form with photo, GPS, offline | Manual log or GIS desktop tool | Telegram conversational bot — zero install, Turkish-first |
| Supervisor approval | Email/dashboard review; no inline action | Not a primary feature | Telegram inline Approve/Reject — auditor acts from phone, on-site |
| BOQ/quantity tracking | Generic work order or cost tracking | BOQ management in desktop tool | Automatic decrement on auditor approval — no manual step |
| Geospatial progress | Geotagged photo pins on generic map | Time-distance (TILOS), GIS overlay (ArcGIS) | Approved submissions on Mapbox-rendered GeoJSON route — live, web-based |
| AI inspection assist | Safety PPE detection (SafetyCulture / DroneDeploy) | Not present | Photo + GPS anomaly flagging via Claude vision — advisory to auditor |
| Language | English-first | English-first | Turkish-first worker bot; TR/EN dashboard |
| Deployment | SaaS multi-tenant | SaaS enterprise | Single-tenant Vercel; no per-seat cost |

---

## Sources

- Vitruvi Software — Top Pipeline Construction Software Platforms (industry feature survey, 2025): https://vitruvisoftware.com/blog/top-pipeline-construction-software
- TrueContext — Field Teams Smarter Inspections with AI (table-stakes for AI-assisted field inspection): https://truecontext.com/blog/field-teams-smarter-inspections-ai-in-construction/
- Felt — Construction Site Inspections (standard inspection workflow features): https://felt.com/blog/construction-site-inspections
- Dan Cumberland Labs — AI-Powered Site Inspections reality check (what AI can and cannot do in construction): https://dancumberlandlabs.com/blog/ai-site-inspection-construction/
- Telegram Bot Features (official, grammY-compatible primitives): https://core.telegram.org/bots/features
- Mapbox GeoJSON & Live Data (live data source patterns): https://docs.mapbox.com/mapbox-gl-js/example/live-geojson/
- saha GLOSSARY.md — domain vocabulary (Branch, Chainage, BOQ, Hakkediş, Activity, Workflow Stage)
- bayrak.ai PROJECT.md — in/out of scope, constraints, validated decisions

---
*Feature research for: bayrak.ai — linear-infrastructure field-ops platform*
*Researched: 2026-05-23*
