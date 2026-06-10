import { useState, useEffect } from "react"
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ReferenceLine, ResponsiveContainer, Legend
} from "recharts"

// ── CONFIG ────────────────────────────────────────────────────────
const API     = "http://localhost:8000"
const POLL_MS = 5000
// ─────────────────────────────────────────────────────────────────

// ── Brand colors (Zero Exclusion Carbon Poverty Campus Club) ──────
const BRAND = {
  primary:   "#ABB272",  // Vert Principal — unity & durability
  inclusion: "#B1D5BE",  // Zéro Exclusion — inclusion & diversity
  carbon:    "#469B63",  // Zéro Carbone   — ecological commitment
  poverty:   "#138141",  // Zéro Pauvreté  — social justice
  bg:        "#F7F9F4",
  surface:   "#FFFFFF",
  border:    "#DDE8D0",
  text:      "#1A2E1A",
  muted:     "#6B7F5E",
}

// Cycle through brand greens for multi-hive chart lines
const HIVE_COLORS = [BRAND.carbon, BRAND.poverty, BRAND.primary, BRAND.inclusion, "#2D6A4F"]

// ── Logo — inline SVG fallback + <img> with the uploaded logo ─────
function Logo({ size = 48 }) {
  return (
    <img
      src="/logo1.png"
      alt="Zero Exclusion Carbon Poverty Campus Club ENIT"
      style={{ height: size, width: "auto", objectFit: "contain" }}
      onError={e => { e.target.style.display = "none" }}
    />
  )
}

// ── Stat card ─────────────────────────────────────────────────────
function StatCard({ label, value, accent }) {
  return (
    <div style={{
      background: BRAND.bg,
      border: `1px solid ${BRAND.border}`,
      borderRadius: 10, padding: "14px 16px", flex: 1, minWidth: 100
    }}>
      <div style={{ fontSize: 10, color: BRAND.muted, textTransform: "uppercase",
                    letterSpacing: 1, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, color: accent ?? BRAND.text }}>
        {value ?? "—"}
      </div>
    </div>
  )
}

// ── Hive card ─────────────────────────────────────────────────────
function HiveCard({ hive }) {
  const isRelease = hive.decision === "RELEASE"
  return (
    <div style={{
      background: BRAND.surface,
      borderRadius: 14, padding: 20,
      border: `1.5px solid ${isRelease ? BRAND.carbon : BRAND.border}`,
      boxShadow: isRelease ? `0 0 0 3px ${BRAND.inclusion}` : "none",
      transition: "all 0.3s"
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between",
                    alignItems: "center", marginBottom: 14 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 9, height: 9, borderRadius: "50%",
              background: hive.connected ? BRAND.carbon : "#e57373"
            }} />
            <span style={{ fontWeight: 700, fontSize: 15, color: BRAND.text }}>
              {hive.hive_id.replace(/_/g, " ").toUpperCase()}
            </span>
          </div>
          {hive.ts && (
            <div style={{ fontSize: 11, color: BRAND.muted, marginTop: 2 }}>
              Last update: {new Date(hive.ts).toLocaleTimeString()}
            </div>
          )}
        </div>
        <div style={{
          background: isRelease ? BRAND.carbon : BRAND.bg,
          color: isRelease ? "#fff" : BRAND.muted,
          padding: "5px 14px", borderRadius: 100,
          fontWeight: 700, fontSize: 12, letterSpacing: 0.5,
          border: `1px solid ${isRelease ? BRAND.carbon : BRAND.border}`
        }}>
          {hive.decision ?? "WAIT"}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <StatCard
          label="Temp"
          value={hive.temp != null ? `${hive.temp.toFixed(1)}°C` : null}
          accent={hive.temp != null && Math.abs(35 - hive.temp) > 3 ? BRAND.primary : BRAND.text}
        />
        <StatCard
          label="Frequency"
          value={hive.freq != null ? `${hive.freq.toFixed(0)} Hz` : null}
          accent={hive.freq > 500 ? "#c0392b" : BRAND.text}
        />
        <StatCard
          label="P_accept"
          value={hive.p_accept != null ? hive.p_accept.toFixed(3) : null}
          accent={hive.p_accept >= 0.7 ? BRAND.poverty : BRAND.text}
        />
        <StatCard
          label="Queen absent"
          value={hive.queen_absent == null ? "—" : hive.queen_absent ? "YES" : "NO"}
          accent={hive.queen_absent ? "#c0392b" : BRAND.carbon}
        />
      </div>

      {hive.error && (
        <div style={{ fontSize: 12, color: "#c0392b", marginTop: 10 }}>⚠ {hive.error}</div>
      )}
    </div>
  )
}

