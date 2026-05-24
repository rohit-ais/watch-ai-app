"use client";
import { useState } from "react";
import { supabase } from "../../lib/supabase";

export default function GroupPage() {
  const [loading, setLoading] = useState(false);
  const [kidsMode, setKidsMode] = useState(false);
  const [error, setError] = useState("");
  const [retryIn, setRetryIn] = useState(0);

const handleCreate = async () => {
  const lastCreated = localStorage.getItem("watch-last-room-created");
  const elapsed = lastCreated ? Date.now() - parseInt(lastCreated) : Infinity;
  
  if (elapsed < 60000) {
    const remaining = Math.ceil((60000 - elapsed) / 1000);
    setRetryIn(remaining);
    setError(`Please wait ${remaining}s before creating another room.`);
    
    const interval = setInterval(() => {
      const newElapsed = Date.now() - parseInt(localStorage.getItem("watch-last-room-created"));
      const newRemaining = Math.ceil((60000 - newElapsed) / 1000);
      if (newRemaining <= 0) {
        clearInterval(interval);
        setError("");
        setRetryIn(0);
      } else {
        setError(`Please wait ${newRemaining}s before creating another room.`);
      }
    }, 1000);
    return;
  }

  setLoading(true);
  setError("");
  try {
    const { data: session, error: sErr } = await supabase
      .from("sessions")
      .insert({ mode: "group", status: "waiting", kids_mode: kidsMode })
      .select()
      .single();
    if (sErr) throw sErr;
    localStorage.setItem("watch-last-room-created", Date.now().toString());
    window.location.href = `/group/${session.id}`;
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

        <button onClick={() => window.location.href = "/watch"} style={{ background: "none", border: "none", color: "#333", cursor: "pointer", fontSize: "12px", padding: 0, marginBottom: "24px", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
          ← Back
        </button>

        <div style={{ marginBottom: "32px" }}>
          <p style={{ fontSize: "10px", color: "#333", letterSpacing: "0.12em", textTransform: "uppercase", margin: "0 0 5px" }}>Group Mode</p>
          <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: "30px", color: "#fff", margin: "0 0 8px", lineHeight: 1.2 }}>
            Decide together<span style={{ color: "#4caf50" }}>.</span>
          </h1>
          <p style={{ fontSize: "13px", color: "#444", margin: 0 }}>Create a room, share the link, everyone picks together.</p>
        </div>

        <div style={{ background: "#0d1a0d", border: "1px solid #1e3a1e", borderRadius: "14px", padding: "14px", marginBottom: "20px" }}>
          <p style={{ fontSize: "11px", color: "#4a6a4a", margin: "0 0 10px", fontWeight: 500 }}>How it works</p>
          {["Create a room — you become the host", "Share the link with your group", "Everyone enters their name and picks preferences", "You trigger the final decision — one pick for all"].map((step, i) => (
            <div key={i} style={{ display: "flex", gap: "8px", marginBottom: i < 3 ? "6px" : 0 }}>
              <span style={{ fontSize: "10px", color: "#4caf50", fontWeight: 500, flexShrink: 0, marginTop: "1px" }}>{i + 1}.</span>
              <p style={{ fontSize: "11px", color: "#3a5a3a", margin: 0, lineHeight: 1.4 }}>{step}</p>
            </div>
          ))}
        </div>

        <div
          onClick={() => setKidsMode((k) => !k)}
          style={{ background: kidsMode ? "#0d1a0d" : "#111", border: `1px solid ${kidsMode ? "#1e3a1e" : "#1e1e1e"}`, borderRadius: "12px", padding: "12px 14px", marginBottom: "16px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", transition: "all 0.2s" }}
        >
          <div>
            <p style={{ fontSize: "12px", color: kidsMode ? "#4caf50" : "#555", margin: "0 0 2px", fontWeight: 500 }}>👶 Kids Mode</p>
            <p style={{ fontSize: "10px", color: kidsMode ? "#3a5a3a" : "#333", margin: 0 }}>Hides intense, horror and adult content</p>
          </div>
          <div style={{ width: "32px", height: "18px", borderRadius: "9px", background: kidsMode ? "#4caf50" : "#222", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
            <div style={{ position: "absolute", top: "3px", left: kidsMode ? "17px" : "3px", width: "12px", height: "12px", borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
          </div>
        </div>

        {error && <p style={{ fontSize: "11px", color: "#e53935", margin: "0 0 12px" }}>{error}</p>}

        <button
          onClick={handleCreate}
          disabled={loading}
          style={{ width: "100%", background: loading ? "#111" : "#4caf50", border: "none", borderRadius: "12px", padding: "13px", fontSize: "14px", fontWeight: 500, color: loading ? "#333" : "#fff", cursor: loading ? "default" : "pointer", transition: "all 0.2s", fontFamily: "'DM Sans', system-ui, sans-serif" }}
        >
          {loading ? "Creating room..." : "Create room →"}
        </button>

      </div>
    </main>
  );
}