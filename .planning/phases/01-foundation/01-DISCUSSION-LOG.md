# Phase 1: Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-23
**Phase:** 1-Foundation
**Areas discussed:** Worker/Auditor onboarding, BOQ entry method, Route (GeoJSON) ingestion, Data model & tenant hedge

---

## Worker/Auditor Onboarding

| Option | Description | Selected |
|--------|-------------|----------|
| Worker /starts bot → office approves | Bot captures Telegram ID on Start; person lands in pending list; office sets name/role/project | ✓ |
| Office types the Telegram ID | Manual numeric ID entry | |
| Invite code | Office generates code; worker sends to bot to self-link | |

**User's choice:** Worker /starts bot → office approves
**Notes:** Implies a minimal `/start` webhook handler must exist in Phase 1 to capture pending people; full conversational flow remains Phase 2.

---

## BOQ Entry Method

| Option | Description | Selected |
|--------|-------------|----------|
| Manual entry now, Excel import later | Add/edit line items by hand; defer importer | |
| Excel/CSV import in Phase 1 | Build importer now | |
| Both manual + import | Manual CRUD and importer in Phase 1 | ✓ |

**User's choice:** Both manual + import
**Notes:** Default applied for format — Excel `.xlsx` (ExcelJS) with downloadable template + preview/confirm; CSV deferred. Unit price omitted in v1.

---

## Route (GeoJSON) Ingestion

| Option | Description | Selected |
|--------|-------------|----------|
| Upload .geojson file, validate LineString | Server validates single WGS84 LineString (lng,lat) | ✓ |
| Paste GeoJSON text | Textarea paste + validate | |
| Draw route on a map | Draw line on Mapbox | |

**User's choice:** Upload .geojson file, validate LineString
**Notes:** Stored as `geometry(linestring,4326)`; generated Drizzle migration must be hand-edited from point→linestring.

---

## Data Model & Tenant Hedge

| Option | Description | Selected |
|--------|-------------|----------|
| Add nullable tenant_id now | Every domain table carries nullable tenant_id, one default tenant in v1 | ✓ |
| No tenant_id — add later | Pure single-tenant schema | |

**User's choice:** Add nullable tenant_id now
**Notes:** saha ADR-0001 lesson; negligible upfront cost, cheap multi-tenant migration later. No tenant UI in v1.

---

## Claude's Discretion

- BOQ import format (defaulted to Excel `.xlsx` + template), unit price omission, and CSV deferral.
- Office login security: defaulted to a mandatory email allowlist for magic-link (env or DB).
- Exact schema naming/indexes, dashboard IA, allowlist storage location, template column headers.

## Deferred Ideas

- Draw-route-on-map ingestion (revisit with Phase 5 Mapbox).
- CSV BOQ import.
- BOQ unit price (hakkediş / v2).
- Tenant-switching / multi-tenant UI (TEN-01, v2).
