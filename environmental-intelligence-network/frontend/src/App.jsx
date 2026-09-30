import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { AlertTriangle, Battery, Eye, Pause, Play, RotateCcw, Wifi, WifiOff, X, Zap } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";
const call = async (p, m = "GET", b) => {
  const r = await fetch(API + p, { method: m, headers: { "Content-Type": "application/json" }, body: b ? JSON.stringify(b) : undefined });
  if (!r.ok) throw new Error(r.status);
  return r.json();
};
const COL = { safe: "#16a34a", low: "#65a30d", moderate: "#d97706", high: "#ea580c", critical: "#dc2626" };
const HZ = { flood: "Flood", air_pollution: "Air pollution", extreme_heat: "Extreme heat", heavy_rain: "Heavy rain" };
const FILTERS = [["all", "All"], ["flood", "Flood"], ["air_pollution", "Pollution"], ["extreme_heat", "Heat"], ["heavy_rain", "Weather"]];
const SCEN = [["normal", "Normal Environment"], ["heavy_rain", "Heavy Rain"], ["flash_flood", "Flash Flood"], ["pollution_spike", "Pollution Spike"], ["extreme_heat", "Extreme Heat"], ["multi_hazard", "Multiple Hazards"]];
const READ = [["temperature_c", "Temp", "°C"], ["humidity_percent", "Humidity", "%"], ["pressure_hpa", "Pressure", "hPa"], ["rainfall_mm_h", "Rainfall", "mm/h"],
  ["water_level_cm", "Water level", "cm"], ["pm25_ug_m3", "PM2.5", "µg/m³"], ["pm10_ug_m3", "PM10", "µg/m³"], ["co_ppm", "CO", "ppm"]];
const METRICS = [["water_level_cm", "Water level (cm)"], ["rainfall_mm_h", "Rainfall (mm/h)"], ["temperature_c", "Temperature (°C)"], ["pm25_ug_m3", "PM2.5 (µg/m³)"]];
const hm = (iso) => iso?.slice(11, 16);
const ok = (h, f) => f === "all" || h === f;

