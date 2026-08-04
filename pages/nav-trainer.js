import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import dynamic from "next/dynamic";
import { supabase } from "../lib/supabaseClient";
import Navbar from "../components/Navbar";
import {
  greatCircle,
  rhumbLine,
  chLatLong,
  convergency,
  conversionAngle,
  departure,
  greatCirclePath,
  rhumbLinePath,
  dateLineInfo,
  graticuleMeridians,
  graticuleParallels,
  regionGraticule,
  mercatorProject,
  lambertProject,
  polarStereoProject,
  chooseLambertParallels,
} from "../lib/navCalc";

// react-globe.gl touches WebGL/DOM globals that don't exist during
// server-side rendering, so it must load client-side only.
const Globe = dynamic(() => import("react-globe.gl"), { ssr: false });

const PRESETS = [
  { name: "London → New York", lat1: 51.4700, lon1: -0.4543, lat2: 40.6413, lon2: -73.7781 },
  { name: "Delhi → London", lat1: 28.5562, lon1: 77.1000, lat2: 51.4700, lon2: -0.4543 },
  { name: "Sydney → Los Angeles", lat1: -33.9399, lon1: 151.1753, lat2: 33.9416, lon2: -118.4085 },
  { name: "Along the Equator", lat1: 0, lon1: -20, lat2: 0, lon2: 40 },
  { name: "Along a Meridian (N-S)", lat1: 10, lon1: 0, lat2: 60, lon2: 0 },
];

function DMSInput({ label, deg, setDeg, dir, setDir, positive, negative }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 13, color: "#64748b" }}>{label}</label>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="number"
          step="any"
          value={deg}
          onChange={(e) => setDeg(e.target.value)}
          style={{ marginBottom: 0 }}
        />
        <select value={dir} onChange={(e) => setDir(e.target.value)} style={{ marginBottom: 0, width: 90 }}>
          <option value={positive}>{positive}</option>
          <option value={negative}>{negative}</option>
        </select>
      </div>
    </div>
  );
}

