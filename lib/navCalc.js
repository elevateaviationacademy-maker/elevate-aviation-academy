// Standard spherical-Earth air navigation formulas (the same approximation
// used throughout CPL/ATPL Air Navigation syllabi — Earth treated as a
// sphere, not the WGS84 ellipsoid). All angles in, and returned in, degrees
// unless noted; internal math uses radians.

const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;
const norm360 = (deg) => ((deg % 360) + 360) % 360;

// Shortest signed difference in longitude, in range (-180, 180], so a path
// crossing the antimeridian (e.g. 170E to 170W) takes the short way.
function lonDiff(lon1, lon2) {
  let d = lon2 - lon1;
  while (d > 180) d -= 360;
  while (d <= -180) d += 360;
  return d;
}

// Great circle distance (nm) and initial/final track (deg true).
// 1 minute of arc along a great circle = 1 nautical mile, by definition.
export function greatCircle(lat1, lon1, lat2, lon2) {
  const φ1 = toRad(lat1), φ2 = toRad(lat2);
  const Δλ = toRad(lonDiff(lon1, lon2));

  const centralAngle = Math.acos(
    Math.min(1, Math.max(-1, Math.sin(φ1) * Math.sin(φ2) + Math.cos(φ1) * Math.cos(φ2) * Math.cos(Δλ)))
  );
  const distanceNm = toDeg(centralAngle) * 60;

  const y1 = Math.sin(Δλ) * Math.cos(φ2);
  const x1 = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const initialTrack = norm360(toDeg(Math.atan2(y1, x1)));

  // Final track = reverse of the initial track computed from P2 back to P1.
  const Δλ2 = toRad(lonDiff(lon2, lon1));
  const y2 = Math.sin(Δλ2) * Math.cos(φ1);
  const x2 = Math.cos(φ2) * Math.sin(φ1) - Math.sin(φ2) * Math.cos(φ1) * Math.cos(Δλ2);
  const finalTrack = norm360(toDeg(Math.atan2(y2, x2)) + 180);

  return { distanceNm, initialTrack, finalTrack };
}

// Rhumb line (loxodrome) distance (nm) and constant track (deg true).
export function rhumbLine(lat1, lon1, lat2, lon2) {
  const φ1 = toRad(lat1), φ2 = toRad(lat2);
  const Δφ = φ2 - φ1;
  const Δλ = toRad(lonDiff(lon1, lon2));

  const Δψ = Math.log(Math.tan(Math.PI / 4 + φ2 / 2) / Math.tan(Math.PI / 4 + φ1 / 2));
  const q = Math.abs(Δψ) > 1e-12 ? Δφ / Δψ : Math.cos(φ1); // E-W line special case

  const centralAngle = Math.sqrt(Δφ * Δφ + q * q * Δλ * Δλ);
  const distanceNm = toDeg(centralAngle) * 60;
  const track = norm360(toDeg(Math.atan2(Δλ, Δψ)));

  return { distanceNm, track };
}

// Ch.Lat, Ch.Long (signed, degrees) and mean latitude — the building blocks
// for departure, convergency, and conversion angle.
export function chLatLong(lat1, lon1, lat2, lon2) {
  const chLat = lat2 - lat1;
  const chLong = lonDiff(lon1, lon2);
  const meanLat = (lat1 + lat2) / 2;
  return { chLat, chLong, meanLat };
}

// Convergency (deg) — the angle of inclination between the two meridians,
// evaluated at the mean latitude: Convergency = Ch.Long × sin(Mean Lat).
export function convergency(lat1, lon1, lat2, lon2) {
  const { chLong, meanLat } = chLatLong(lat1, lon1, lat2, lon2);
  return chLong * Math.sin(toRad(meanLat));
}

// Conversion Angle (deg) — half the convergency; the correction applied to
// go between a great circle track and the rhumb line track at the midpoint.
export function conversionAngle(lat1, lon1, lat2, lon2) {
  return convergency(lat1, lon1, lat2, lon2) / 2;
}

