/**
 * SQIS Mobile App — branded for Zero Exclusion Carbon Poverty Campus Club ENIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Setup:
 *   npx create-expo-app sqis-mobile
 *   cd sqis-mobile
 *   npx expo install expo-asset
 *   Replace App.js with this file
 *   Put logo1.png inside assets/ folder of the project
 *   npx expo start  →  scan QR with Expo Go
 */

import { useState, useEffect, useCallback } from "react"
import {
  View, Text, ScrollView, TouchableOpacity, Image,
  RefreshControl, StyleSheet, StatusBar, ActivityIndicator,
} from "react-native"

// ── CONFIG ────────────────────────────────────────────────────────
const SERVER_IP   = "192.168.1.15"   // ← your laptop's local IP
const SERVER_PORT = "8000"
const API         = `http://${SERVER_IP}:${SERVER_PORT}`
const POLL_MS     = 5000
// ─────────────────────────────────────────────────────────────────

// ── Brand colors ─────────────────────────────────────────────────
const C = {
  primary:   "#ABB272",
  inclusion: "#B1D5BE",
  carbon:    "#469B63",
  poverty:   "#138141",
  bg:        "#F7F9F4",
  surface:   "#FFFFFF",
  border:    "#DDE8D0",
  text:      "#1A2E1A",
  muted:     "#6B7F5E",
  danger:    "#c0392b",
}

function StatBox({ label, value, accent }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, accent ? { color: accent } : null]}>
        {value ?? "—"}
      </Text>
    </View>
  )
}

function HiveCard({ hive }) {
  const [expanded, setExpanded] = useState(false)
  const isRelease = hive.decision === "RELEASE"

  return (
    <TouchableOpacity
      style={[
        styles.card,
        isRelease && styles.cardRelease,
        !hive.connected && styles.cardOffline,
      ]}
      onPress={() => setExpanded(e => !e)}
      activeOpacity={0.85}
    >
      {/* Header */}
      <View style={styles.cardHeader}>
        <View>
          <View style={styles.cardTitleRow}>
            <View style={[styles.dot,
              { backgroundColor: hive.connected ? C.carbon : C.danger }]} />
            <Text style={styles.cardTitle}>
              {hive.hive_id.replace(/_/g, " ").toUpperCase()}
            </Text>
          </View>
          {hive.ts && (
            <Text style={styles.cardTs}>
              {new Date(hive.ts).toLocaleTimeString()}
            </Text>
          )}
        </View>
        <View style={[styles.badge,
          { backgroundColor: isRelease ? C.carbon : C.bg,
            borderColor: isRelease ? C.carbon : C.border }]}>
          <Text style={[styles.badgeText,
            { color: isRelease ? "#fff" : C.muted }]}>
            {hive.decision ?? "WAIT"}
          </Text>
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <StatBox
          label="Temp"
          value={hive.temp != null ? `${hive.temp.toFixed(1)}°C` : null}
          accent={hive.temp != null && Math.abs(35 - hive.temp) > 3 ? C.primary : null}
        />
        <StatBox
          label="Freq"
          value={hive.freq != null ? `${hive.freq.toFixed(0)}Hz` : null}
          accent={hive.freq > 500 ? C.danger : null}
        />
        <StatBox
          label="P_accept"
          value={hive.p_accept != null ? hive.p_accept.toFixed(3) : null}
          accent={hive.p_accept >= 0.7 ? C.poverty : null}
        />
        <StatBox
          label="Queen"
          value={hive.queen_absent == null ? "—"
               : hive.queen_absent ? "ABSENT" : "PRESENT"}
          accent={hive.queen_absent ? C.danger : C.carbon}
        />
      </View>

      {/* Expanded */}
      {expanded && (
        <View style={styles.expandedRow}>
          <Text style={styles.expandedText}>
            Stability: {hive.stability?.toFixed(3) ?? "—"}
          </Text>
          {hive.error && (
            <Text style={[styles.expandedText, { color: C.danger }]}>
              ⚠ {hive.error}
            </Text>
          )}
        </View>
      )}
    </TouchableOpacity>
  )
}

