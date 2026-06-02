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

// ── Vertical profile (tangent grades + symmetric parabolic vertical curves) ────

/** A profile PVI; curveLen > 0 means a symmetric parabolic vertical curve of that length is centred on it. */
export type ProfilePVI = { sta: number; z: number; curveLen: number };

/**
 * buildVerticalProfile — elevation(station) evaluator.
 *
 * Tangent grades run straight between consecutive PVIs. A PVI carrying a
 * ParaCurve of length L is smoothed by the standard symmetric parabola over
 * [PVI.sta − L/2, PVI.sta + L/2]:
 *     y(x) = y_BVC + g_in·x + (g_out − g_in)/(2L)·x²
 * where x is measured from the BVC and g_in/g_out are the adjacent tangent
 * grades. Exposed for unit testing.
 */
export function buildVerticalProfile(pvis: ProfilePVI[]): (sta: number) => number | null {
  if (pvis.length === 0) return () => null;
  const p = [...pvis].sort((a, b) => a.sta - b.sta);
  if (p.length === 1) return () => p[0].z;
  const grade = (i: number) => {
    const ds = p[i + 1].sta - p[i].sta;
    return ds === 0 ? 0 : (p[i + 1].z - p[i].z) / ds;
  };
  return (s: number) => {
    if (s <= p[0].sta) return p[0].z;
    if (s >= p[p.length - 1].sta) return p[p.length - 1].z;
    // Inside a parabolic vertical-curve zone? (interior PVIs only)
    for (let j = 1; j < p.length - 1; j++) {
      const L = p[j].curveLen;
      if (L > 0) {
        const bvc = p[j].sta - L / 2;
        const evc = p[j].sta + L / 2;
        if (s >= bvc && s <= evc) {
          const gIn = grade(j - 1);
          const gOut = grade(j);
          const yBvc = p[j].z - gIn * (L / 2);
          const x = s - bvc;
          return yBvc + gIn * x + ((gOut - gIn) / (2 * L)) * x * x;
        }
      }
    }
    // Straight tangent between the bracketing PVIs.
    for (let k = 0; k < p.length - 1; k++) {
      if (s <= p[k + 1].sta) return p[k].z + grade(k) * (s - p[k].sta);
    }
    return p[p.length - 1].z;
  };
}

// ── Clothoid (spiral) densification ───────────────────────────────────────────

/** Parse a LandXML radius attribute; "INF"/blank/0/NaN → Infinity (zero curvature). */
function parseRadius(v: string | undefined): number {
  if (v == null || /inf/i.test(v)) return Infinity;
  const n = Number(v);
  return Number.isNaN(n) || n === 0 ? Infinity : n;
}

/**
 * densifyClothoid — sample a clothoid (linear curvature vs. arc length) from a
 * start point + start heading, with curvature 1/radiusStart → 1/radiusEnd over
 * length L. Heading θ(l) = θ0 + sign·(k0·l + (k1−k0)·l²/2L); position integrated
 * by midpoint steps. Returns points AFTER the start (caller already has start).
 */
function densifyClothoid(
  start: PE,
  theta0: number,
  radiusStart: number,
  radiusEnd: number,
  length: number,
  rot: string,
): PE[] {
  const sign = rot.toLowerCase() === 'cw' ? -1 : 1;
  const k0 = Number.isFinite(radiusStart) ? 1 / radiusStart : 0;
  const k1 = Number.isFinite(radiusEnd) ? 1 / radiusEnd : 0;
  const steps = Math.max(8, Math.min(128, Math.ceil(length / 10)));
  const dl = length / steps;
  let e = start.e;
  let n = start.n;
  const pts: PE[] = [];
  for (let i = 1; i <= steps; i++) {
    const lMid = (i - 0.5) * dl;
    const theta = theta0 + sign * (k0 * lMid + ((k1 - k0) * lMid * lMid) / (2 * length));
    e += Math.cos(theta) * dl;
    n += Math.sin(theta) * dl;
    pts.push({ e, n });
  }
  return pts;
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
      const sAttrs = attrs(el);
      const start = findFirst(childrenOf(el), 'Start');
      const end = findFirst(childrenOf(el), 'End');
      const s = start && parsePoint(textOf(start));
      const e = end && parsePoint(textOf(end));
      if (s) pushPt({ e: s.e, n: s.n });

      const startPE: PE | undefined = s ? { e: s.e, n: s.n } : proj[proj.length - 1];
      const L = Number(sAttrs['@_length']) || 0;
      let densified: PE[] | null = null;

      // Integrate the clothoid when we have a length and an incoming heading
      // (the tangent of the previous element ≈ last two polyline points).
      if (startPE && L > 0 && proj.length >= 2) {
        const prev = proj[proj.length - 2];
        const cur = proj[proj.length - 1];
        const theta0 = Math.atan2(cur.n - prev.n, cur.e - prev.e);
        const rot = sAttrs['@_rot'] ?? 'ccw';
        const cand = densifyClothoid(
          startPE,
          theta0,
          parseRadius(sAttrs['@_radiusStart']),
          parseRadius(sAttrs['@_radiusEnd']),
          L,
          rot,
        );
        // Validate against the given End; bad sign/convention → fall back to chord.
        if (e) {
          const last = cand[cand.length - 1];
          const dev = Math.hypot(last.e - e.e, last.n - e.n);
          if (dev <= Math.max(2, 0.02 * L)) densified = cand;
        } else {
          densified = cand;
        }
      }

      if (densified) {
        for (const p of densified) pushPt(p);
        if (e) pushPt({ e: e.e, n: e.n }); // snap exact end
      } else {
        if (e) pushPt({ e: e.e, n: e.n }); // chord fallback
        if (!warnings.includes('spiral_linear')) warnings.push('spiral_linear');
      }
    }
  }

  if (proj.length < 2) {
    return { ok: false, error: 'Could not extract a valid alignment polyline.' };
  }

  // 2) Vertical profile (optional). ParaCurve → proper parabola; CircCurve
  // (rare) is still treated as a plain PVI (linearised) and flagged.
  const profAlign = findFirst(childrenOf(alignment), 'ProfAlign');
  const pvis: ProfilePVI[] = [];
  let hasCircCurve = false;
  if (profAlign) {
    for (const el of childrenOf(profAlign)) {
      const tag = tagOf(el);
      if (tag === 'PVI' || tag === 'ParaCurve' || tag === 'CircCurve') {
        const p = parsePoint(textOf(el)); // "station elevation" → n=station, e=elevation
        if (p) {
          const curveLen = tag === 'ParaCurve' ? Number(attrs(el)['@_length']) || 0 : 0;
          pvis.push({ sta: p.n, z: p.e, curveLen });
        }
        if (tag === 'CircCurve') hasCircCurve = true;
      }
    }
  }
  const hasVerticalProfile = pvis.length > 0;
  if (hasCircCurve) warnings.push('vertical_circular_approx');
  if (!hasVerticalProfile) warnings.push('no_vertical_profile');
  const profileFn = buildVerticalProfile(pvis);

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