export default function NavTrainer() {
  const router = useRouter();
  const [role, setRole] = useState(null);

  const [lat1, setLat1] = useState("51.47");
  const [lat1Dir, setLat1Dir] = useState("N");
  const [lon1, setLon1] = useState("0.4543");
  const [lon1Dir, setLon1Dir] = useState("W");
  const [lat2, setLat2] = useState("40.6413");
  const [lat2Dir, setLat2Dir] = useState("N");
  const [lon2, setLon2] = useState("73.7781");
  const [lon2Dir, setLon2Dir] = useState("W");
  const [showGrid, setShowGrid] = useState(true);

  const globeWrapRef = useRef(null);
  const [globeWidth, setGlobeWidth] = useState(800);

  useEffect(() => {
    if (!globeWrapRef.current) return;
    const el = globeWrapRef.current;
    const update = () => setGlobeWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    guard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function guard() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return router.replace("/login");
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.session.user.id).single();
    setRole(profile?.role || "student");
  }

  function applyPreset(p) {
    setLat1(String(Math.abs(p.lat1))); setLat1Dir(p.lat1 < 0 ? "S" : "N");
    setLon1(String(Math.abs(p.lon1))); setLon1Dir(p.lon1 < 0 ? "W" : "E");
    setLat2(String(Math.abs(p.lat2))); setLat2Dir(p.lat2 < 0 ? "S" : "N");
    setLon2(String(Math.abs(p.lon2))); setLon2Dir(p.lon2 < 0 ? "W" : "E");
  }

  const signedLat1 = (parseFloat(lat1) || 0) * (lat1Dir === "S" ? -1 : 1);
  const signedLon1 = (parseFloat(lon1) || 0) * (lon1Dir === "W" ? -1 : 1);
  const signedLat2 = (parseFloat(lat2) || 0) * (lat2Dir === "S" ? -1 : 1);
  const signedLon2 = (parseFloat(lon2) || 0) * (lon2Dir === "W" ? -1 : 1);

  const valid =
    Math.abs(signedLat1) <= 90 && Math.abs(signedLat2) <= 90 &&
    Math.abs(signedLon1) <= 180 && Math.abs(signedLon2) <= 180 &&
    !(signedLat1 === signedLat2 && signedLon1 === signedLon2);

  const results = useMemo(() => {
    if (!valid) return null;
    const gc = greatCircle(signedLat1, signedLon1, signedLat2, signedLon2);
    const rl = rhumbLine(signedLat1, signedLon1, signedLat2, signedLon2);
    const cl = chLatLong(signedLat1, signedLon1, signedLat2, signedLon2);
    const conv = convergency(signedLat1, signedLon1, signedLat2, signedLon2);
    const ca = conversionAngle(signedLat1, signedLon1, signedLat2, signedLon2);
    const dep = departure(signedLat1, signedLon1, signedLat2, signedLon2);
    const dl = dateLineInfo(signedLat1, signedLon1, signedLat2, signedLon2);
    return { gc, rl, cl, conv, ca, dep, dl };
  }, [signedLat1, signedLon1, signedLat2, signedLon2, valid]);

  const globeData = useMemo(() => {
    if (!valid) return { points: [], paths: [] };
    const gcPts = greatCirclePath(signedLat1, signedLon1, signedLat2, signedLon2);
    const rlPts = rhumbLinePath(signedLat1, signedLon1, signedLat2, signedLon2);
    const graticule = showGrid
      ? [
          ...graticuleMeridians(30).map((coords) => ({ coords, color: "rgba(255,255,255,0.45)", name: "" })),
          ...graticuleParallels(30).map((coords) => ({ coords, color: "rgba(255,255,255,0.45)", name: "" })),
        ]
      : [];
    return {
      points: [
        { lat: signedLat1, lng: signedLon1, label: "A" },
        { lat: signedLat2, lng: signedLon2, label: "B" },
      ],
      paths: [
        ...graticule,
        { coords: gcPts, color: "#f59e0b", name: "Great circle" },
        { coords: rlPts, color: "#38bdf8", name: "Rhumb line" },
      ],
    };
  }, [signedLat1, signedLon1, signedLat2, signedLon2, valid, showGrid]);

  function fmt(n, decimals = 1) {
    return Number.isFinite(n) ? n.toFixed(decimals) : "—";
  }

  function fmtHours(h) {
    if (!Number.isFinite(h)) return "—";
    const sign = h < 0 ? "-" : "";
    const abs = Math.abs(h);
    const hh = Math.floor(abs);
    const mm = Math.round((abs - hh) * 60);
    return `${sign}${hh}h ${mm}m`;
  }

  const [projection, setProjection] = useState("mercator");

  const PROJECTIONS = {
    mercator: {
      label: "Mercator",
      blurb: "The rhumb line (blue) is always a perfectly straight line here — that's what Mercator charts are built for. The great circle (orange) curves toward whichever pole is nearer.",
    },
    lambert: {
      label: "Lambert Conformal Conic",
      blurb: "Standard parallels are auto-chosen a sixth of the way in from each end (the classic rule used for aviation charts). Between them, the great circle is close to straight; the rhumb line curves toward the pole.",
    },
    polarN: {
      label: "Polar Stereographic (N)",
      blurb: "Centered on the North Pole. Meridians radiate out as straight lines; the great circle and rhumb line both curve unless the route runs due north-south along a meridian.",
    },
    polarS: {
      label: "Polar Stereographic (S)",
      blurb: "Centered on the South Pole — same idea as the northern version, mirrored.",
    },
  };

  const chart = useMemo(() => {
    if (!valid) return null;

    const g = regionGraticule(signedLat1, signedLon1, signedLat2, signedLon2);
    const { sp1, sp2, refLat } = chooseLambertParallels(signedLat1, signedLat2);

    const projectFn = (lat, lon) => {
      if (projection === "mercator") return mercatorProject(lat, lon, g.centerLon);
      if (projection === "lambert") return lambertProject(lat, lon, sp1, sp2, refLat, g.centerLon);
      if (projection === "polarN") return polarStereoProject(lat, lon, "N", g.centerLon);
      return polarStereoProject(lat, lon, "S", g.centerLon);
    };

    const gcPts = greatCirclePath(signedLat1, signedLon1, signedLat2, signedLon2, 48).map(([la, lo]) => projectFn(la, lo));
    const rlPts = rhumbLinePath(signedLat1, signedLon1, signedLat2, signedLon2, 48).map(([la, lo]) => projectFn(la, lo));
    const meridians = g.meridians.map((line) => line.map(([la, lo]) => projectFn(la, lo)));
    const parallels = g.parallels.map((line) => line.map(([la, lo]) => projectFn(la, lo)));
    const ptA = projectFn(signedLat1, signedLon1);
    const ptB = projectFn(signedLat2, signedLon2);

    // Auto-fit everything into a fixed SVG viewport.
    const all = [...gcPts, ...rlPts, ptA, ptB, ...meridians.flat(), ...parallels.flat()].filter(
      (p) => Number.isFinite(p.x) && Number.isFinite(p.y)
    );
    const xs = all.map((p) => p.x), ys = all.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const w = 900, h = 560, pad = 40;
    const scale = Math.min((w - pad * 2) / (maxX - minX || 1), (h - pad * 2) / (maxY - minY || 1));
    const toSvg = (p) => ({
      x: pad + (p.x - minX) * scale,
      y: h - pad - (p.y - minY) * scale, // flip so north is up
    });

    return {
      gc: gcPts.map(toSvg),
      rl: rlPts.map(toSvg),
      meridians: meridians.map((line) => line.map(toSvg)),
      parallels: parallels.map((line) => line.map(toSvg)),
      a: toSvg(ptA),
      b: toSvg(ptB),
      w, h,
    };
  }, [signedLat1, signedLon1, signedLat2, signedLon2, valid, projection]);

  function svgPolyline(points) {
    return points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  }

  return (
    <div>
      <Navbar role={role || "student"} />
      <div className="container">
        <h2>Nav Trainer</h2>
        <p style={{ color: "#64748b", fontSize: 14, marginTop: -8, marginBottom: 20 }}>
          Enter two coordinates to see the great circle and rhumb line drawn on a real globe, with every value
          worked out alongside — drag to rotate, scroll to zoom.
        </p>

        <div className="card">
          <p style={{ fontSize: 13, color: "#64748b", marginTop: 0 }}>Quick examples</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
            {PRESETS.map((p) => (
              <button key={p.name} className="secondary" onClick={() => applyPreset(p)}>
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <div>
              <h3 style={{ marginTop: 0 }}>Point A</h3>
              <DMSInput label="Latitude (°)" deg={lat1} setDeg={setLat1} dir={lat1Dir} setDir={setLat1Dir} positive="N" negative="S" />
              <DMSInput label="Longitude (°)" deg={lon1} setDeg={setLon1} dir={lon1Dir} setDir={setLon1Dir} positive="E" negative="W" />
            </div>
            <div>
              <h3 style={{ marginTop: 0 }}>Point B</h3>
              <DMSInput label="Latitude (°)" deg={lat2} setDeg={setLat2} dir={lat2Dir} setDir={setLat2Dir} positive="N" negative="S" />
              <DMSInput label="Longitude (°)" deg={lon2} setDeg={setLon2} dir={lon2Dir} setDir={setLon2Dir} positive="E" negative="W" />
            </div>
          </div>
          {!valid && (
            <p className="error">
              Check the values — latitude must be 0–90, longitude 0–180, and the two points can't be identical.
            </p>
          )}
        </div>

        {results && (
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Results</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
              <div>
                <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>Ch.Lat</p>
                <strong>{fmt(results.cl.chLat, 2)}°</strong>
              </div>
              <div>
                <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>Ch.Long</p>
                <strong>{fmt(results.cl.chLong, 2)}°</strong>
              </div>
              <div>
                <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>Mean Latitude</p>
                <strong>{fmt(results.cl.meanLat, 2)}°</strong>
              </div>
              <div>
                <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>Departure</p>
                <strong>{fmt(results.dep)} nm</strong>
              </div>
              <div>
                <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>Convergency</p>
                <strong>{fmt(results.conv, 2)}°</strong>
              </div>
              <div>
                <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>Conversion Angle</p>
                <strong>{fmt(results.ca, 2)}°</strong>
              </div>
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, gridColumn: "1 / -1" }} />
              <div>
                <p style={{ color: "#f59e0b", fontSize: 13, margin: 0, fontWeight: 600 }}>● Great Circle Distance</p>
                <strong>{fmt(results.gc.distanceNm)} nm</strong>
              </div>
              <div>
                <p style={{ color: "#f59e0b", fontSize: 13, margin: 0, fontWeight: 600 }}>Initial Track</p>
                <strong>{fmt(results.gc.initialTrack)}°T</strong>
              </div>
              <div>
                <p style={{ color: "#f59e0b", fontSize: 13, margin: 0, fontWeight: 600 }}>Final Track</p>
                <strong>{fmt(results.gc.finalTrack)}°T</strong>
              </div>
              <div>
                <p style={{ color: "#38bdf8", fontSize: 13, margin: 0, fontWeight: 600 }}>● Rhumb Line Distance</p>
                <strong>{fmt(results.rl.distanceNm)} nm</strong>
              </div>
              <div>
                <p style={{ color: "#38bdf8", fontSize: 13, margin: 0, fontWeight: 600 }}>Constant Track</p>
                <strong>{fmt(results.rl.track)}°T</strong>
              </div>
            </div>
          </div>
        )}

        {results && (
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Time & International Date Line</h3>
            <p style={{ color: "#64748b", fontSize: 13, marginTop: 0 }}>
              15° of longitude = 1 hour. Local Mean Time gets later heading east, earlier heading west — that's
              the whole basis of time zones. B is {results.dl.timeDiffHours >= 0 ? "ahead of" : "behind"} A by:
            </p>
            <p style={{ marginBottom: 16 }}>
              <strong style={{ fontSize: 20 }}>{fmtHours(Math.abs(results.dl.timeDiffHours))}</strong>
            </p>

            {results.dl.crossesIDL ? (
              <div style={{ background: "#fef3c7", borderRadius: 8, padding: 12 }}>
                <p style={{ margin: 0, fontWeight: 600, color: "#92400e" }}>
                  This route crosses the International Date Line, heading {results.dl.direction}.
                </p>
                <p style={{ margin: "4px 0 0", color: "#92400e", fontSize: 14 }}>
                  {results.dl.dayChange < 0
                    ? "Crossing eastbound (Asia/Pacific → Americas direction) — subtract one day from the calendar date on arrival."
                    : "Crossing westbound (Americas → Asia/Pacific direction) — add one day to the calendar date on arrival."}
                </p>
              </div>
            ) : (
              <p style={{ color: "#64748b", fontSize: 14, margin: 0 }}>
                This route doesn't cross the ±180° meridian, so no date adjustment is needed — only the time
                difference above applies.
              </p>
            )}
          </div>
        )}

        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: 16, display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap", borderBottom: "1px solid var(--border)" }}>
            <span style={{ fontSize: 13 }}><span style={{ color: "#f59e0b" }}>●</span> Great circle (shortest path)</span>
            <span style={{ fontSize: 13 }}><span style={{ color: "#38bdf8" }}>●</span> Rhumb line (constant track)</span>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginLeft: "auto" }}>
              <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
              Latitude/longitude grid
            </label>
          </div>
          <div ref={globeWrapRef} style={{ width: "100%", height: 560, background: "#000" }}>
            {valid && (
              <Globe
                globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
                bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
                backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
                pointsData={globeData.points}
                pointLat="lat"
                pointLng="lng"
                pointLabel="label"
                pointColor={() => "#ffffff"}
                pointAltitude={0.01}
                pointRadius={0.4}
                pathsData={globeData.paths}
                pathPoints="coords"
                pathPointLat={(p) => p[0]}
                pathPointLng={(p) => p[1]}
                pathColor={(p) => p.color}
                pathLabel={(p) => p.name}
                pathStroke={(p) => (p.name ? 2 : 0.6)}
                pathDashLength={(p) => (p.name ? 0.01 : 1)}
                pathDashGap={(p) => (p.name ? 0.004 : 0)}
                pathDashAnimateTime={(p) => (p.name ? 8000 : 0)}
                width={globeWidth}
                height={560}
              />
            )}
          </div>
        </div>

        <h2>Chart Projections</h2>
        <p style={{ color: "#64748b", fontSize: 14, marginTop: -8, marginBottom: 16 }}>
          The same route "cut flat" — this is what actually shows up on the charts used for real flight planning.
        </p>
        <div className="card">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {Object.entries(PROJECTIONS).map(([key, p]) => (
              <button
                key={key}
                className={projection === key ? "" : "secondary"}
                onClick={() => setProjection(key)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <p style={{ color: "#64748b", fontSize: 13, marginBottom: 16 }}>{PROJECTIONS[projection].blurb}</p>

          {chart && (
            <svg viewBox={`0 0 ${chart.w} ${chart.h}`} style={{ width: "100%", height: "auto", background: "#0f172a", borderRadius: 8 }}>
              {chart.meridians.map((line, i) => (
                <polyline key={`m${i}`} points={svgPolyline(line)} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
              ))}
              {chart.parallels.map((line, i) => (
                <polyline key={`p${i}`} points={svgPolyline(line)} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
              ))}
              <polyline points={svgPolyline(chart.gc)} fill="none" stroke="#f59e0b" strokeWidth="2.5" />
              <polyline points={svgPolyline(chart.rl)} fill="none" stroke="#38bdf8" strokeWidth="2.5" />
              <circle cx={chart.a.x} cy={chart.a.y} r="5" fill="#fff" />
              <text x={chart.a.x + 10} y={chart.a.y + 4} fill="#fff" fontSize="14">A</text>
              <circle cx={chart.b.x} cy={chart.b.y} r="5" fill="#fff" />
              <text x={chart.b.x + 10} y={chart.b.y + 4} fill="#fff" fontSize="14">B</text>
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}
