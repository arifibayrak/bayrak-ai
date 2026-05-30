/**
 * tests/fixtures/dxf.ts
 *
 * Hand-authored DXF text fixtures for tests/dxf-parser.test.ts.
 * DXF is a text format; no binary required.
 *
 * Coordinate references:
 *   EPSG:5254 (TUREF/TM30): easting ~600000, northing ~4570000 → Istanbul area (~29°E, ~41.3°N)
 *   EPSG:32635 (WGS84/UTM35N): easting ~694000, northing ~4584000 → Istanbul area
 *
 * DXF minimal structure:
 *   SECTION/ENTITIES block contains LWPOLYLINE entities with:
 *     Group 8  → layer name
 *     Group 70 → flags (0 = open polyline)
 *     Group 90 → vertex count
 *     Groups 10/20 → X/Y coordinate pairs for each vertex
 */

/**
 * Minimal DXF wrapper — SECTION/ENTITIES block.
 * vertices: array of [x, y] pairs (projected coordinates)
 */
function makeDxf(entities: string): string {
  return [
    '  0',
    'SECTION',
    '  2',
    'ENTITIES',
    entities,
    '  0',
    'ENDSEC',
    '  0',
    'EOF',
  ].join('\n');
}

/**
 * Build a LWPOLYLINE entity string.
 * @param layer - DXF layer name
 * @param vertices - array of [x, y] coordinate pairs in projected CRS
 */
function makeLwPolyline(layer: string, vertices: [number, number][]): string {
  const lines: string[] = [
    '  0',
    'LWPOLYLINE',
    '  8',
    layer,
    ' 70',
    '     0',    // flags: 0 = open
    ' 90',
    `     ${vertices.length}`,
  ];
  for (const [x, y] of vertices) {
    lines.push(' 10', String(x), ' 20', String(y));
  }
  return lines.join('\n');
}

/**
 * Build a SPLINE entity string (minimal — controlPoints only).
 * @param layer - DXF layer name
 * @param controlPoints - array of [x, y] pairs
 */
function makeSpline(layer: string, controlPoints: [number, number][]): string {
  const lines: string[] = [
    '  0',
    'SPLINE',
    '  8',
    layer,
    ' 70',
    '     8',    // flags: 8 = planar
    ' 73',
    `     ${controlPoints.length}`,
  ];
  for (const [x, y] of controlPoints) {
    lines.push(' 10', String(x), ' 20', String(y));
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// EPSG:5254 (TUREF/TM30) — Istanbul area coordinates
// easting ~600000 + offset, northing ~4570000 + offset
// These reproject to ~(29.0°E, 41.3°N) — well within Turkey bbox
// ---------------------------------------------------------------------------

/** Single LWPOLYLINE on layer AXIS in TUREF/TM30 (EPSG:5254) — 3 vertices */
export const SAMPLE_DXF_EPSG5254 = makeDxf(
  makeLwPolyline('AXIS', [
    [600000, 4570000],
    [600100, 4570100],
    [600200, 4570200],
  ])
);

// ---------------------------------------------------------------------------
// EPSG:32635 (WGS84/UTM35N) — Istanbul area coordinates
// easting ~694000, northing ~4584000 → reprojected to ~(29°E, 41.4°N)
// ---------------------------------------------------------------------------

/** Single LWPOLYLINE on layer CL in WGS84/UTM35N (EPSG:32635) — 3 vertices */
export const SAMPLE_DXF_EPSG32635 = makeDxf(
  makeLwPolyline('CL', [
    [694000, 4584000],
    [694100, 4584100],
    [694200, 4584200],
  ])
);

// ---------------------------------------------------------------------------
// Multi-polyline — two LWPOLYLINE entities on layer AXIS whose endpoints
// nearly meet (gap ~141m in projected space → for stitch test)
// ---------------------------------------------------------------------------

/** Two LWPOLYLINE entities on layer AXIS with nearly-meeting endpoints */
export const SAMPLE_DXF_MULTI_POLYLINE = makeDxf(
  [
    makeLwPolyline('AXIS', [
      [600000, 4570000],
      [600100, 4570100],
      [600200, 4570200],
    ]),
    '\n',
    makeLwPolyline('AXIS', [
      [600300, 4570300],
      [600400, 4570400],
      [600500, 4570500],
    ]),
  ].join('\n')
);

// ---------------------------------------------------------------------------
// SPLINE + LWPOLYLINE — for hasSpline detection test
// ---------------------------------------------------------------------------

/** SPLINE entity + LWPOLYLINE on layer AXIS — for hasSpline=true detection */
export const SAMPLE_DXF_SPLINE = makeDxf(
  [
    makeSpline('AXIS', [
      [600000, 4570000],
      [600050, 4570050],
      [600100, 4570100],
    ]),
    '\n',
    makeLwPolyline('AXIS', [
      [600000, 4570000],
      [600100, 4570100],
      [600200, 4570200],
    ]),
  ].join('\n')
);

// ---------------------------------------------------------------------------
// Out-of-Turkey — coordinates that reproject OUTSIDE Turkey bbox
// EPSG:5254 with x=0, y=0 → reprojected result is far from Turkey (origin)
// ---------------------------------------------------------------------------

/** LWPOLYLINE with coordinates that reproject outside Turkey bbox (EPSG:5254 origin) */
export const SAMPLE_DXF_OUT_OF_TURKEY = makeDxf(
  makeLwPolyline('AXIS', [
    [0, 0],
    [1, 1],
    [2, 2],
  ])
);