// Departure (nm) — distance covered along a parallel of latitude for the
// given change of longitude, using the mean latitude (the standard
// syllabus approximation): Departure = Ch.Long(minutes) × cos(Mean Lat).
export function departure(lat1, lon1, lat2, lon2) {
  const { chLong, meanLat } = chLatLong(lat1, lon1, lat2, lon2);
  return chLong * 60 * Math.cos(toRad(meanLat));
}

// Generates `steps` intermediate [lat, lng] points along the great circle
// between two points, via spherical linear interpolation (slerp) — used to
// draw an accurate great-circle curve on the globe.
export function greatCirclePath(lat1, lon1, lat2, lon2, steps = 64) {
  const φ1 = toRad(lat1), λ1 = toRad(lon1);
  const φ2 = toRad(lat2), λ2 = toRad(lon2);

  const d = Math.acos(
    Math.min(1, Math.max(-1, Math.sin(φ1) * Math.sin(φ2) + Math.cos(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1)))
  );
  if (d < 1e-12) return [[lat1, lon1]];

  const points = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    const lat = toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)));
    const lon = toDeg(Math.atan2(y, x));
    points.push([lat, lon]);
  }
  return points;
}

// Generates `steps` intermediate [lat, lng] points along the rhumb line
// (constant true track) between two points — a straight line on a
// Mercator projection, but a spiral toward the pole on a real globe.
export function rhumbLinePath(lat1, lon1, lat2, lon2, steps = 64) {
  const φ1 = toRad(lat1), φ2 = toRad(lat2);
  const λ1 = toRad(lon1);
  const Δλ = toRad(lonDiff(lon1, lon2));

  const points = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const φ = φ1 + f * (φ2 - φ1);
    // Isometric-latitude interpolation keeps the track truly constant.
    const ψ1 = Math.log(Math.tan(Math.PI / 4 + φ1 / 2));
    const ψ2 = Math.log(Math.tan(Math.PI / 4 + φ2 / 2));
    const ψ = Math.log(Math.tan(Math.PI / 4 + φ / 2));
    const q = Math.abs(ψ2 - ψ1) > 1e-12 ? (ψ - ψ1) / (ψ2 - ψ1) : f;
    const λ = λ1 + q * Δλ;
    points.push([toDeg(φ), norm360(toDeg(λ) + 180) - 180]);
  }
  return points;
}

// ---- Graticule (lat/long grid lines) ----------------------------------

// One path per meridian, pole to pole, at every `stepDeg` of longitude.
export function graticuleMeridians(stepDeg = 30) {
  const lines = [];
  for (let lon = -180; lon < 180; lon += stepDeg) {
    const pts = [];
    for (let lat = -90; lat <= 90; lat += 5) pts.push([lat, lon]);
    lines.push(pts);
  }
  return lines;
}

// One path per parallel, all the way round, at every `stepDeg` of latitude
// (excludes the poles themselves, which are single points, not a circle).
export function graticuleParallels(stepDeg = 30) {
  const lines = [];
  for (let lat = -90 + stepDeg; lat < 90; lat += stepDeg) {
    const pts = [];
    for (let lon = -180; lon <= 180; lon += 5) pts.push([lat, lon]);
    lines.push(pts);
  }
  return lines;
}

// ---- Chart projections --------------------------------------------------
// Standard closed-form spherical map projection formulas (Snyder, "Map
// Projections: A Working Manual", USGS 1987) — the same three projections
// covered in CPL/ATPL Air Navigation chart-work syllabi. Each returns
// {x, y} in arbitrary planar units; the caller scales/centers for display.
// centerLon recenters the map so the route of interest isn't split at the
// ±180° seam.

