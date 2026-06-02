/**
 * src/lib/landxml.ts — pure LandXML/InfraModel alignment parser.
 *
 * Extracts the first <Alignment> from a LandXML document and produces a densified
 * WGS84 polyline plus DESIGNED elevation per vertex and civil stationing:
 *   - Horizontal geometry: <CoordGeom> Line / Curve (arc, densified) / Spiral
 *     (clothoid — approximated linearly in v1, flagged in warnings).
 *   - Vertical geometry: <Profile><ProfAlign> PVIs (station, elevation).
 *     Evaluated piecewise-linear between PVIs; parabolic vertical curves
 *     (<ParaCurve>) are treated as their PVI (linear approximation, flagged).
 *   - Stationing: alignment @staStart + cumulative planar length.
 *
 * LandXML point text is "northing easting [elevation]" (NOT easting-first), and
 * coordinates are in a projected CRS, so each vertex is reprojected to [lng,lat]
 * via reprojectToWGS84(epsg, easting, northing) — same path as the DXF importer.
 *
 * No IO / framework imports — fully unit-testable.
 */

import { XMLParser } from 'fast-xml-parser';
import { reprojectToWGS84, validateTurkeyBbox } from '@/lib/crs';

export type LandXmlParseResult =
  | {
      ok: true;
      name: string;
      staStart: number;
      lengthM: number; // planar (2D) horizontal length, metres
      coords: [number, number][]; // WGS84 [lng,lat], densified
      elevations: number[]; // designed elevation per coord (metres); empty if no profile
      stations: number[]; // chainage per coord = staStart + cumulative planar length
      hasVerticalProfile: boolean;
      warnings: string[];
    }
  | { ok: false; error: string };

// ── preserveOrder node helpers ────────────────────────────────────────────────
// With preserveOrder:true each node is { TagName: [children], ':@': {attrs} } and
// text nodes are { '#text': value }. These helpers walk that structure safely.

type PNode = Record<string, unknown>;

function tagOf(node: PNode): string | null {
  for (const k of Object.keys(node)) {
    if (k !== ':@' && k !== '#text') return k;
  }
  return null;
}

function childrenOf(node: PNode): PNode[] {
  const tag = tagOf(node);
  if (!tag) return [];
  const v = node[tag];
  return Array.isArray(v) ? (v as PNode[]) : [];
}

function attrs(node: PNode): Record<string, string> {
  return (node[':@'] as Record<string, string>) ?? {};
}

function textOf(node: PNode): string {
  const kids = childrenOf(node);
  for (const k of kids) {
    if ('#text' in k) return String((k as { '#text': unknown })['#text']);
  }
  return '';
}

/** Depth-first: collect all nodes with the given tag name. */
function findAll(nodes: PNode[], tag: string, out: PNode[] = []): PNode[] {
  for (const n of nodes) {
    if (tagOf(n) === tag) out.push(n);
    findAll(childrenOf(n), tag, out);
  }
  return out;
}

function findFirst(nodes: PNode[], tag: string): PNode | null {
  return findAll(nodes, tag)[0] ?? null;
}

/** Parse a LandXML point text "northing easting [elevation]" → {n,e,z?}. */
function parsePoint(text: string): { n: number; e: number; z: number | null } | null {
  const parts = text.trim().split(/\s+/).map(Number);
  if (parts.length < 2 || parts.some((p, i) => i < 2 && Number.isNaN(p))) return null;
  return { n: parts[0], e: parts[1], z: parts.length >= 3 && !Number.isNaN(parts[2]) ? parts[2] : null };
}

// ── Horizontal geometry densification (projected easting/northing) ─────────────

type PE = { e: number; n: number }; // projected point

function densifyCurve(start: PE, center: PE, end: PE, radius: number, rot: string): PE[] {
  const a0 = Math.atan2(start.n - center.n, start.e - center.e);
  const a1 = Math.atan2(end.n - center.n, end.e - center.e);
  const r = radius > 0 ? radius : Math.hypot(start.e - center.e, start.n - center.n);
  const ccw = rot.toLowerCase() === 'ccw';
  let sweep = a1 - a0;
  // Normalise sweep to the rotation direction.
  if (ccw) {
    while (sweep <= 0) sweep += 2 * Math.PI;
  } else {
    while (sweep >= 0) sweep -= 2 * Math.PI;
  }
  const arcLen = Math.abs(sweep) * r;
  const steps = Math.max(8, Math.min(128, Math.ceil(arcLen / 10))); // ~10 m chord target
  const pts: PE[] = [];
  for (let i = 1; i <= steps; i++) {
    const a = a0 + (sweep * i) / steps;
    pts.push({ e: center.e + r * Math.cos(a), n: center.n + r * Math.sin(a) });
  }
  return pts; // excludes start (caller already has it), includes end
}

// ── Vertical profile (piecewise-linear over PVIs) ─────────────────────────────

type PVI = { sta: number; z: number };

function buildProfile(pvis: PVI[]): (sta: number) => number | null {
  if (pvis.length === 0) return () => null;
  const sorted = [...pvis].sort((a, b) => a.sta - b.sta);
  return (sta: number) => {
    if (sta <= sorted[0].sta) return sorted[0].z;
    if (sta >= sorted[sorted.length - 1].sta) return sorted[sorted.length - 1].z;
    for (let i = 1; i < sorted.length; i++) {
      if (sta <= sorted[i].sta) {
        const a = sorted[i - 1];
        const b = sorted[i];
        const t = b.sta === a.sta ? 0 : (sta - a.sta) / (b.sta - a.sta);
        return a.z + t * (b.z - a.z);
      }
    }
    return sorted[sorted.length - 1].z;
  };
}

