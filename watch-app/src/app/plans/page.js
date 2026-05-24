"use client";
import { useState, useEffect, useRef } from "react";
import { ACTIVITY_CATALOG } from "../../lib/domains/plans/activityCatalog";
import { transformCatalog, enrichItems } from "../../lib/domains/plans/transform";
import { plansConfig, GROUP_TYPES, TIME_OPTIONS, BUDGET_OPTIONS, LOCATION_OPTIONS, VIBES, CITIES, DOMAIN } from "../../lib/domains/plans/config";
import { runSoloEngine } from "../../lib/engine/core";
import { createSeenTracker, setLastPickTime, isImplicitRejection } from "../../lib/engine/seen";
import { logPick, logRejection } from "../../lib/engine/logger";

const CITY_STORAGE_KEY = "plans-city";

export default function PlansPage() {

  // ── Filters ──
  const [groupType, setGroupType] = useState("");
  const [time, setTime] = useState("");
  const [budget, setBudget] = useState("");
  const [location, setLocation] = useState("");
  const [vibe, setVibe] = useState("");
  const [city, setCity] = useState("");
  const [showCityPicker, setShowCityPicker] = useState(false);

  // ── Engine ──
  const [activityList, setActivityList] = useState([]);
  const [appReady, setAppReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // ── Results ──
  const [results, setResults] = useState([]);
  const [noResults, setNoResults] = useState(false);
  const [wasReset, setWasReset] = useState(false);

  // ── Seen tracker ──
  const seenTrackerRef = useRef(null);
  if (!seenTrackerRef.current) {
    seenTrackerRef.current = createSeenTracker(`${DOMAIN}-solo`);
  }
  const seenTracker = seenTrackerRef.current;

  // ── Init ──
  useEffect(() => {
    const stored = localStorage.getItem(CITY_STORAGE_KEY);
    if (stored) setCity(stored);
  }, []);

  useEffect(() => {
    if (!city) return;
    const transformed = transformCatalog(ACTIVITY_CATALOG, city);
    setActivityList(transformed);
    setAppReady(true);
  }, [city]);

  // ── City select ──
  const handleCitySelect = (c) => {
    setCity(c);
    localStorage.setItem(CITY_STORAGE_KEY, c);
    setShowCityPicker(false);
  };

  // ── Filter active check ──
  const isActive = groupType && time && budget && location && city;

  // ── Engine ──
  const handlePick = () => {
    if (!isActive) return;
    setLoading(true);
    setNoResults(false);
    setMessage("Finding the right plan...");

    setTimeout(async () => {
      const activeFilters = {
        groupType: groupType.toLowerCase(),
        time: time.toLowerCase(),
        budget: budget.toLowerCase(),
        location: location.toLowerCase(),
        vibe: vibe ? vibe.toLowerCase().replace("+", "-") : "",
      };

      const result = await runSoloEngine({
        items: activityList,
        filters: activeFilters,
        vibeText: "",
        config: plansConfig,
        enricher: enrichItems,
        seenTracker,
      });

      const { topPick, backups, trustLabel, wasReset: reset, wasFallback, updatedItems } = result;

      setWasReset(reset);
      setActivityList(updatedItems);

      if (!topPick) {
        setResults([]);
        setNoResults(true);
        setTimeout(() => { setLoading(false); setMessage(""); }, 300);
        return;
      }

      const top3 = [topPick, ...backups].filter(Boolean).map((item) => ({
        ...item,
        trustLabel,
      }));

      setResults(top3);
      setNoResults(false);
      setLastPickTime(DOMAIN);

      logPick({
        domain: DOMAIN,
        mode: "solo",
        filters: activeFilters,
        topPick,
        matchLabel: trustLabel,
        wasFallback,
        sessionId: null,
      });

      setTimeout(() => { setLoading(false); setMessage(""); }, 300);
    }, 400);
  };

  const handleTryAgain = () => {
    if (isImplicitRejection(DOMAIN) && results[0]) {
      logRejection({
        domain: DOMAIN,
        mode: "solo",
        filters: { groupType, time, budget, location, vibe },
        rejectedPick: results[0],
        sessionId: null,
      });
    }
    setResults([]);
    setNoResults(false);
    setWasReset(false);
  };

  // ── Styles ──
  const S = {
    pill: (active) => ({
      background: active ? "#e53935" : "#111",
      border: `1px solid ${active ? "#e53935" : "#222"}`,
      borderRadius: "20px",
      padding: "5px 14px",
      fontSize: "12px",
      color: active ? "#fff" : "#666",
      cursor: "pointer",
      transition: "all 0.15s",
      whiteSpace: "nowrap",
      fontFamily: "'DM Sans', system-ui, sans-serif",
    }),
  };

  // ── Render ──
  return (
    <main style={{
      minHeight: "100vh",
      background: "#080808",
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "center",
      padding: "48px 16px 24px",
      fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500&family=DM+Serif+Display&display=swap" rel="stylesheet" />

      <div style={{ width: "100%", maxWidth: "360px" }}>

        {/* ── Back ── */}
        <button
          onClick={() => window.location.href = "/"}
          style={{ background: "none", border: "none", color: "#333", cursor: "pointer", fontSize: "12px", padding: 0, marginBottom: "24px", fontFamily: "'DM Sans', system-ui, sans-serif" }}
        >
          ← Back
        </button>

        {/* ── Header ── */}
        <div style={{ marginBottom: "28px" }}>
          <p style={{ fontSize: "10px", color: "#333", letterSpacing: "0.12em", textTransform: "uppercase", margin: "0 0 5px" }}>
            Decision Engine
          </p>
          <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: "30px", color: "#fff", margin: "0 0 8px", lineHeight: 1.2 }}>
            What to do<span style={{ color: "#e53935" }}>?</span>
          </h1>

          {/* ── City chip ── */}
          {city ? (
            <button
              onClick={() => setShowCityPicker(true)}
              style={{ background: "#1a0a0a", border: "1px solid #3a1e1e", borderRadius: "20px", padding: "4px 12px", fontSize: "11px", color: "#e53935", cursor: "pointer", fontFamily: "'DM Sans', system-ui, sans-serif" }}
            >
              📍 {city} ×
            </button>
          ) : (
            <button
              onClick={() => setShowCityPicker(true)}
              style={{ background: "#111", border: "1px solid #222", borderRadius: "20px", padding: "4px 12px", fontSize: "11px", color: "#444", cursor: "pointer", fontFamily: "'DM Sans', system-ui, sans-serif" }}
            >
              📍 Select your city
            </button>
          )}
        </div>

        {/* ── City Picker ── */}
        {showCityPicker && (
          <div style={{ background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: "14px", padding: "14px", marginBottom: "16px" }}>
            <p style={{ fontSize: "9px", color: "#333", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 10px" }}>Select City</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {CITIES.map((c) => (
                <button key={c} onClick={() => handleCitySelect(c)} style={S.pill(city === c)}>{c}</button>
              ))}
            </div>
          </div>
        )}

        {/* ── Filters ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "20px" }}>

          {/* Group Type */}
          <div>
            <p style={{ fontSize: "9px", color: "#333", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 8px" }}>Who's going?</p>
            <div style={{ display: "flex", gap: "6px" }}>
              {GROUP_TYPES.map((g) => (
                <button key={g} onClick={() => setGroupType(groupType === g ? "" : g)} style={S.pill(groupType === g)}>{g}</button>
              ))}
            </div>
          </div>

          {/* Time */}
          <div>
            <p style={{ fontSize: "9px", color: "#333", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 8px" }}>Time available</p>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {TIME_OPTIONS.map((t) => (
                <button key={t} onClick={() => setTime(time === t ? "" : t)} style={S.pill(time === t)}>{t}</button>
              ))}
            </div>
          </div>

          {/* Budget */}
          <div>
            <p style={{ fontSize: "9px", color: "#333", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 8px" }}>Budget</p>
            <div style={{ display: "flex", gap: "6px" }}>
              {BUDGET_OPTIONS.map((b) => (
                <button key={b} onClick={() => setBudget(budget === b ? "" : b)} style={S.pill(budget === b)}>{b}</button>
              ))}
            </div>
          </div>

          {/* Location */}
          <div>
            <p style={{ fontSize: "9px", color: "#333", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 8px" }}>Indoor or outdoor?</p>
            <div style={{ display: "flex", gap: "6px" }}>
              {LOCATION_OPTIONS.map((l) => (
                <button key={l} onClick={() => setLocation(location === l ? "" : l)} style={S.pill(location === l)}>{l}</button>
              ))}
            </div>
          </div>

          {/* Vibe — optional */}
          <div>
            <p style={{ fontSize: "9px", color: "#333", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 8px" }}>
              Vibe <span style={{ color: "#222", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>— optional</span>
            </p>
            <div style={{ display: "flex", gap: "6px", overflowX: "auto", paddingBottom: "4px", scrollbarWidth: "none" }}>
              {VIBES.map((v) => (
                <button key={v} onClick={() => setVibe(vibe === v ? "" : v)} style={{ ...S.pill(vibe === v), flexShrink: 0 }}>{v}</button>
              ))}
            </div>
          </div>

        </div>

        {/* ── Pick Button ── */}
        <button
          onClick={handlePick}
          disabled={loading || !appReady || !isActive}
          style={{
            width: "100%",
            background: isActive && appReady ? "#e53935" : "#111",
            border: "none",
            borderRadius: "12px",
            padding: "13px",
            fontSize: "14px",
            fontWeight: 500,
            color: isActive && appReady ? "#fff" : "#333",
            cursor: isActive && appReady ? "pointer" : "default",
            marginBottom: "20px",
            transition: "all 0.2s",
            fontFamily: "'DM Sans', system-ui, sans-serif",
          }}
        >
          {loading ? `🗺️ ${message}` : "Find a plan"}
        </button>

        {!city && (
          <p style={{ fontSize: "11px", color: "#333", textAlign: "center", margin: "-14px 0 14px" }}>
            Select your city to get started
          </p>
        )}

        {/* ── Empty state ── */}
        {noResults && (
          <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "16px", padding: "20px 14px", marginBottom: "12px", textAlign: "center" }}>
            <p style={{ fontSize: "20px", margin: "0 0 8px" }}>🗺️</p>
            <p style={{ fontSize: "13px", color: "#888", margin: "0 0 4px", fontWeight: 500 }}>No plans found</p>
            <p style={{ fontSize: "11px", color: "#444", margin: "0 0 12px" }}>Try changing your budget, location, or time</p>
            <button
              onClick={handleTryAgain}
              style={{ background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: "8px", padding: "8px 16px", color: "#555", fontSize: "12px", cursor: "pointer", fontFamily: "'DM Sans', system-ui, sans-serif" }}
            >
              ↻ Try again
            </button>
          </div>
        )}

        {/* ── Results ── */}
        {results.length > 0 && (
          <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "16px", padding: "14px", marginBottom: "12px" }}>
            {wasReset && (
              <span style={{ display: "inline-block", fontSize: "10px", background: "#2a2000", color: "#f0a500", border: "1px solid #3a3000", borderRadius: "20px", padding: "2px 8px", marginBottom: "10px" }}>
                🔁 Showing new plans
              </span>
            )}
            <p style={{ fontSize: "9px", color: "#444", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 10px" }}>Your Top Plan</p>

            {/* Top pick */}
            <div style={{ marginBottom: "10px" }}>
              <p style={{ fontSize: "18px", fontWeight: 500, color: "#fff", margin: "0 0 6px", lineHeight: 1.3, fontFamily: "'DM Serif Display', serif" }}>
                {results[0].name}
              </p>
              <span style={{ fontSize: "10px", background: "#1a0a0a", border: "1px solid #3a1e1e", borderRadius: "20px", padding: "2px 8px", color: "#e53935" }}>
                {results[0].trustLabel}
              </span>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "8px" }}>
                {[
                  results[0].location && `${results[0].location.charAt(0).toUpperCase() + results[0].location.slice(1)}`,
                  results[0].time,
                  results[0].budget && `${results[0].budget.charAt(0).toUpperCase() + results[0].budget.slice(1)} budget`,
                ].filter(Boolean).map((tag, i) => (
                  <span key={i} style={{ fontSize: "10px", background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: "20px", padding: "2px 8px", color: "#555" }}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Backup */}
            {results.length > 1 && (
              <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #1a1a1a" }}>
                <p style={{ fontSize: "9px", color: "#333", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 6px" }}>You may also like</p>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {results.slice(1).map((item, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <p style={{ fontSize: "13px", color: "#888", margin: 0 }}>{item.name}</p>
                      <span style={{ fontSize: "10px", color: "#333" }}>{item.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={handleTryAgain}
              style={{ width: "100%", background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: "8px", padding: "8px", color: "#444", fontSize: "12px", cursor: "pointer", marginTop: "12px", fontFamily: "'DM Sans', system-ui, sans-serif" }}
            >
              ↻ Try another
            </button>
          </div>
        )}

        {/* ── Decide Together — Coming Soon ── */}
        <div style={{ borderTop: "1px solid #141414", paddingTop: "16px" }}>
          <div style={{
            background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: "14px",
            padding: "13px 14px", display: "flex", alignItems: "center", justifyContent: "space-between",
            opacity: 0.4, cursor: "default",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ width: "32px", height: "32px", background: "#111", borderRadius: "9px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                  <circle cx="5" cy="7" r="2.5" stroke="#555" strokeWidth="1.5" />
                  <circle cx="11" cy="7" r="2.5" stroke="#555" strokeWidth="1.5" />
                  <path d="M1 13c0-2 1.8-3.5 4-3.5" stroke="#555" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M15 13c0-2-1.8-3.5-4-3.5" stroke="#555" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <p style={{ fontSize: "13px", fontWeight: 500, color: "#555", margin: 0 }}>Decide together</p>
                  <span style={{ fontSize: "9px", background: "#1a1a1a", color: "#444", border: "1px solid #222", borderRadius: "4px", padding: "1px 5px" }}>Soon</span>
                </div>
                <p style={{ fontSize: "10px", color: "#333", margin: 0 }}>Group plans — coming soon</p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </main>
  );
}