function shiftLon(lon, centerLon) {
  let d = lon - centerLon;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

export function mercatorProject(lat, lon, centerLon = 0) {
  const φ = toRad(Math.max(-85, Math.min(85, lat))); // Mercator blows up at the poles
  const λ = toRad(shiftLon(lon, centerLon));
  return { x: λ, y: Math.log(Math.tan(Math.PI / 4 + φ / 2)) };
}

// Standard parallels chosen by the classic "one-sixth rule" used for
// aviation topographical charts: SP1/SP2 set a sixth of the latitude
// span in from each end of the range being covered.
export function chooseLambertParallels(lat1, lat2) {
  const lo = Math.min(lat1, lat2);
  const hi = Math.max(lat1, lat2);
  const span = hi - lo || 10; // avoid a zero-width cone if both points share a latitude
  const sp1 = lo + span / 6;
  const sp2 = hi - span / 6;
  return { sp1, sp2, refLat: (sp1 + sp2) / 2 };
}

export function lambertProject(lat, lon, sp1, sp2, refLat, centerLon = 0) {
  const φ = toRad(lat), φ1 = toRad(sp1), φ2 = toRad(sp2), φ0 = toRad(refLat);
  const λ = toRad(shiftLon(lon, centerLon));

  const t = (x) => Math.tan(Math.PI / 4 + x / 2);
  let n;
  if (Math.abs(sp1 - sp2) < 1e-9) {
    n = Math.sin(φ1); // single standard parallel case
  } else {
    n = Math.log(Math.cos(φ1) / Math.cos(φ2)) / Math.log(t(φ2) / t(φ1));
  }
  const F = (Math.cos(φ1) * Math.pow(t(φ1), n)) / n;
  const ρ = F / Math.pow(t(φ), n);
  const ρ0 = F / Math.pow(t(φ0), n);

  return { x: ρ * Math.sin(n * λ), y: ρ0 - ρ * Math.cos(n * λ) };
}

// hemisphere: "N" or "S".
export function polarStereoProject(lat, lon, hemisphere = "N", centerLon = 0) {
  const sign = hemisphere === "S" ? -1 : 1;
  const φ = toRad(lat * sign);
  const λ = toRad(shiftLon(lon, centerLon));
  const ρ = 2 * Math.tan(Math.PI / 4 - φ / 2);
  return { x: ρ * Math.sin(λ) * sign, y: -ρ * Math.cos(λ) };
}

function niceStep(span) {
  if (span <= 5) return 1;
  if (span <= 15) return 2;
  if (span <= 40) return 5;
  if (span <= 90) return 10;
  return 20;
}

// Builds a graticule (meridians + parallels) confined to a padded box around
// the two points, rather than the whole globe — keeps flat-chart
// projections (which distort or blow up far from their center) well
// behaved, and mirrors how a real aviation chart only covers one region.
// Returns real (unwrapped) lat/lon points plus the centerLon those charts
// should be projected with.
export function regionGraticule(lat1, lon1, lat2, lon2, padDeg = 12) {
  const centerLon = lon1 + lonDiff(lon1, lon2) / 2;
  const s1 = lonDiff(centerLon, lon1) * -1; // shifted lon of point 1 relative to centerLon
  const s2 = lonDiff(centerLon, lon2) * -1;

  const latMin = Math.max(-89, Math.min(lat1, lat2) - padDeg);
  const latMax = Math.min(89, Math.max(lat1, lat2) + padDeg);
  const lonSMin = Math.min(s1, s2) - padDeg;
  const lonSMax = Math.max(s1, s2) + padDeg;

  const latStep = niceStep(latMax - latMin);
  const lonStep = niceStep(lonSMax - lonSMin);

  const toRealLon = (shifted) => {
    let real = centerLon + shifted;
    while (real > 180) real -= 360;
    while (real < -180) real += 360;
    return real;
  };

  const meridians = [];
  const startLonS = Math.ceil(lonSMin / lonStep) * lonStep;
  for (let ls = startLonS; ls <= lonSMax; ls += lonStep) {
    const pts = [];
    for (let lat = latMin; lat <= latMax; lat += Math.max(1, latStep / 5)) {
      pts.push([lat, toRealLon(ls)]);
    }
    meridians.push(pts);
  }

  const parallels = [];
  const startLat = Math.ceil(latMin / latStep) * latStep;
  for (let lat = startLat; lat <= latMax; lat += latStep) {
    const pts = [];
    for (let ls = lonSMin; ls <= lonSMax; ls += Math.max(1, lonStep / 5)) {
      pts.push([lat, toRealLon(ls)]);
    }
    parallels.push(pts);
  }

  return { meridians, parallels, centerLon, bounds: { latMin, latMax, lonSMin, lonSMax } };
}
