"""Environmental Intelligence Network - prototype backend.
Swap MockRepository for an MQTT -> TimescaleDB/PostGIS repository later; Engine only calls repo.load()."""
import copy, json, math, os, random
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

DATA_FILE = Path(os.getenv("MOCK_DATA_FILE", Path(__file__).parent / "data" / "environmental_intelligence_mock_data.json"))
ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")

class MockRepository:
    def load(self): return json.loads(DATA_FILE.read_text())

M = ["water_level_cm", "rainfall_mm_h", "temperature_c", "humidity_percent", "pressure_hpa", "pm25_ug_m3", "pm10_ug_m3", "co_ppm"]
def n(*v): return dict(zip(M, v))
NORMAL = {"NODE-NGP-001": n(12, 1, 29, 62, 1010, 30, 55, .9), "NODE-NGP-002": n(4, 0, 31, 55, 1008, 30, 55, 1.2),
          "NODE-NGP-003": n(8, 1, 28, 65, 1010, 25, 45, .8), "NODE-NGP-004": n(2, 0, 33, 45, 1008, 30, 55, 1.0)}
FLOOD = {"NODE-NGP-003": dict(water_level_cm=95, rainfall_mm_h=78, humidity_percent=96, pressure_hpa=998),
         "NODE-NGP-001": dict(water_level_cm=45, rainfall_mm_h=50, humidity_percent=90, pressure_hpa=1003)}
RAIN = {"NODE-NGP-001": dict(water_level_cm=40, rainfall_mm_h=55, humidity_percent=88, pressure_hpa=1004),
        "NODE-NGP-003": dict(water_level_cm=45, rainfall_mm_h=60, humidity_percent=90, pressure_hpa=1002)}
POLL = {"NODE-NGP-002": dict(pm25_ug_m3=185, pm10_ug_m3=295, co_ppm=7.2), "NODE-NGP-004": dict(pm25_ug_m3=90, pm10_ug_m3=140, co_ppm=2.4)}
HEAT = {"NODE-NGP-004": dict(temperature_c=40.5, humidity_percent=30), "NODE-NGP-002": dict(temperature_c=37)}
def merge(*ds):
    out = {}
    for d in ds:
        for k, v in d.items(): out.setdefault(k, {}).update(v)
    return out
SCEN = {"normal": {}, "heavy_rain": RAIN, "flash_flood": FLOOD, "pollution_spike": POLL, "extreme_heat": HEAT, "multi_hazard": merge(FLOOD, POLL, HEAT)}

RAW = {  # sensor risk 0-100 per hazard
    "flood": lambda s: s["water_level_cm"] * 1.1 + s["rainfall_mm_h"] * .4,
    "air_pollution": lambda s: max(s["pm25_ug_m3"] / 1.8, s["pm10_ug_m3"] / 3, s["co_ppm"] * 8),
    "extreme_heat": lambda s: (s["temperature_c"] - 32) * 11,
    "heavy_rain": lambda s: s["rainfall_mm_h"] * 1.4}
WX = {  # weather-context risk 0-100 per hazard
    "flood": lambda s: s["rainfall_mm_h"] * 1.2 + max(0, 1010 - s["pressure_hpa"]) * 2,
    "heavy_rain": lambda s: s["rainfall_mm_h"] * 1.2 + max(0, 1010 - s["pressure_hpa"]) * 2,
    "air_pollution": lambda s: max(0, 100 - s["humidity_percent"]) * .6 + max(0, s["pressure_hpa"] - 1000) * 2,
    "extreme_heat": lambda s: (s["temperature_c"] - 30) * 6 + max(0, 50 - s["humidity_percent"]) * .5}
MODEL = {"flood": "Flood-TFLite-v2", "air_pollution": "AirQuality-TFLite-v1", "extreme_heat": "ExtremeWeather-TFLite-v1", "heavy_rain": "ExtremeWeather-TFLite-v1"}
RULES = {
    "flood": [("Rapid water-level increase", lambda s, d: d > 1), ("Water level above safe mark", lambda s, d: s["water_level_cm"] > 35),
              ("High rainfall intensity", lambda s, d: s["rainfall_mm_h"] > 30), ("Low atmospheric pressure", lambda s, d: s["pressure_hpa"] < 1004),
              ("High humidity", lambda s, d: s["humidity_percent"] > 85)],
    "air_pollution": [("PM2.5 above threshold", lambda s, d: s["pm25_ug_m3"] > 60), ("PM10 concentration elevated", lambda s, d: s["pm10_ug_m3"] > 100),
                      ("CO concentration rising", lambda s, d: s["co_ppm"] > 3)],
    "extreme_heat": [("Temperature above 38 °C", lambda s, d: s["temperature_c"] > 38), ("Low humidity raises heat stress", lambda s, d: s["humidity_percent"] < 45),
                     ("Temperature trending up", lambda s, d: d > 1)],
    "heavy_rain": [("Rainfall above 40 mm/h", lambda s, d: s["rainfall_mm_h"] > 40), ("Falling atmospheric pressure", lambda s, d: s["pressure_hpa"] < 1004),
                   ("High humidity", lambda s, d: s["humidity_percent"] > 85)]}
