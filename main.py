import json
import threading
import time
from datetime import datetime
from contextlib import asynccontextmanager

import serial
import serial.tools.list_ports
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, text

# ─────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────
BAUD_RATE          = 9600
FREQ_THRESHOLD     = 500.0   # Hz — queen absent if above
P_ACCEPT_THRESHOLD = 0.7     # release if P_accept >= this

# Keywords to filter out non-Arduino ports (e.g. Bluetooth, modems)
# Add or remove strings based on what shows up on your machine
EXCLUDE_PORT_KEYWORDS = ["bluetooth", "bth", "irda", "modem"]

# ─────────────────────────────────────────────
# DATABASE
# ─────────────────────────────────────────────
engine = create_engine("sqlite:///sqis.db", connect_args={"check_same_thread": False})

def init_db():
    with engine.connect() as con:
        con.execute(text("""
            CREATE TABLE IF NOT EXISTS readings (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                hive_id      TEXT    NOT NULL,
                ts           TEXT    NOT NULL,
                temp         REAL,
                freq         REAL,
                queen_absent INTEGER,
                stability    REAL,
                p_accept     REAL,
                decision     TEXT
            )
        """))
        con.commit()

def save_reading(hive_id, ts, temp, freq, queen_absent, stability, p_accept, decision):
    with engine.connect() as con:
        con.execute(text("""
            INSERT INTO readings
                (hive_id, ts, temp, freq, queen_absent, stability, p_accept, decision)
            VALUES
                (:hive_id, :ts, :temp, :freq, :qa, :stab, :p, :d)
        """), {
            "hive_id": hive_id, "ts": ts, "temp": temp, "freq": freq,
            "qa": int(queen_absent), "stab": stability, "p": p_accept, "d": decision
        })
        con.commit()

# ─────────────────────────────────────────────
# IN-MEMORY STATE — grows dynamically as
# Arduinos are detected or plugged in
# ─────────────────────────────────────────────
hive_state: dict[str, dict] = {}
hive_threads: dict[str, threading.Thread] = {}
state_lock = threading.Lock()

def default_hive(hive_id: str, port: str) -> dict:
    return {
        "hive_id":      hive_id,
        "port":         port,
        "connected":    False,
        "ts":           None,
        "temp":         None,
        "freq":         None,
        "queen_absent": False,
        "stability":    None,
        "p_accept":     0.0,
        "decision":     "WAIT",
        "error":        None,
    }

# ─────────────────────────────────────────────
# PORT DISCOVERY
# ─────────────────────────────────────────────
def discover_arduino_ports() -> list[str]:
    """
    Scans all available serial ports and returns those that look like Arduinos.
    Filters out Bluetooth, modems, and other non-Arduino devices.
    Works on Windows (COMx), Mac (/dev/tty.usbmodem*), Linux (/dev/ttyUSB*, /dev/ttyACM*).
    """
    found = []
    for port in serial.tools.list_ports.comports():
        desc = (port.description or "").lower()
        name = (port.device or "").lower()

        # Skip known non-Arduino ports
        if any(kw in desc or kw in name for kw in EXCLUDE_PORT_KEYWORDS):
            continue

        # On Windows: keep COMx ports that have a device description
        # On Mac/Linux: keep ttyUSB* and ttyACM* (Arduino shows up here)
        if port.device:
            found.append(port.device)

    return found

# ─────────────────────────────────────────────
# DECISION LOGIC
# ─────────────────────────────────────────────
def compute(temp: float, freq: float) -> tuple[bool, float, float, str]:
    """
    Returns (queen_absent, stability, p_accept, decision)

    P_accept = 0.4·T + 0.2·S + 0.2·Q + 0.1·C − 0.1·D
      T = timing score    (fixed 0.5 ≈ 48h default)
      S = hive stability  (derived from temp deviation from 35°C)
      Q = queen quality   (fixed 0.7)
      C = colony strength (fixed 0.8)
      D = queenless duration penalty (fixed 0.3)
    """
    queen_absent = freq > FREQ_THRESHOLD
    stability    = round(max(0.0, 1.0 - abs(35.0 - temp) / 10.0), 3)

    T, S, Q, C, D = 0.5, stability, 0.7, 0.8, 0.3
    p_accept = round(min(max(0.4*T + 0.2*S + 0.2*Q + 0.1*C - 0.1*D, 0.0), 1.0), 3)

    decision = "RELEASE" if queen_absent and p_accept >= P_ACCEPT_THRESHOLD else "WAIT"
    return queen_absent, stability, p_accept, decision