export function parseLandXml(xml: string, epsg: number): LandXmlParseResult {
  let tree: PNode[];
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      preserveOrder: true,
      trimValues: true,
    });
    tree = parser.parse(xml) as PNode[];
  } catch {
    return { ok: false, error: 'Could not parse the file as XML.' };
  }

  const alignment = findFirst(tree, 'Alignment');
  if (!alignment) return { ok: false, error: 'No <Alignment> found in the LandXML file.' };

  const aAttrs = attrs(alignment);
  const name = aAttrs['@_name'] ?? 'Alignment';
  const staStart = Number(aAttrs['@_staStart'] ?? 0) || 0;

  const coordGeom = findFirst(childrenOf(alignment), 'CoordGeom');
  if (!coordGeom) return { ok: false, error: 'Alignment has no <CoordGeom> horizontal geometry.' };

  const warnings: string[] = [];

  // 1) Build the projected polyline by walking CoordGeom elements in order.
  const proj: PE[] = [];
  const pushPt = (p: PE) => {
    const last = proj[proj.length - 1];
    if (!last || Math.hypot(last.e - p.e, last.n - p.n) > 1e-6) proj.push(p);
  };

  for (const el of childrenOf(coordGeom)) {
    const tag = tagOf(el);
    if (tag === 'Line') {
      const start = findFirst(childrenOf(el), 'Start');
      const end = findFirst(childrenOf(el), 'End');
      const s = start && parsePoint(textOf(start));
      const e = end && parsePoint(textOf(end));
      if (s) pushPt({ e: s.e, n: s.n });
      if (e) pushPt({ e: e.e, n: e.n });
    } else if (tag === 'Curve') {
      const cAttrs = attrs(el);
      const start = findFirst(childrenOf(el), 'Start');
      const center = findFirst(childrenOf(el), 'Center');
      const end = findFirst(childrenOf(el), 'End');
      const s = start && parsePoint(textOf(start));
      const c = center && parsePoint(textOf(center));
      const e = end && parsePoint(textOf(end));
      if (s) pushPt({ e: s.e, n: s.n });
      if (s && c && e) {
        const radius = Number(cAttrs['@_radius'] ?? 0) || 0;
        const rot = cAttrs['@_rot'] ?? 'ccw';
        for (const p of densifyCurve({ e: s.e, n: s.n }, { e: c.e, n: c.n }, { e: e.e, n: e.n }, radius, rot)) {
          pushPt(p);
        }
      } else if (e) {
        pushPt({ e: e.e, n: e.n });
      }
    } else if (tag === 'Spiral') {
      // Clothoid transition — approximated as a straight chord in v1.
      const start = findFirst(childrenOf(el), 'Start');
      const end = findFirst(childrenOf(el), 'End');
      const s = start && parsePoint(textOf(start));
      const e = end && parsePoint(textOf(end));
      if (s) pushPt({ e: s.e, n: s.n });
      if (e) pushPt({ e: e.e, n: e.n });
      if (!warnings.includes('spiral_linear')) warnings.push('spiral_linear');
    }
  }

  if (proj.length < 2) {
    return { ok: false, error: 'Could not extract a valid alignment polyline.' };
  }

  // 2) Vertical profile (optional).
  const profAlign = findFirst(childrenOf(alignment), 'ProfAlign');
  const pvis: PVI[] = [];
  let hasParaCurve = false;
  if (profAlign) {
    for (const el of childrenOf(profAlign)) {
      const tag = tagOf(el);
      if (tag === 'PVI' || tag === 'ParaCurve' || tag === 'CircCurve') {
        const p = parsePoint(textOf(el)); // "station elevation" → n=station, e=elevation
        if (p) pvis.push({ sta: p.n, z: p.e });
        if (tag === 'ParaCurve' || tag === 'CircCurve') hasParaCurve = true;
      }
    }
  }
  const hasVerticalProfile = pvis.length > 0;
  if (hasParaCurve) warnings.push('vertical_curves_linear');
  if (!hasVerticalProfile) warnings.push('no_vertical_profile');
  const profileFn = buildProfile(pvis);

  // 3) Reproject + station + elevation per vertex.
  const coords: [number, number][] = [];
  const elevations: number[] = [];
  const stations: number[] = [];
  let cumulative = 0;
  let outOfTurkey = 0;
  for (let i = 0; i < proj.length; i++) {
    if (i > 0) {
      cumulative += Math.hypot(proj[i].e - proj[i - 1].e, proj[i].n - proj[i - 1].n);
    }
    let lngLat: [number, number];
    try {
      lngLat = reprojectToWGS84(epsg, proj[i].e, proj[i].n);
    } catch {
      return { ok: false, error: `Unsupported or invalid CRS (EPSG:${epsg}).` };
    }
    if (!validateTurkeyBbox(lngLat[0], lngLat[1])) outOfTurkey++;
    coords.push(lngLat);
    stations.push(staStart + cumulative);
    if (hasVerticalProfile) {
      const z = profileFn(staStart + cumulative);
      elevations.push(z ?? 0);
    }
  }
  if (outOfTurkey > 0) warnings.push('outside_turkey_bbox');

  return {
    ok: true,
    name,
    staStart,
    lengthM: Math.round(cumulative * 100) / 100,
    coords,
    elevations: hasVerticalProfile ? elevations : [],
    stations,
    hasVerticalProfile,
    warnings,
  };
}