ACT = {"flood": "Issue immediate local warning and notify emergency response team.", "air_pollution": "Publish air-quality warning and identify affected zone.",
       "extreme_heat": "Issue heat advisory; open cooling centres and warn vulnerable groups.", "heavy_rain": "Issue rainfall advisory; pre-position drainage and response crews."}
TITLE = {"flood": "Flash Flood Risk Detected", "air_pollution": "Air Quality Alert", "extreme_heat": "Extreme Heat Warning", "heavy_rain": "Heavy Rainfall Warning"}
CH = {"critical": ["local_buzzer", "dashboard", "push", "sms"], "high": ["dashboard", "push", "sms"]}
THRESH = {"water_level_cm": 50, "rainfall_mm_h": 50, "temperature_c": 38, "pm25_ug_m3": 60}
ZMAP = {"ZONE-001": ("NODE-NGP-003", "flood"), "ZONE-002": ("NODE-NGP-002", "air_pollution"), "ZONE-003": ("NODE-NGP-004", "extreme_heat")}
SVMAP = {"SV-001": "ZONE-001", "SV-002": "ZONE-002"}
RANK = {"safe": 0, "low": 1, "moderate": 2, "high": 3, "critical": 4}
OPEN = ("ACTIVE", "ACKNOWLEDGED")
def sev(r): return "safe" if r <= 30 else "low" if r <= 50 else "moderate" if r <= 70 else "high" if r <= 85 else "critical"