# ─────────────────────────────────────────────
# SERIAL READER — one thread per Arduino
# ─────────────────────────────────────────────
def serial_reader(hive_id: str, port: str):
    """Continuously reads JSON lines from one Arduino. Auto-reconnects on disconnect."""
    while True:
        try:
            print(f"[{hive_id}] Connecting to {port}...")
            with serial.Serial(port, BAUD_RATE, timeout=3) as ser:
                with state_lock:
                    hive_state[hive_id]["connected"] = True
                    hive_state[hive_id]["error"]     = None
                print(f"[{hive_id}] Connected on {port}.")

                while True:
                    raw = ser.readline().decode("utf-8", errors="ignore").strip()
                    if not raw:
                        continue
                    try:
                        data = json.loads(raw)
                        temp = float(data["temp"])
                        freq = float(data["freq"])
                    except (json.JSONDecodeError, KeyError, ValueError):
                        continue  # skip malformed lines

                    queen_absent, stability, p_accept, decision = compute(temp, freq)
                    ts = datetime.now().isoformat()

                    with state_lock:
                        hive_state[hive_id].update({
                            "connected":    True,
                            "ts":           ts,
                            "temp":         temp,
                            "freq":         freq,
                            "queen_absent": queen_absent,
                            "stability":    stability,
                            "p_accept":     p_accept,
                            "decision":     decision,
                            "error":        None,
                        })

                    save_reading(hive_id, ts, temp, freq,
                                 queen_absent, stability, p_accept, decision)

                    print(f"[{hive_id}] temp={temp}°C  freq={freq}Hz  "
                          f"P={p_accept}  → {decision}")

        except serial.SerialException as e:
            with state_lock:
                hive_state[hive_id]["connected"] = False
                hive_state[hive_id]["error"]     = str(e)
            print(f"[{hive_id}] Disconnected: {e}. Retrying in 5s...")
            time.sleep(5)

# ─────────────────────────────────────────────
# PORT WATCHER — detects newly plugged Arduinos
# while the server is running
# ─────────────────────────────────────────────
def port_watcher():
    """
    Runs every 10 seconds. If a new serial port appears that isn't
    already being watched, it registers a new hive and starts a reader thread.
    This means you can plug in an Arduino AFTER the server starts and it
    will be picked up automatically.
    """
    while True:
        time.sleep(10)
        current_ports = set(discover_arduino_ports())
        known_ports   = {v["port"] for v in hive_state.values()}
        new_ports     = current_ports - known_ports

        for port in new_ports:
            hive_id = f"hive_{len(hive_state) + 1}"
            print(f"[watcher] New port detected: {port} → registering as {hive_id}")

            with state_lock:
                hive_state[hive_id] = default_hive(hive_id, port)

            t = threading.Thread(
                target=serial_reader,
                args=(hive_id, port),
                daemon=True
            )
            hive_threads[hive_id] = t
            t.start()

        # Mark hives whose port disappeared as disconnected
        disappeared = known_ports - set(discover_arduino_ports())
        for port in disappeared:
            for hive_id, state in hive_state.items():
                if state["port"] == port and state["connected"]:
                    with state_lock:
                        hive_state[hive_id]["connected"] = False
                        hive_state[hive_id]["error"] = "Port disconnected"
                    print(f"[watcher] Port {port} disappeared → {hive_id} marked offline")

# ─────────────────────────────────────────────
# APP STARTUP
# ─────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()

    # Auto-discover all currently connected Arduinos
    ports = discover_arduino_ports()
    if ports:
        print(f"[startup] Found {len(ports)} serial port(s): {ports}")
        for i, port in enumerate(ports):
            hive_id = f"hive_{i + 1}"
            hive_state[hive_id] = default_hive(hive_id, port)
            t = threading.Thread(
                target=serial_reader,
                args=(hive_id, port),
                daemon=True
            )
            hive_threads[hive_id] = t
            t.start()
    else:
        print("[startup] No serial ports found. Plug in an Arduino — "
              "the watcher will detect it automatically.")

    # Start background watcher for hot-plug support
    watcher = threading.Thread(target=port_watcher, daemon=True)
    watcher.start()

    print(f"[startup] SQIS server ready on port 8000. "
          f"Watching {len(hive_state)} hive(s).")
    yield

app = FastAPI(title="SQIS API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────
# ROUTES
# ─────────────────────────────────────────────
@app.get("/hives")
def get_all_hives():
    """Current live state of every hive — count is fully dynamic."""
    with state_lock:
        return list(hive_state.values())

@app.get("/hives/{hive_id}")
def get_hive(hive_id: str):
    """Current live state of one hive."""
    with state_lock:
        if hive_id not in hive_state:
            raise HTTPException(status_code=404, detail="Hive not found")
        return hive_state[hive_id]

@app.get("/hives/{hive_id}/history")
def get_history(hive_id: str, limit: int = 100):
    """Last N readings for one hive."""
    with state_lock:
        if hive_id not in hive_state:
            raise HTTPException(status_code=404, detail="Hive not found")
    with engine.connect() as con:
        rows = con.execute(text("""
            SELECT ts, temp, freq, queen_absent, stability, p_accept, decision
            FROM readings
            WHERE hive_id = :hive_id
            ORDER BY id DESC
            LIMIT :limit
        """), {"hive_id": hive_id, "limit": limit}).fetchall()
    return [dict(r._mapping) for r in reversed(rows)]

@app.get("/history")
def get_all_history(limit: int = 200):
    """Last N readings across all hives."""
    with engine.connect() as con:
        rows = con.execute(text("""
            SELECT hive_id, ts, temp, freq, queen_absent, p_accept, decision
            FROM readings
            ORDER BY id DESC
            LIMIT :limit
        """), {"limit": limit}).fetchall()
    return [dict(r._mapping) for r in reversed(rows)]

@app.get("/ports")
def list_ports():
    """Lists all serial ports currently visible — useful for debugging."""
    return [
        {"port": p.device, "description": p.description}
        for p in serial.tools.list_ports.comports()
    ]