const Badge = ({ sev, children }) => (
  <span className="rounded px-2 py-0.5 text-xs font-semibold text-white" style={{ background: COL[sev] || "#64748b" }}>{children ?? sev}</span>
);
const Card = ({ title, right, children, className = "" }) => (
  <section className={`rounded-xl border border-slate-200 bg-white p-4 ${className}`}>
    {title && <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold text-slate-700">{title}</h2>{right}</div>}
    {children}
  </section>
);
const Bar = ({ v, sev }) => <div className="h-2 w-full rounded bg-slate-100"><div className="h-2 rounded" style={{ width: `${v}%`, background: COL[sev] || "#2563eb" }} /></div>;
const Btn = ({ children, className = "", ...p }) => (
  <button {...p} className={`rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-50 disabled:opacity-40 ${className}`}>{children}</button>
);

function MapView({ st, onNode, onZone, focus }) {
  const el = useRef(), map = useRef(), grp = useRef();
  useEffect(() => {
    map.current = L.map(el.current).setView([st.map.center.lat, st.map.center.lng], st.map.zoom);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(map.current);
    grp.current = L.layerGroup().addTo(map.current);
    return () => map.current.remove();
  }, []);
  useEffect(() => {
    grp.current.clearLayers();
    st.risk_zones.filter((z) => z.active).forEach((z) =>
      L.circle([z.center.lat, z.center.lng], { radius: z.radius_m, color: COL[z.severity], fillOpacity: 0.18, weight: 2 })
        .bindTooltip(`${z.name} · risk ${z.risk_score}`).on("click", () => onZone(z)).addTo(grp.current));
    st.sensors.forEach((s) => {
      const icon = L.divIcon({ className: "", iconSize: [26, 26], iconAnchor: [13, 13],
        html: `<div style="width:26px;height:26px;border-radius:50%;background:${COL[s.severity]};border:3px solid #fff;box-shadow:0 0 0 1px #0f1e3d55;color:#fff;font:700 10px/20px sans-serif;text-align:center">${s.risk}</div>` });
      L.marker([s.location.lat, s.location.lng], { icon }).bindTooltip(`${s.id} · ${s.name}`).on("click", () => onNode(s.id)).addTo(grp.current);
    });
  }, [st]);
  useEffect(() => { if (focus) map.current.flyTo([focus.lat, focus.lng], 15); }, [focus]);
  return <div ref={el} className="h-[440px] w-full rounded-lg" />;
}

function StreetModal({ sv, onClose }) {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => { const f = () => setOnline(navigator.onLine); addEventListener("online", f); addEventListener("offline", f); return () => { removeEventListener("online", f); removeEventListener("offline", f); }; }, []);
  const flood = sv.hazard === "flood";
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between"><h3 className="text-lg font-semibold">Street-Level Alert</h3><button onClick={onClose}><X size={18} /></button></div>
        <div className="grid gap-4 md:grid-cols-2">
          <dl className="space-y-2 text-sm">
            <div><dt className="text-slate-500">Road</dt><dd className="font-semibold">{sv.road_name}</dd></div>
            <div><dt className="text-slate-500">Hazard</dt><dd>{HZ[sv.hazard]}</dd></div>
            {flood && <div><dt className="text-slate-500">Water depth</dt><dd>{sv.water_depth_estimate_cm} cm</dd></div>}
            {flood && <div><dt className="text-slate-500">Visibility</dt><dd className="capitalize">{sv.visibility}</dd></div>}
            <div><dt className="text-slate-500">Risk</dt><dd><Badge sev={sv.active ? sv.severity : "safe"}>{sv.active ? sv.severity : "safe"} · {sv.risk_score}</Badge></dd></div>
            <div><dt className="text-slate-500">Recommendation</dt><dd className="text-lg font-bold" style={{ color: sv.active ? COL[sv.severity] : COL.safe }}>{sv.recommended_action}</dd></div>
            <a href={sv.street_view.url} target="_blank" rel="noreferrer" className="inline-block rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white"><Eye className="mr-1 inline" size={14} />View Street</a>
          </dl>
          {online ? <iframe title="street" className="h-64 w-full rounded-lg border" src={sv.street_view.embed_url} loading="lazy" />
            : <div className="flex h-64 items-center justify-center rounded-lg bg-slate-100 p-4 text-center text-sm text-slate-600">Street-level imagery unavailable — showing geospatial alert view.<br />{sv.location.lat}, {sv.location.lng}</div>}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [st, setSt] = useState(null), [err, setErr] = useState(false), [at, setAt] = useState(Date.now()), [now, setNow] = useState(Date.now());
  const [filter, setFilter] = useState("all"), [sel, setSel] = useState("NODE-NGP-003"), [street, setStreet] = useState(null), [focus, setFocus] = useState(null);
  const [hn, setHn] = useState("NODE-NGP-003"), [metric, setMetric] = useState("water_level_cm"), [range, setRange] = useState("6H"), [hist, setHist] = useState([]);

  const tick = useCallback(async () => { try { setSt(await call("/api/simulation/tick", "POST")); setAt(Date.now()); setErr(false); } catch { setErr(true); } }, []);
  const act = async (p, b) => { try { const r = await call(p, "POST", b); if (r.sim) setSt(r); else tick(); } catch { setErr(true); } };
  useEffect(() => { tick(); const i = setInterval(tick, 5000); return () => clearInterval(i); }, [tick]);
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  useEffect(() => { call(`/api/telemetry?node_id=${hn}&range=${range}`).then(setHist).catch(() => {}); }, [hn, range, st?.sim.clock]);

  if (!st) return <div className="p-10 text-slate-600">{err ? "Backend not reachable. Start it with: uvicorn main:app --reload (in /backend)" : "Connecting…"}</div>;
  const { sim, kpis, sensors, hazard_summary: hs } = st;
  const node = sensors.find((s) => s.id === sel), th = st.thresholds[metric];
  const top = node.hazards[node.top_hazard], preds = st.predictions;
  const openStreet = (nid) => { const sv = st.street_alerts.find((s) => s.active && st.risk_zones.find((z) => z.id === s.zone_id)?.node_id === nid); if (sv) setStreet(sv); };
  const flood = preds[0], heat = preds[1];
  const chartF = flood.predicted_water_level_cm.map((v, i) => ({ h: `+${flood.hours[i]}h`, v }));
  const chartH = heat.predicted_temperature_c.map((v, i) => ({ h: `+${heat.hours[i]}h`, v }));
  const KPI = [["Sensor nodes", kpis.total_nodes], ["Online", kpis.online_nodes], ["Active alerts", kpis.active_alerts], ["Critical zones", kpis.critical_zones], ["Network risk", kpis.risk_score + "%"]];

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Environmental Intelligence Network</h1>
          <p className="text-xs text-slate-500">Sense → Detect → Predict → Map → Alert → Respond · Nagpur pilot</p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className={`flex items-center gap-1 font-semibold ${err ? "text-red-600" : "text-green-600"}`}><span className={`h-2 w-2 rounded-full ${err ? "bg-red-600" : "bg-green-600 animate-pulse"}`} />{err ? "OFFLINE" : sim.running ? "LIVE" : "PAUSED"}</span>
          <span className="text-slate-500">Last updated: {Math.max(0, Math.round((now - at) / 1000))}s ago · sim {hm(sim.clock)}</span>
        </div>
      </header>

      <Card className="!border-blue-200 !bg-blue-50">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-2 font-bold text-blue-800"><input type="checkbox" checked={sim.enabled} onChange={(e) => act("/api/simulation/control", { enabled: e.target.checked })} />DEMO SIMULATION</label>
          <select className="rounded border border-slate-300 bg-white px-2 py-1" value={sim.scenario} disabled={!sim.enabled} onChange={(e) => act("/api/simulation/control", { scenario: e.target.value })}>
            {SCEN.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <span className="flex items-center gap-1">Speed {[1, 5, 10].map((s) => <Btn key={s} className={sim.speed === s ? "!bg-blue-600 !text-white" : ""} onClick={() => act("/api/simulation/control", { speed: s })}>{s}x</Btn>)}</span>
          <Btn onClick={() => act("/api/simulation/control", { running: true })}><Play size={12} className="mr-1 inline" />Start Simulation</Btn>
          <Btn onClick={() => act("/api/simulation/control", { running: false })}><Pause size={12} className="mr-1 inline" />Pause</Btn>
          <Btn onClick={() => act("/api/simulation/reset")}><RotateCcw size={12} className="mr-1 inline" />Reset</Btn>
          <Btn className="!border-red-300 !text-red-700" onClick={() => act("/api/simulation/trigger-critical")}><Zap size={12} className="mr-1 inline" />Trigger Critical Alert</Btn>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {KPI.map(([l, v], i) => <Card key={l}><div className="text-xs text-slate-500">{l}</div><div className="text-3xl font-bold" style={{ color: i === 4 ? COL[kpis.risk_score > 85 ? "critical" : kpis.risk_score > 70 ? "high" : kpis.risk_score > 50 ? "moderate" : "safe"] : undefined }}>{String(v).padStart(2, "0")}</div></Card>)}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Live Risk Map" className="lg:col-span-2" right={<span className="text-xs text-slate-500">Marker number = node risk score</span>}>
          <MapView st={st} focus={focus} onNode={setSel} onZone={(z) => { const sv = st.street_alerts.find((s) => s.zone_id === z.id); sv ? setStreet(sv) : setSel(z.node_id); }} />
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="font-semibold text-slate-600">Affected roads:</span>
            {st.street_alerts.filter((s) => s.active).map((s) => <Btn key={s.id} onClick={() => setStreet(s)} className="!border-red-200">{s.road_name} · {s.recommended_action}</Btn>)}
            {!st.street_alerts.some((s) => s.active) && <span className="text-green-600">No roads affected</span>}
          </div>
        </Card>
        <Card title={`AI Hazard Detection — ${node.name}`} right={<Badge sev={node.severity} />}>
          <div className="mb-2 flex flex-wrap gap-1">{sensors.map((s) => <Btn key={s.id} className={s.id === sel ? "!bg-blue-600 !text-white" : ""} onClick={() => setSel(s.id)}>{s.id.slice(-3)}</Btn>)}</div>
          <div className="space-y-3">
            {st.ai_inference.filter((i) => ok(i.hazard, filter)).length === 0 && <p className="text-sm text-green-700">All monitored hazards are below alert thresholds.</p>}
            {st.ai_inference.filter((i) => ok(i.hazard, filter)).map((i) => (
              <div key={i.id} className="rounded-lg border p-3 text-xs" style={{ borderColor: COL[i.severity] }}>
                <div className="flex items-center justify-between"><b className="text-sm uppercase">{HZ[i.hazard]}</b><Badge sev={i.severity} /></div>
                <div className="text-slate-500">{i.node_name}</div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1"><span>Risk: <b>{i.risk_score}/100</b></span><span>Confidence: <b>{Math.round(i.confidence * 100)}%</b></span>
                  <span>Inference: <b>{i.inference_location.toUpperCase()} AI</b></span><span>Latency: <b>{i.latency_ms} ms</b></span><span className="col-span-2">Model: <b>{i.model}</b></span></div>
                <div className="mt-1"><Bar v={i.confidence * 100} /></div>
                <ul className="mt-2 list-disc pl-4">{i.reasoning.map((r) => <li key={r}>{r}</li>)}</ul>
                <p className="mt-2 font-semibold">Action: <span className="font-normal">{i.recommended_action}</span></p>
              </div>))}
          </div>
        </Card>
      </div>

      <Card title="Multi-hazard detection" right={<div className="flex gap-1">{FILTERS.map(([k, l]) => <Btn key={k} className={filter === k ? "!bg-blue-600 !text-white" : ""} onClick={() => setFilter(k)}>{l}</Btn>)}</div>}>
        <div className="grid gap-3 md:grid-cols-4">
          {Object.entries(hs).filter(([h]) => ok(h, filter)).map(([h, x]) => (
            <div key={h} className="rounded-lg border p-3 text-sm"><div className="flex justify-between"><b>{HZ[h]}</b><Badge sev={x.severity} /></div>
              <div className="my-1"><Bar v={x.risk} sev={x.severity} /></div>
              <div className="text-xs text-slate-600">Risk {x.risk} · Confidence {Math.round(x.confidence * 100)}% · Alerts {x.alerts}</div>
              <div className="text-xs text-slate-500">Zones: {x.zones.join(", ") || "none"}</div></div>))}
        </div>
      </Card>

      <Card title="Live Sensors">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {sensors.map((s) => (
            <div key={s.id} className={`rounded-lg border p-3 text-xs ${s.id === sel ? "ring-2 ring-blue-400" : ""}`} style={{ borderColor: COL[s.severity] }}>
              <div className="flex items-start justify-between"><div><div className="font-bold">{s.id}</div><div className="text-slate-500">{s.name}</div></div><Badge sev={s.status === "online" ? "safe" : s.status === "degraded" ? "moderate" : "critical"}>{s.status.toUpperCase()}</Badge></div>
              <div className="my-2 flex items-center gap-3 text-slate-600"><span>{s.connectivity}</span><span><Battery size={12} className="mr-0.5 inline" />{s.battery_percent}%</span><span>{s.location.lat.toFixed(3)}, {s.location.lng.toFixed(3)}</span></div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">{READ.map(([k, l, u]) => <div key={k} className="flex justify-between"><span className="text-slate-500">{l}</span><b>{s.sensors[k]} {u}</b></div>)}</div>
              <div className="mt-2 rounded bg-slate-50 p-2">
                <div className="flex items-center justify-between font-semibold">{s.conn.state === "LOST" ? <span className="text-red-600"><WifiOff size={12} className="mr-1 inline" />LOST · LOCAL BUFFER ACTIVE</span> : <span className="text-green-700"><Wifi size={12} className="mr-1 inline" />CONNECTED</span>}
                  <Btn onClick={() => act(`/api/sensors/${s.id}/connectivity`, { connected: s.conn.state === "LOST" })}>{s.conn.state === "LOST" ? "Restore" : "Disconnect"}</Btn></div>
                {s.conn.state === "LOST" && <div>Buffered records: <b>{s.conn.buffer}</b> · Last sync {s.conn.last_sync}</div>}
                {s.conn.sync === "COMPLETED" && s.conn.state !== "LOST" && <div className="text-green-700">{s.conn.synced} RECORDS SYNCHRONIZED · Sync COMPLETED</div>}
              </div>
              <div className="mt-2 flex items-center justify-between"><span>Edge: <b>{s.edge_ai.inference}</b> ({Math.round(s.edge_ai.confidence * 100)}%)</span><Btn onClick={() => setSel(s.id)}>Details</Btn></div>
            </div>))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Predictive Intelligence" right={<span className="text-xs text-slate-500">{flood.model} · Confidence {Math.round(flood.confidence * 100)}%</span>}>
          <div className="mb-1 text-xs text-slate-600">Flood — next 6 h · risk probability <b>{flood.risk_probability_percent}%</b> · expected peak <b>{hm(flood.expected_peak_time)}</b> · predicted <b>{chartF[5].v} cm</b> at +6h</div>
          <ResponsiveContainer width="100%" height={170}><LineChart data={chartF}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="h" fontSize={11} /><YAxis fontSize={11} unit=" cm" /><Tooltip /><ReferenceLine y={st.thresholds.water_level_cm} stroke="#dc2626" strokeDasharray="4 4" /><Line dataKey="v" name="Water level" stroke="#2563eb" strokeWidth={2} isAnimationActive={false} /></LineChart></ResponsiveContainer>
          <div className="mb-1 mt-3 text-xs text-slate-600">Temperature — next 12 h · risk probability <b>{heat.risk_probability_percent}%</b> · expected peak <b>{hm(heat.expected_peak_time)}</b> · {heat.model} · Confidence {Math.round(heat.confidence * 100)}%</div>
          <ResponsiveContainer width="100%" height={150}><LineChart data={chartH}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="h" fontSize={11} /><YAxis fontSize={11} domain={["auto", "auto"]} unit="°" /><Tooltip /><ReferenceLine y={st.thresholds.temperature_c} stroke="#dc2626" strokeDasharray="4 4" /><Line dataKey="v" name="Temperature" stroke="#ea580c" strokeWidth={2} isAnimationActive={false} /></LineChart></ResponsiveContainer>
        </Card>

        <Card title="Active Alerts">
          <div className="max-h-[520px] space-y-3 overflow-auto">
            {st.alerts.filter((a) => ok(a.hazard, filter) && a.status !== "SUPERSEDED").length === 0 && <p className="text-sm text-green-700">No alerts. Try the Flash Flood scenario.</p>}
            {st.alerts.filter((a) => ok(a.hazard, filter) && a.status !== "SUPERSEDED").map((a) => (
              <div key={a.id} className="rounded-lg border-l-4 border p-3 text-xs" style={{ borderLeftColor: COL[a.severity] }}>
                <div className="flex items-center justify-between"><span><Badge sev={a.severity} /> <b className="ml-1 text-sm">{a.title}</b></span><span className="font-semibold">{a.status}</span></div>
                <div className="mt-1 text-slate-600">{a.id} · Created {hm(a.timestamp)} · Updated {hm(a.updated_at)} · {a.location}</div>
                <div className="mt-1">Risk <b>{a.risk_score}</b> · Confidence <b>{Math.round(a.confidence * 100)}%</b> · Escalation <b>Level {a.escalation_level}</b> · {a.updates} dedup updates</div>
                <div className="mt-1">{["local_buzzer", "dashboard", "push", "sms"].map((c) => <span key={c} className={`mr-2 ${a.channels.includes(c) ? "text-green-700" : "text-slate-300"}`}>{a.channels.includes(c) ? "✓" : "–"} {c.replace("_", " ")}</span>)}</div>
                {a.status !== "RESOLVED" && <div className="mt-2 flex gap-2">
                  <Btn disabled={a.status !== "ACTIVE"} onClick={() => act(`/api/alerts/${a.id}/acknowledge`)}>Acknowledge</Btn>
                  <Btn disabled={a.escalation_level >= 3} onClick={() => act(`/api/alerts/${a.id}/escalate`)}>Escalate</Btn>
                  <Btn onClick={() => { const s = sensors.find((x) => x.id === a.node_id); setFocus({ ...s.location, k: Math.random() }); setSel(a.node_id); openStreet(a.node_id); }}>View Location</Btn></div>}
              </div>))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Sensor History" className="lg:col-span-2" right={<div className="flex gap-1">{["1H", "6H", "24H"].map((r) => <Btn key={r} className={range === r ? "!bg-blue-600 !text-white" : ""} onClick={() => setRange(r)}>{r}</Btn>)}</div>}>
          <div className="mb-2 flex flex-wrap gap-2 text-xs">
            <select className="rounded border px-2 py-1" value={hn} onChange={(e) => setHn(e.target.value)}>{sensors.map((s) => <option key={s.id} value={s.id}>{s.id}</option>)}</select>
            {METRICS.map(([k, l]) => <Btn key={k} className={metric === k ? "!bg-blue-600 !text-white" : ""} onClick={() => setMetric(k)}>{l}</Btn>)}
          </div>
          <ResponsiveContainer width="100%" height={230}><LineChart data={hist.map((p) => ({ ...p, time: hm(p.t) }))}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="time" fontSize={11} minTickGap={30} /><YAxis fontSize={11} /><Tooltip />
            <ReferenceLine y={th} stroke="#dc2626" strokeDasharray="4 4" label={{ value: `threshold ${th}`, fontSize: 10, fill: "#dc2626" }} />
            <Line dataKey={metric} stroke="#2563eb" strokeWidth={2} isAnimationActive={false} dot={({ cx, cy, payload, index }) => payload[metric] > th ? <circle key={index} cx={cx} cy={cy} r={3.5} fill="#dc2626" /> : <g key={index} />} /></LineChart></ResponsiveContainer>
          <p className="text-xs text-slate-500">Red dots mark readings above the alert threshold.</p>
        </Card>

        <div className="space-y-4">
          <Card title={`Risk Fusion — ${node.id} · ${HZ[node.top_hazard]}`} right={<Badge sev={top.severity}>{top.risk}/100 {top.severity}</Badge>}>
            {[["Sensor risk", "sensor", .35], ["Trend risk", "trend", .25], ["Weather risk", "weather", .2], ["AI confidence", "ai", .2]].map(([l, k, w]) => (
              <div key={k} className="mb-2 text-xs"><div className="flex justify-between"><span>{w} × {l}</span><b>{top.factors[k]} → {(w * top.factors[k]).toFixed(1)}</b></div><Bar v={top.factors[k]} /></div>))}
            <p className="text-[11px] text-slate-500">0–30 Safe · 31–50 Low · 51–70 Moderate · 71–85 High · 86–100 Critical</p>
          </Card>
          <Card title="System Health">
            <div className="grid grid-cols-2 gap-1 text-xs">{Object.entries(st.system_health.services).map(([k, v]) => <div key={k} className="flex justify-between rounded bg-slate-50 px-2 py-1"><span>{k.replace(/_/g, " ")}</span><b style={{ color: ["DEGRADED", "PARTIAL"].includes(v) ? COL.moderate : COL.safe }}>{v}</b></div>)}</div>
            <div className="mt-2 grid grid-cols-4 gap-1 text-center text-xs">{[["Total", "total_nodes"], ["Online", "online_nodes"], ["Degraded", "degraded_nodes"], ["Offline", "offline_nodes"]].map(([l, k]) => <div key={k} className="rounded bg-slate-50 p-1"><div className="text-base font-bold">{st.system_health[k]}</div>{l}</div>)}</div>
          </Card>
        </div>
      </div>
      {street && <StreetModal sv={street} onClose={() => setStreet(null)} />}
      {err && <div className="fixed bottom-4 right-4 rounded-lg bg-red-600 px-4 py-2 text-sm text-white"><AlertTriangle size={14} className="mr-1 inline" />Backend unreachable — retrying</div>}
    </div>
  );
}
