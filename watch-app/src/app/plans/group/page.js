"use client";
import { useState } from "react";
import { supabase } from "../../../lib/supabase";
import { GROUP_TYPES, CITIES } from "../../../lib/domains/plans/config";

const RATE_LIMIT_KEY = "plans-last-room-created";

export default function PlansGroupPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [city, setCity] = useState("");
  const [groupType, setGroupType] = useState("");

  const isReady = city && groupType;

  const pill = (active) => ({
    background: active ? "#4caf50" : "#111",
    border: "1px solid " + (active ? "#4caf50" : "#222"),
    borderRadius: "20px",
    padding: "5px 14px",
    fontSize: "12px",
    color: active ? "#fff" : "#666",
    cursor: "pointer",
    transition: "all 0.15s",
    whiteSpace: "nowrap",
    fontFamily: "'DM Sans', system-ui, sans-serif",
  });

  const handleCreate = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: "plans", city, group_type: groupType }),
      });
      const data = await res.json();
      if (res.status === 429) {
        setError(`Please wait ${data.retryAfter}s before creating another room.`);
        setLoading(false);
        return;
      }
      if (!res.ok) throw new Error(data.error || "unknown");
      window.location.href = `/plans/group/${data.sessionId}`;
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", background: "#080808", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500&family=DM+Serif+Display&display=swap" rel="stylesheet" />
      <div style={{ width: "100%", maxWidth: "360px" }}>

        <button
          onClick={() => window.location.href = "/plans"}
          style={{ background: "none", border: "none", color: "#333", cursor: "pointer", fontSize: "12px", padding: 0, marginBottom: "24px", fontFamily: "'DM Sans', system-ui, sans-serif" }}
        >
          ← Back
        </button>

        <div style={{ marginBottom: "32px" }}>
          <p style={{ fontSize: "10px", color: "#333", letterSpacing: "0.12em", textTransform: "uppercase", margin: "0 0 5px" }}>Group Mode</p>
          <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: "30px", color: "#fff", margin: "0 0 8px", lineHeight: 1.2 }}>
            Decide together<span style={{ color: "#4caf50" }}>.</span>
          </h1>
          <p style={{ fontSize: "13px", color: "#444", margin: 0 }}>Create a room, share the link, everyone picks together.</p>
        </div>

        <div style={{ background: "#0d1a0d", border: "1px solid #1e3a1e", borderRadius: "14px", padding: "14px", marginBottom: "24px" }}>
          <p style={{ fontSize: "11px", color: "#4a6a4a", margin: "0 0 10px", fontWeight: 500 }}>How it works</p>
          {[
            "Create a room — you become the host",
            "Share the link with your group",
            "Everyone enters their name and picks preferences",
            "You trigger the final decision — one pick for all",
          ].map((step, i) => (
            <div key={i} style={{ display: "flex", gap: "8px", marginBottom: i < 3 ? "6px" : 0 }}>
              <span style={{ fontSize: "10px", color: "#4caf50", fontWeight: 500, flexShrink: 0, marginTop: "1px" }}>{i + 1}.</span>
              <p style={{ fontSize: "11px", color: "#3a5a3a", margin: 0, lineHeight: 1.4 }}>{step}</p>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "20px", marginBottom: "24px" }}>

          <div>
            <p style={{ fontSize: "9px", color: "#333", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 8px" }}>City</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {CITIES.map((c) => (
                <button key={c} onClick={() => setCity(city === c ? "" : c)} style={pill(city === c)}>{c}</button>
              ))}
            </div>
          </div>

          <div>
            <p style={{ fontSize: "9px", color: "#333", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 8px" }}>Who's going?</p>
            <div style={{ display: "flex", gap: "6px" }}>
              {GROUP_TYPES.map((g) => (
                <button key={g} onClick={() => setGroupType(groupType === g ? "" : g)} style={pill(groupType === g)}>{g}</button>
              ))}
            </div>
          </div>

        </div>

        {error && <p style={{ fontSize: "11px", color: "#e53935", margin: "0 0 12px" }}>{error}</p>}

        <button
          onClick={handleCreate}
          disabled={loading || !isReady}
          style={{ width: "100%", background: isReady && !loading ? "#4caf50" : "#111", border: "none", borderRadius: "12px", padding: "13px", fontSize: "14px", fontWeight: 500, color: isReady && !loading ? "#fff" : "#333", cursor: isReady && !loading ? "pointer" : "default", transition: "all 0.2s", fontFamily: "'DM Sans', system-ui, sans-serif" }}
        >
          {loading ? "Creating room..." : "Create room \u2192"}
        </button>

      </div>
    </main>
  );
}