class Engine:
    def __init__(self, repo): self.repo = repo; self.reset()

    def reset(self):
        self.raw = self.repo.load(); self.nodes = copy.deepcopy(self.raw["sensor_nodes"])
        for nd in self.nodes:
            nd["sensors"] = dict(NORMAL[nd["id"]]); nd["conn"] = dict(state="CONNECTED", buffer=0, last_sync=None, sync="IDLE", synced=0)
        self.scenario, self.enabled, self.running, self.speed = "normal", True, True, 1
        self.clock = datetime.fromisoformat(self.raw["simulation"]["last_updated"])
        self.alerts, self.seq, self.prev = [], 0, {}
        self.hist = {nd["id"]: [] for nd in self.nodes}
        for i in range(48, 0, -1):
            for nd in self.nodes: self.hist[nd["id"]].append(self.point(nd, self.clock - timedelta(minutes=30 * i), .04))
        self.evaluate()

    def node(self, nid):
        for nd in self.nodes:
            if nd["id"] == nid: return nd
        raise HTTPException(404, "Node not found")

    def point(self, nd, t, j=0):
        return {"t": t.isoformat(), **{k: round(max(0, nd["sensors"][k] * (1 + random.uniform(-j, j))), 1) for k in THRESH}}

    def tick(self):
        if self.running:
            self.clock += timedelta(minutes=5 * self.speed)
            f = min(.6, .15 * self.speed); tgt = SCEN[self.scenario] if self.enabled else {}
            for nd in self.nodes:
                S, T = nd["sensors"], tgt.get(nd["id"], {})
                for k in M:
                    base = T.get(k, NORMAL[nd["id"]][k]) if self.enabled else S[k]
                    S[k] = max(0, S[k] + (base - S[k]) * f + random.gauss(0, abs(base) * .012 + .02))
                nd["battery_percent"] = max(5, nd["battery_percent"] - random.choice([0, 0, 0, .1]))
                if nd["conn"]["state"] == "LOST": nd["conn"]["buffer"] += 3 * self.speed
                self.hist[nd["id"]] = (self.hist[nd["id"]] + [self.point(nd, self.clock)])[-400:]
            self.evaluate()
        return self.state()

    def evaluate(self):
        for nd in self.nodes:
            S, H = nd["sensors"], {}
            for h, fn in RAW.items():
                raw = min(100, fn(S)); key = (nd["id"], h); d = raw - self.prev.get(key, raw); self.prev[key] = raw
                trend = min(100, max(d * 4, .6 * raw, 0)); wx = min(100, max(0, WX[h](S)))
                conf = min(.99, .55 + .45 * raw / 100 + random.uniform(-.01, .01))
                risk = round(min(100, .35 * raw + .25 * trend + .20 * wx + .20 * conf * 100))
                H[h] = dict(risk=risk, severity=sev(risk), confidence=round(conf, 2), model=MODEL[h], latency_ms=random.randint(30, 44),
                            factors=dict(sensor=round(raw), trend=round(trend), weather=round(wx), ai=round(conf * 100)),
                            reasoning=[r for r, f in RULES[h] if f(S, d)])
            nd["hazards"], nd["top"] = H, max(H, key=lambda h: H[h]["risk"]); nd["risk"] = H[nd["top"]]["risk"]
            nd["status"] = "offline" if nd["conn"]["state"] == "LOST" else "degraded" if nd["battery_percent"] < 40 else "online"
        self.update_alerts()

    def update_alerts(self):
        now = self.clock.isoformat()
        for nd in self.nodes:
            for h, x in nd["hazards"].items():
                act = next((a for a in self.alerts if a["node_id"] == nd["id"] and a["hazard"] == h and a["status"] in OPEN), None)
                if x["risk"] >= 71:
                    if act and RANK[x["severity"]] <= RANK[act["severity"]]:  # dedupe: refresh existing alert only
                        act.update(updated_at=now, risk_score=x["risk"], confidence=x["confidence"], updates=act["updates"] + 1); continue
                    lvl = 2 if x["severity"] == "critical" else 1
                    if act: act["status"] = "SUPERSEDED"; lvl = max(lvl, act["escalation_level"])
                    self.seq += 1
                    self.alerts.append(dict(id=f"ALT-{self.seq:03d}", timestamp=now, updated_at=now, hazard=h, severity=x["severity"], title=TITLE[h],
                        message=f"{TITLE[h]} at {nd['name']} (risk {x['risk']}/100). {ACT[h]}", node_id=nd["id"], location=nd["name"],
                        risk_score=x["risk"], confidence=x["confidence"], channels=CH.get(x["severity"], ["dashboard"]), status="ACTIVE",
                        escalation_level=lvl, updates=0))
                elif act and x["risk"] < 51: act.update(status="RESOLVED", updated_at=now)

    def alert(self, aid):
        for a in self.alerts:
            if a["id"] == aid: return a
        raise HTTPException(404, "Alert not found")

    def predictions(self):
        n3, n4 = self.node("NODE-NGP-003"), self.node("NODE-NGP-004")
        w, r = n3["sensors"]["water_level_cm"], n3["sensors"]["rainfall_mm_h"]; t = n4["sensors"]["temperature_c"]
        pk = self.clock.replace(hour=14, minute=0, second=0, microsecond=0)
        if pk <= self.clock: pk += timedelta(days=1)
        fx, hx = n3["hazards"]["flood"], n4["hazards"]["extreme_heat"]
        return [dict(id="PRED-001", node_id=n3["id"], hazard="flood", forecast_horizon_hours=6, hours=list(range(1, 7)),
                     risk_probability_percent=round(fx["risk"] * .97), predicted_water_level_cm=[round(w + h * r * .03 + h * h * r * .008, 1) for h in range(1, 7)],
                     expected_peak_time=(self.clock + timedelta(hours=6)).isoformat(), model="XGBoost-LSTM-Fusion", confidence=round(fx["confidence"] - .05, 2)),
                dict(id="PRED-002", node_id=n4["id"], hazard="extreme_heat", forecast_horizon_hours=12, hours=[2, 4, 6, 8, 10, 12],
                     risk_probability_percent=round(hx["risk"] * .95), predicted_temperature_c=[round(t + x * .2 - x * x * .004, 1) for x in [2, 4, 6, 8, 10, 12]],
                     expected_peak_time=pk.isoformat(), model="XGBoost-Weather-v1", confidence=round(hx["confidence"] - .03, 2))]

    def zones(self):
        zs = copy.deepcopy(self.raw["risk_zones"])
        zs.append(dict(id="ZONE-003", name="Urban Heat Island", hazard="extreme_heat", affected_population_estimate=5200, center=self.node("NODE-NGP-004")["location"], radius_m=900))
        for z in zs:
            nid, h = ZMAP[z["id"]]; x = self.node(nid)["hazards"][h]
            z.update(node_id=nid, risk_score=x["risk"], severity=x["severity"], active=x["risk"] >= 51,
                     affected_population_estimate=round(z["affected_population_estimate"] * min(1, x["risk"] / 94)))
        return zs

    def street_alerts(self, zones):
        out = []
        for sv in self.raw["street_view_alerts"]:
            z = next(z for z in zones if z["id"] == SVMAP[sv["id"]]); nd = self.node(z["node_id"]); loc = sv["location"]
            a = next((a for a in self.alerts if a["node_id"] == nd["id"] and a["hazard"] == z["hazard"] and a["status"] in OPEN), None)
            o = dict(sv, active=z["active"], severity=z["severity"], hazard=z["hazard"], risk_score=z["risk_score"], zone_id=z["id"], alert_id=a["id"] if a else None,
                     street_view=dict(sv["street_view"], url=f"https://www.google.com/maps/@?api=1&map_action=pano&viewpoint={loc['lat']},{loc['lng']}",
                                      embed_url=f"https://maps.google.com/maps?q={loc['lat']},{loc['lng']}&z=17&output=embed"))
            if z["hazard"] == "flood":
                o["water_depth_estimate_cm"] = round(nd["sensors"]["water_level_cm"] * .62)
                o["visibility"] = "reduced" if nd["sensors"]["rainfall_mm_h"] > 30 else "normal"
                o["recommended_action"] = "AVOID ROUTE" if z["active"] else "Route clear"
            else: o["recommended_action"] = sv["recommended_action"] if z["active"] else "Air quality acceptable"
            out.append(o)
        return out

    def state(self):
        N = self.nodes; zones = self.zones(); sensors, inf = [], []
        for nd in N:
            top = nd["hazards"][nd["top"]]
            sensors.append(dict(id=nd["id"], name=nd["name"], location=nd["location"], status=nd["status"], connectivity=nd["connectivity"],
                battery_percent=round(nd["battery_percent"]), sensors={k: round(v, 1) for k, v in nd["sensors"].items()},
                edge_ai=dict(model=top["model"], inference=nd["top"].upper() + "_RISK" if top["risk"] >= 51 else "NORMAL", confidence=top["confidence"],
                             latency_ms=top["latency_ms"], decision_source="edge"),
                hazards=nd["hazards"], risk=nd["risk"], severity=sev(nd["risk"]), top_hazard=nd["top"], conn=nd["conn"]))
            for h, x in nd["hazards"].items():
                if x["risk"] >= 51:
                    inf.append(dict(id=f"INF-{len(inf) + 1:03d}", node_id=nd["id"], node_name=nd["name"], hazard=h, severity=x["severity"], confidence=x["confidence"],
                        probability_percent=x["risk"], risk_score=x["risk"], reasoning=x["reasoning"], model=x["model"], latency_ms=x["latency_ms"], inference_location="edge",
                        factors=x["factors"], recommended_action=ACT[h] if x["risk"] >= 71 else "Increase monitoring frequency and prepare advisories."))
        hs = {}
        for h in RAW:
            b = max(N, key=lambda nd: nd["hazards"][h]["risk"]); x = b["hazards"][h]
            hs[h] = dict(risk=x["risk"], confidence=x["confidence"], severity=x["severity"], node_id=b["id"],
                         alerts=sum(1 for a in self.alerts if a["hazard"] == h and a["status"] in OPEN), zones=[z["name"] for z in zones if z["hazard"] == h and z["active"]])
        risks = [nd["risk"] for nd in N]; lost = any(nd["conn"]["state"] == "LOST" for nd in N)
        cnt = lambda s: sum(1 for nd in N if nd["status"] == s)
        return dict(
            sim=dict(scenario=self.scenario, enabled=self.enabled, running=self.running, speed=self.speed, clock=self.clock.isoformat(), refresh_interval_seconds=5),
            map=self.raw["map"], thresholds=THRESH, sensors=sensors, ai_inference=inf, hazard_summary=hs, predictions=self.predictions(), risk_zones=zones,
            street_alerts=self.street_alerts(zones), alerts=sorted(self.alerts, key=lambda a: a["updated_at"], reverse=True),
            kpis=dict(total_nodes=len(N), online_nodes=cnt("online") + cnt("degraded"), active_alerts=sum(1 for a in self.alerts if a["status"] in OPEN),
                      critical_zones=sum(1 for z in zones if z["severity"] == "critical"), risk_score=round(.6 * max(risks) + .4 * sum(risks) / len(risks))),
            system_health=dict(total_nodes=len(N), online_nodes=cnt("online"), degraded_nodes=cnt("degraded"), offline_nodes=cnt("offline"),
                services=dict(mqtt_broker="CONNECTED", ai_engine="HEALTHY", database="HEALTHY", api="HEALTHY",
                              lora_gateway="DEGRADED" if lost else "CONNECTED", cloud_sync="PARTIAL" if lost else "ACTIVE"), last_sync=self.clock.isoformat()))