export default function App() {
  const [hives,      setHives]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const fetchHives = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/hives`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setHives(data)
      setError(null)
    } catch {
      setError(`Cannot reach ${API}\nMake sure laptop is on the same WiFi.`)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchHives()
    const id = setInterval(fetchHives, POLL_MS)
    return () => clearInterval(id)
  }, [fetchHives])

  const onRefresh = () => { setRefreshing(true); fetchHives() }
  const releasing = hives.filter(h => h.decision === "RELEASE")
  const connected = hives.filter(h => h.connected).length

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={C.carbon} />
        <Text style={styles.loadingText}>Connecting to server…</Text>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={C.surface} />

      {/* ── Navbar ── */}
      <View style={styles.navbar}>
        <Image
          source={require("./assets/logo1.png")}
          style={styles.logo}
          resizeMode="contain"
        />
        <View style={styles.navbarCenter}>
          <Text style={styles.navTitle}>SQIS Monitor</Text>
          <Text style={styles.navSub}>Smart Queen Introduction System</Text>
        </View>
        <View style={styles.liveChip}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      </View>

      {/* ── Release banner ── */}
      {releasing.length > 0 && (
        <View style={styles.releaseBanner}>
          <Text style={styles.releaseBannerText}>
            🟢 RELEASE: {releasing.map(h => h.hive_id).join(", ")}
          </Text>
        </View>
      )}

      {/* ── Error banner ── */}
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C.carbon}
          />
        }
      >
        {/* ── Summary strip ── */}
        {hives.length > 0 && (
          <View style={styles.summaryRow}>
            {[
              { label: "Total",   value: hives.length,            accent: C.text },
              { label: "Online",  value: connected,               accent: C.carbon },
              { label: "Offline", value: hives.length - connected,
                accent: hives.length - connected > 0 ? C.danger : C.text },
              { label: "Release", value: releasing.length,
                accent: releasing.length > 0 ? C.poverty : C.text },
            ].map(s => (
              <View key={s.label} style={[styles.summaryCard,
                { borderTopColor: s.accent }]}>
                <Text style={styles.summaryLabel}>{s.label}</Text>
                <Text style={[styles.summaryValue, { color: s.accent }]}>
                  {s.value}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Empty state ── */}
        {hives.length === 0 && !error && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🐝</Text>
            <Text style={styles.emptyTitle}>
              Waiting for ESP32 devices…
            </Text>
            <Text style={styles.emptyDesc}>
              Cards appear automatically once a device connects
            </Text>
          </View>
        )}

        {/* ── Hive cards — fully dynamic ── */}
        {hives.map(hive => <HiveCard key={hive.hive_id} hive={hive} />)}

        {/* ── Footer ── */}
        <View style={styles.footer}>
          <Image
            source={require("./assets/logo1.png")}
            style={{ width: 80, height: 28 }}
            resizeMode="contain"
          />
          <Text style={styles.footerText}>
            Zero Exclusion · Zero Carbon · Zero Poverty{"\n"}
            Campus Club ENIT 2025–2026
          </Text>
          <Text style={styles.footerSub}>
            Auto-refresh every {POLL_MS / 1000}s · {API}
          </Text>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12,
            backgroundColor: C.bg },
  loadingText: { fontSize: 14, color: C.muted },

  // Navbar
  navbar: { backgroundColor: C.surface, paddingTop: 52, paddingBottom: 14,
            paddingHorizontal: 16, flexDirection: "row", alignItems: "center",
            gap: 12, borderBottomWidth: 2, borderBottomColor: C.primary,
            shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 4,
            shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  logo:        { width: 56, height: 40 },
  navbarCenter:{ flex: 1, borderLeftWidth: 1.5, borderLeftColor: C.border,
                 paddingLeft: 12 },
  navTitle:    { fontSize: 15, fontWeight: "700", color: C.poverty },
  navSub:      { fontSize: 11, color: C.muted, marginTop: 1 },
  liveChip:    { flexDirection: "row", alignItems: "center", gap: 5,
                 backgroundColor: C.bg, borderWidth: 1, borderColor: C.border,
                 borderRadius: 100, paddingHorizontal: 10, paddingVertical: 5 },
  liveDot:     { width: 7, height: 7, borderRadius: 4, backgroundColor: C.carbon },
  liveText:    { fontSize: 11, fontWeight: "700", color: C.carbon },

  // Banners
  releaseBanner:     { backgroundColor: C.inclusion, paddingVertical: 10,
                       paddingHorizontal: 16, borderBottomWidth: 1,
                       borderBottomColor: C.carbon },
  releaseBannerText: { color: C.poverty, fontWeight: "700", fontSize: 14 },
  errorBanner:       { backgroundColor: "#fdf2f2", paddingVertical: 10,
                       paddingHorizontal: 16 },
  errorBannerText:   { color: C.danger, fontSize: 13, lineHeight: 20 },

  list: { padding: 16, gap: 14 },

  // Summary strip
  summaryRow:   { flexDirection: "row", gap: 10, marginBottom: 6 },
  summaryCard:  { flex: 1, backgroundColor: C.surface, borderRadius: 10,
                  padding: 12, alignItems: "center",
                  borderWidth: 1, borderColor: C.border,
                  borderTopWidth: 3 },
  summaryLabel: { fontSize: 9, color: C.muted, textTransform: "uppercase",
                  letterSpacing: 0.8, marginBottom: 4 },
  summaryValue: { fontSize: 22, fontWeight: "700" },

  // Hive cards
  card: { backgroundColor: C.surface, borderRadius: 14, padding: 18,
          borderWidth: 1.5, borderColor: C.border },
  cardRelease: { borderColor: C.carbon,
                 shadowColor: C.carbon, shadowOpacity: 0.2,
                 shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
                 elevation: 4 },
  cardOffline: { opacity: 0.5, borderColor: "#f5c6c6" },

  cardHeader:   { flexDirection: "row", justifyContent: "space-between",
                  alignItems: "flex-start", marginBottom: 14 },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle:    { fontSize: 15, fontWeight: "700", color: C.text },
  cardTs:       { fontSize: 11, color: C.muted, marginTop: 3 },
  dot:          { width: 9, height: 9, borderRadius: 5 },

  badge:     { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 100,
               borderWidth: 1 },
  badgeText: { fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },

  statsRow:  { flexDirection: "row", gap: 8 },
  statBox:   { flex: 1, backgroundColor: C.bg, borderRadius: 8,
               padding: 10, alignItems: "center",
               borderWidth: 1, borderColor: C.border },
  statLabel: { fontSize: 9, color: C.muted, textTransform: "uppercase",
               letterSpacing: 0.5, marginBottom: 4 },
  statValue: { fontSize: 14, fontWeight: "600", color: C.text },

  expandedRow:  { marginTop: 12, paddingTop: 12,
                  borderTopWidth: 1, borderTopColor: C.border, gap: 4 },
  expandedText: { fontSize: 12, color: C.muted },

  // Empty state
  emptyState: { alignItems: "center", paddingVertical: 60 },
  emptyIcon:  { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: "600", color: C.text, marginBottom: 6 },
  emptyDesc:  { fontSize: 13, color: C.muted, textAlign: "center" },

  // Footer
  footer:     { alignItems: "center", marginTop: 24, paddingTop: 20,
                borderTopWidth: 1, borderTopColor: C.border, gap: 8 },
  footerText: { fontSize: 12, color: C.muted, textAlign: "center", lineHeight: 18 },
  footerSub:  { fontSize: 10, color: C.border },
})
