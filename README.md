# Environmental Intelligence Network (SIH 2026 prototype)

Simulated IoT + Edge AI + cloud early-warning command center for Nagpur. Runs fully locally from `backend/data/environmental_intelligence_mock_data.json`:
no sensors, MQTT, database, paid APIs or API keys needed. (Map tiles and the Street View embed use free public URLs and need internet; an offline fallback is shown.)

## Run
Backend (Python 3.10+):
```
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```
Frontend (Node 18+), in a second terminal:
```
cd frontend
npm install
npm run dev        # http://localhost:5173  (proxies /api to :8000)
```
Copy `.env.example` files only if you need to change defaults. API docs: http://localhost:8000/docs

## Demo flow
1. Dashboard opens in **Normal Environment** (all green).
2. Choose **Flash Flood** (use 5x speed for a faster rise) or press **Trigger Critical Alert**.
3. Watch NODE-NGP-003 water level/rainfall rise → edge AI flags FLOOD → risk fusion reaches Critical → 6 h forecast → map zone appears → click the zone or "Low-Lying Area Main Road" for the Street-Level Alert → alert card shows buzzer/push/SMS.
4. Offline mode: press **Disconnect** on NODE-NGP-003 (buffer grows), then **Restore** (records synchronized).

## Architecture notes
- `MockRepository.load()` is the only data source; replace it with an MQTT → TimescaleDB/PostGIS/Redis repository.
- Risk = 0.35·Sensor + 0.25·Trend + 0.20·Weather + 0.20·AI confidence (see `Engine.evaluate`).
- AI inference is rule-based with simulated confidence; XGBoost/LSTM forecasts are simulated from current readings.
- Alerts are deduplicated per node+hazard; a new alert is created only when severity increases.