engine = Engine(MockRepository())
app = FastAPI(title="Environmental Intelligence Network")
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["*"], allow_headers=["*"])

class Control(BaseModel):
    scenario: Optional[str] = None; running: Optional[bool] = None; speed: Optional[int] = None; enabled: Optional[bool] = None
class Conn(BaseModel): connected: bool

@app.get("/api/state")
def get_state(): return engine.state()
@app.get("/api/sensors")
def sensors(): return engine.state()["sensors"]
@app.get("/api/sensors/{sid}")
def sensor(sid: str): return next(s for s in engine.state()["sensors"] if s["id"] == engine.node(sid)["id"])
@app.get("/api/telemetry")
def telemetry(node_id: Optional[str] = None, range: str = "6H"):
    hrs = {"1H": 1, "6H": 6, "24H": 24}.get(range.upper(), 6); cut = (engine.clock - timedelta(hours=hrs)).isoformat()
    f = lambda nid: [p for p in engine.hist[nid] if p["t"] >= cut]
    return f(engine.node(node_id)["id"]) if node_id else {k: f(k) for k in engine.hist}
@app.get("/api/alerts")
def alerts(): return engine.state()["alerts"]
@app.get("/api/alerts/{aid}")
def alert(aid: str): return engine.alert(aid)
@app.get("/api/inference")
def inference(): return engine.state()["ai_inference"]
@app.get("/api/predictions")
def predictions(): return engine.predictions()
@app.get("/api/risk-zones")
def zones(): return engine.zones()
@app.get("/api/street-alerts")
def street(): return engine.state()["street_alerts"]
@app.get("/api/system-health")
def health(): return engine.state()["system_health"]