// ── Main app ──────────────────────────────────────────────────────
export default function App() {
  const [hives,   setHives]   = useState([])
  const [history, setHistory] = useState({})
  const [error,   setError]   = useState(null)

  const fetchAll = async () => {
    try {
      const hivesRes  = await fetch(`${API}/hives`)
      if (!hivesRes.ok) throw new Error(`Status ${hivesRes.status}`)
      const hivesData = await hivesRes.json()
      setHives(hivesData)
      setError(null)

      // Fetch history for every connected hive dynamically
      const entries = await Promise.all(
        hivesData.map(async (h) => {
          const r    = await fetch(`${API}/hives/${h.hive_id}/history?limit=60`)
          const rows = await r.json()
          return [h.hive_id, rows]
        })
      )
      setHistory(Object.fromEntries(entries))
    } catch {
      setError(`Cannot reach ${API} — is the Python server running?`)
    }
  }

  useEffect(() => {
    fetchAll()
    const id = setInterval(fetchAll, POLL_MS)
    return () => clearInterval(id)
  }, [])

  const releasing = hives.filter(h => h.decision === "RELEASE")
  const connected = hives.filter(h => h.connected).length

  return (
    <div style={{ minHeight: "100vh", background: BRAND.bg,
                  fontFamily: "system-ui, sans-serif", color: BRAND.text }}>

      {/* ── Navbar ── */}
      <nav style={{
        background: BRAND.surface,
        borderBottom: `2px solid ${BRAND.primary}`,
        padding: "0 2rem",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        height: 64, position: "sticky", top: 0, zIndex: 100,
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Logo size={44} />
          <div style={{ borderLeft: `2px solid ${BRAND.border}`, paddingLeft: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: BRAND.poverty,
                          letterSpacing: 0.3 }}>SQIS Monitor</div>
            <div style={{ fontSize: 11, color: BRAND.muted }}>
              Smart Queen Introduction System
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: BRAND.carbon }}>
              {connected} / {hives.length} hives online
            </div>
            <div style={{ fontSize: 11, color: BRAND.muted }}>
              refresh every {POLL_MS / 1000}s
            </div>
          </div>
          {/* Live indicator */}
          <div style={{ display: "flex", alignItems: "center", gap: 6,
                        background: BRAND.bg, border: `1px solid ${BRAND.border}`,
                        borderRadius: 100, padding: "5px 12px" }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%",
                          background: BRAND.carbon,
                          boxShadow: `0 0 0 2px ${BRAND.inclusion}`,
                          animation: "pulse 2s infinite" }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: BRAND.carbon }}>LIVE</span>
          </div>
        </div>
      </nav>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
      `}</style>

      <div style={{ maxWidth: 980, margin: "0 auto", padding: "2rem 1.5rem" }}>

        {/* ── Error banner ── */}
        {error && (
          <div style={{ background: "#fdf2f2", border: "1px solid #f5c6c6",
                        borderRadius: 10, padding: "12px 16px", marginBottom: "1.5rem",
                        color: "#c0392b", fontSize: 14 }}>
            {error}
          </div>
        )}

        {/* ── Release alert ── */}
        {releasing.length > 0 && (
          <div style={{ background: BRAND.inclusion,
                        border: `1px solid ${BRAND.carbon}`,
                        borderRadius: 10, padding: "12px 16px", marginBottom: "1.5rem",
                        color: BRAND.poverty, fontWeight: 600, fontSize: 14 }}>
            🟢 RELEASE recommended: {releasing.map(h => h.hive_id).join(", ")}
          </div>
        )}

        {/* ── Summary strip ── */}
        {hives.length > 0 && (
          <div style={{ display: "flex", gap: 12, marginBottom: "1.5rem", flexWrap: "wrap" }}>
            {[
              { label: "Total hives",  value: hives.length },
              { label: "Online",       value: connected,
                accent: BRAND.carbon },
              { label: "Offline",      value: hives.length - connected,
                accent: hives.length - connected > 0 ? "#c0392b" : BRAND.text },
              { label: "Need release", value: releasing.length,
                accent: releasing.length > 0 ? BRAND.poverty : BRAND.text },
            ].map(s => (
              <div key={s.label} style={{
                background: BRAND.surface, border: `1px solid ${BRAND.border}`,
                borderRadius: 10, padding: "14px 20px", flex: 1, minWidth: 120,
                borderTop: `3px solid ${s.accent ?? BRAND.primary}`
              }}>
                <div style={{ fontSize: 10, color: BRAND.muted, textTransform: "uppercase",
                              letterSpacing: 1, marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 28, fontWeight: 700,
                              color: s.accent ?? BRAND.text }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Hive cards — fully dynamic ── */}
        {hives.length === 0 && !error ? (
          <div style={{ textAlign: "center", padding: "4rem 0", color: BRAND.muted }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🐝</div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>
              Waiting for ESP32 devices to connect…
            </div>
            <div style={{ fontSize: 13, marginTop: 6 }}>
              Hive cards will appear automatically once an ESP32 POSTs to /sensor
            </div>
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 16, marginBottom: "2.5rem"
          }}>
            {hives.map(hive => <HiveCard key={hive.hive_id} hive={hive} />)}
          </div>
        )}

        {/* ── Charts ── */}
        {hives.length > 0 && (<>

          {/* P_accept chart */}
          <div style={{ background: BRAND.surface, border: `1px solid ${BRAND.border}`,
                        borderRadius: 14, padding: "20px 20px 10px",
                        marginBottom: "1.5rem",
                        borderTop: `3px solid ${BRAND.carbon}` }}>
            <div style={{ fontWeight: 700, color: BRAND.text, marginBottom: 4 }}>
              P_accept over time
            </div>
            <div style={{ fontSize: 12, color: BRAND.muted, marginBottom: 16 }}>
              {hives.length} hive{hives.length > 1 ? "s" : ""} · last 60 readings · release threshold 0.70
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart>
                <XAxis dataKey="ts" hide allowDuplicatedCategory={false} />
                <YAxis domain={[0, 1]} tickCount={6}
                  style={{ fontSize: 11 }} tick={{ fill: BRAND.muted }} />
                <Tooltip
                  formatter={(v) => v.toFixed(3)}
                  labelFormatter={() => ""}
                  contentStyle={{ borderColor: BRAND.border, borderRadius: 8 }}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: BRAND.muted }} />
                <ReferenceLine y={0.7} stroke={BRAND.primary} strokeDasharray="5 4"
                  label={{ value: "0.70", position: "right",
                           fontSize: 11, fill: BRAND.primary }} />
                {Object.entries(history).map(([hive_id, data], i) => (
                  <Line key={hive_id} data={data} type="monotone"
                    dataKey="p_accept" name={hive_id.replace(/_/g, " ")}
                    stroke={HIVE_COLORS[i % HIVE_COLORS.length]}
                    dot={false} strokeWidth={2} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Frequency chart */}
          <div style={{ background: BRAND.surface, border: `1px solid ${BRAND.border}`,
                        borderRadius: 14, padding: "20px 20px 10px",
                        borderTop: `3px solid ${BRAND.poverty}` }}>
            <div style={{ fontWeight: 700, color: BRAND.text, marginBottom: 4 }}>
              Buzzing frequency
            </div>
            <div style={{ fontSize: 12, color: BRAND.muted, marginBottom: 16 }}>
              {hives.length} hive{hives.length > 1 ? "s" : ""} · 500 Hz threshold — above = queen absent
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart>
                <XAxis dataKey="ts" hide allowDuplicatedCategory={false} />
                <YAxis style={{ fontSize: 11 }} tick={{ fill: BRAND.muted }} />
                <Tooltip
                  formatter={(v) => `${v.toFixed(0)} Hz`}
                  labelFormatter={() => ""}
                  contentStyle={{ borderColor: BRAND.border, borderRadius: 8 }}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: BRAND.muted }} />
                <ReferenceLine y={500} stroke="#c0392b" strokeDasharray="5 4"
                  label={{ value: "500 Hz", position: "right",
                           fontSize: 11, fill: "#c0392b" }} />
                {Object.entries(history).map(([hive_id, data], i) => (
                  <Line key={hive_id} data={data} type="monotone"
                    dataKey="freq" name={hive_id.replace(/_/g, " ")}
                    stroke={HIVE_COLORS[i % HIVE_COLORS.length]}
                    dot={false} strokeWidth={2} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

        </>)}

        {/* ── Footer ── */}
        <div style={{ textAlign: "center", marginTop: "2.5rem", paddingTop: "1.5rem",
                      borderTop: `1px solid ${BRAND.border}` }}>
          <Logo size={32} />
          <div style={{ fontSize: 11, color: BRAND.muted, marginTop: 8 }}>
            Zero Exclusion · Zero Carbon · Zero Poverty · Campus Club ENIT 2025–2026
          </div>
        </div>

      </div>
    </div>
  )
}
