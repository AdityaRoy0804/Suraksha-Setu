# Environmental Intelligence Network

**An end-to-end, multi-hazard environmental monitoring and early-warning platform: IoT sensors, Edge AI, and a live GIS command center.**

Smart India Hackathon 2026 · Problem Statement: `26178` · Team: `Aspirion`

![Status](https://img.shields.io/badge/status-prototype-blue) ![Python](https://img.shields.io/badge/python-3.10%2B-blue) ![Node](https://img.shields.io/badge/node-18%2B-green) ![License](https://img.shields.io/badge/license-MIT-lightgrey)

> Prototype Link : https://suraksha-setu-jlv1mhalw-aditya-kumar-roys-projects.vercel.app/

---

## 1. The Problem

Floods, air pollution, and heat waves are usually monitored by separate systems, and warnings often reach people after the damage begins. Sensor networks also fail exactly when they are needed most: during storms, when connectivity drops.

## 2. Our Solution

The Environmental Intelligence Network fuses data from low-power field sensors into one command center that answers five questions at a glance:

| Question | Where the dashboard answers it |
|---|---|
| What is happening? | AI Hazard Detection panel |
| Where is it happening? | Live Risk Map and affected-roads list |
| How severe is it? | Explainable risk score (0–100) |
| What will happen next? | Predictive Intelligence forecasts |
| What should people do? | Street-Level Alert and Alert Manager |

**Pipeline:** `SENSE → DETECT → PREDICT → MAP → ALERT → RESPOND`

## 3. Key Features

- **Real-time sensor monitoring** of 8 parameters per node: water level, rainfall, temperature, humidity, pressure, PM2.5, PM10, CO.
- **Edge AI inference** with model name, confidence, and latency per node.
- **Multi-hazard detection:** flood, air pollution, extreme heat, heavy rain.
- **Explainable risk fusion engine:** the score is shown as four weighted factors, not a black box.
- **Predictive intelligence:** 6-hour flood water-level forecast and 12-hour temperature forecast.
- **Live GIS map** with colour-coded nodes and risk-zone circles.
- **Street-level alerts** naming the affected road and a recommendation such as *AVOID ROUTE*.
- **Alert management:** acknowledge, escalate, and locate, with deduplication so repeated readings update one alert instead of spamming new ones.
- **Offline-first behaviour:** a disconnected node buffers readings locally and syncs them when it reconnects.
- **Historical charts** (1H / 6H / 24H) with threshold crossings highlighted.
- **System health** panel for services and node status.
- **Demo mode** with six scenarios, speed control, and a one-click critical alert.

## 4. Architecture

```
Sensors → Edge AI → LoRaWAN / NB-IoT → MQTT → Backend API
                                                   ↓
                            Time-series DB + Geospatial DB + Redis
                                                   ↓
                                        AI / Risk Engine
                                                   ↓
                                          GIS Dashboard
                                                   ↓
                                     Alerts / Notifications
```

The prototype simulates the whole pipeline in software, driven by `backend/data/environmental_intelligence_mock_data.json`. **No sensors, MQTT broker, database, paid APIs, or API keys are needed.**

| Layer | Prototype (this repo) | Production target |
|---|---|---|
| Sensing | Simulated readings | ESP32 nodes |
| Edge AI | Rule-based inference, simulated confidence | TensorFlow Lite models on-device |
| Transport | In-process | LoRaWAN / NB-IoT → MQTT |
| Storage | In-memory, seeded from JSON | PostgreSQL + TimescaleDB + PostGIS, Redis |
| Forecasting | Formula-based simulation | XGBoost + LSTM fusion |
| Alerts | Dashboard state | SMS / push gateways, local buzzer |

The backend reads all data through `MockRepository.load()`. To go live, replace that class with a repository backed by MQTT and TimescaleDB; the API and UI stay unchanged.

## 5. Tech Stack

- **Frontend:** React, Vite, Tailwind CSS, Recharts, Leaflet (OpenStreetMap), Lucide icons
- **Backend:** Python, FastAPI, Pydantic, Uvicorn
- **Data (prototype):** JSON mock data

## 6. Project Structure

```
environmental-intelligence-network/
├── backend/
│   ├── main.py                       # API, simulation engine, risk fusion, alert logic
│   ├── requirements.txt
│   ├── .env.example
│   └── data/environmental_intelligence_mock_data.json
├── frontend/
│   ├── src/App.jsx                   # dashboard UI
│   ├── src/main.jsx
│   ├── src/index.css
│   ├── index.html
│   ├── vite.config.js                # proxies /api to the backend
│   ├── package.json
│   └── .env.example
├── docs/screenshots/
└── README.md
```

## 7. Getting Started

**Prerequisites:** Python 3.10+ and Node.js 18+.

**1. Backend** (terminal 1)

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

The API runs at http://localhost:8000 and interactive docs at http://localhost:8000/docs.

**2. Frontend** (terminal 2)

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. Start the backend first.

## 8. Demo Walkthrough (about 3 minutes)

1. **Baseline.** The dashboard opens in *Normal Environment*: all nodes green and no alerts.
2. **Trigger.** Select **Flash Flood** and set speed to **5x**, or press **Trigger Critical Alert**.
3. **Sense.** Water level and rainfall rise on NODE-NGP-003.
4. **Detect.** Edge AI flags FLOOD RISK with confidence and latency shown.
5. **Score.** The Risk Fusion panel shows the weighted factors reaching **Critical**.
6. **Predict.** The 6-hour forecast chart projects the water level and expected peak.
7. **Map.** A red risk zone appears around the low-lying area.
8. **Street alert.** Click the zone or *Low-Lying Area Main Road* to see depth, visibility, and **AVOID ROUTE**.
9. **Alert.** The alert card shows the buzzer, dashboard, push, and SMS channels. Try *Acknowledge* and *Escalate*.
10. **Offline mode.** Press **Disconnect** on NODE-NGP-003 and watch the local buffer grow. Press **Restore** to see the records synchronized.

### Scenarios

| Scenario | Effect |
|---|---|
| Normal Environment | All readings settle at baseline |
| Heavy Rain | Rainfall and water levels rise, rain-hazard warnings |
| Flash Flood | Critical flood risk at the low-lying node, forecast, zone, street alert |
| Pollution Spike | PM2.5, PM10, and CO surge at the industrial node |
| Extreme Heat | Temperature climbs at the urban heat node |
| Multiple Hazards | Flood, pollution, and heat together |

## 9. Risk Fusion Engine

```
Risk = 0.35 × Sensor Risk + 0.25 × Trend Risk + 0.20 × Weather Risk + 0.20 × AI Confidence
```

Every term is normalised to 0–100.

| Score | Level |
|---|---|
| 0–30 | Safe |
| 31–50 | Low |
| 51–70 | Moderate |
| 71–85 | High |
| 86–100 | Critical |

Alerts are created at High and above. Each alert is tracked per node and hazard: while the hazard persists, the existing alert is refreshed, and a new alert is created only when severity increases. An alert resolves when the risk falls below 51.

## 10. API Reference

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/state` | Full dashboard state in one call |
| GET | `/api/sensors` · `/api/sensors/{id}` | Sensor nodes with readings and AI output |
| GET | `/api/telemetry?node_id=&range=1H\|6H\|24H` | Historical readings |
| GET | `/api/alerts` · `/api/alerts/{id}` | Alerts |
| GET | `/api/inference` | Active AI hazard detections |
| GET | `/api/predictions` | Flood and temperature forecasts |
| GET | `/api/risk-zones` | Risk zones with scores |
| GET | `/api/street-alerts` | Street-level alerts |
| GET | `/api/system-health` | Service and node health |
| POST | `/api/simulation/tick` | Advance the simulation one step |
| POST | `/api/simulation/control` | Set scenario, speed, running, enabled |
| POST | `/api/simulation/reset` | Reset to the normal baseline |
| POST | `/api/simulation/trigger-critical` | Force the critical flood demo |
| POST | `/api/sensors/{id}/connectivity` | Disconnect or restore a node |
| POST | `/api/alerts/{id}/acknowledge` | Acknowledge an alert |
| POST | `/api/alerts/{id}/escalate` | Raise escalation level (max 3) |

## 11. Configuration

Nothing is required for the demo. Optional variables are listed in `backend/.env.example` and `frontend/.env.example`.

| Variable | Where | Purpose |
|---|---|---|
| `MOCK_DATA_FILE` | backend | Path to the mock data JSON |
| `CORS_ORIGINS` | backend | Allowed frontend origins (default `http://localhost:5173`) |
| `VITE_API_URL` | frontend | Direct backend URL (leave empty to use the Vite proxy) |

## 12. Troubleshooting

- **"Backend not reachable" in the UI.** Confirm http://localhost:8000/api/state returns JSON. If it does, set the proxy target in `frontend/vite.config.js` to `http://127.0.0.1:8000` (some Node versions resolve `localhost` to IPv6) and restart `npm run dev`.
- **Map is blank.** Tiles load from OpenStreetMap and need internet access.
- **Port 8000 in use.** Run `uvicorn main:app --reload --port 8001` and set `VITE_API_URL=http://localhost:8001` in `frontend/.env`.
- **`node_modules` in Git.** Add `node_modules/`, `dist/`, `__pycache__/`, and `.env` to `.gitignore`.

## 13. Prototype Limitations

- AI inference is rule-based with simulated confidence, not trained TFLite models.
- Forecasts are formula-based simulations, not trained XGBoost/LSTM models.
- Sensor data is simulated, and state resets when the backend restarts.
- SMS, push, and buzzer channels are simulated in the UI; no messages are actually sent.
- Street View uses a keyless Google Maps embed and link, with a fallback when offline.

## 14. Roadmap

- [ ] ESP32 firmware and real sensor integration
- [ ] MQTT ingestion (LoRaWAN / NB-IoT gateway)
- [ ] TimescaleDB, PostGIS, and Redis persistence
- [ ] Trained TFLite edge models and XGBoost/LSTM forecasting service
- [ ] Real SMS and push notification gateways
- [ ] Authentication and role-based access for responders
- [ ] Multi-city deployment and mobile app for citizens



## 16. License

MIT. See `LICENSE`.