@app.post("/api/simulation/tick")
def tick(): return engine.tick()
@app.post("/api/simulation/control")
def control(c: Control):
    if c.scenario is not None:
        if c.scenario not in SCEN: raise HTTPException(400, "Unknown scenario")
        engine.scenario = c.scenario
    if c.running is not None: engine.running = c.running
    if c.enabled is not None: engine.enabled = c.enabled
    if c.speed in (1, 5, 10): engine.speed = c.speed
    return engine.state()
@app.post("/api/simulation/reset")
def reset(): engine.reset(); return engine.state()
@app.post("/api/simulation/trigger-critical")
def trigger():
    engine.scenario, engine.enabled = "flash_flood", True
    engine.node("NODE-NGP-003")["sensors"].update(water_level_cm=95, rainfall_mm_h=78, humidity_percent=96, pressure_hpa=998, temperature_c=26.9)
    engine.evaluate(); return engine.state()
@app.post("/api/sensors/{sid}/connectivity")
def connectivity(sid: str, c: Conn):
    nd = engine.node(sid); cn = nd["conn"]; hm = engine.clock.strftime("%H:%M")
    if not c.connected and cn["state"] != "LOST": nd["conn"] = dict(state="LOST", buffer=0, last_sync=hm, sync="BUFFERING", synced=0)
    elif c.connected and cn["state"] == "LOST": nd["conn"] = dict(state="CONNECTED", buffer=0, last_sync=hm, sync="COMPLETED", synced=cn["buffer"])
    engine.evaluate(); return engine.state()
@app.post("/api/alerts/{aid}/acknowledge")
def ack(aid: str):
    a = engine.alert(aid)
    if a["status"] == "ACTIVE": a["status"] = "ACKNOWLEDGED"
    return a
@app.post("/api/alerts/{aid}/escalate")
def esc(aid: str):
    a = engine.alert(aid); a["escalation_level"] = min(3, a["escalation_level"] + 1)
    if "sms" not in a["channels"]: a["channels"] = a["channels"] + ["push", "sms"]
    return a
