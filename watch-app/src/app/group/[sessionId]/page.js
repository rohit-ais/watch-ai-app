"use client";
import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../../../lib/supabase";
import { entertainmentConfig, MOODS, TYPES, PLATFORMS, GENRES, DOMAIN } from "../../../lib/domains/entertainment/config";
import { transformTMDbItem, enrichItems } from "../../../lib/domains/entertainment/enricher";
import { runGroupEngine } from "../../../lib/engine/core";

// ─── Constants ───────────────────────────────────────────────────────────────

const TIMES = [["20-30", "20-30m"], ["1hr", "1 Hr"], ["2hr+", "2+ Hr"]];
const FILTER_KEYS = ["mood", "time", "type", "platform", "genre"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatVotes(count) {
  if (!count) return null;
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${Math.round(count / 1000)}K`;
  return count.toString();
}

const pill = (active) => ({
  background: active ? "#4caf50" : "#111",
  border: `1px solid ${active ? "#4caf50" : "#222"}`,
  borderRadius: "20px", padding: "4px 12px", fontSize: "12px",
  color: active ? "#fff" : "#666", cursor: "pointer",
  transition: "all 0.15s", whiteSpace: "nowrap",
  fontFamily: "'DM Sans', system-ui, sans-serif",
});

// ─── Component ────────────────────────────────────────────────────────────────

export default function GroupRoom({ params }) {
  const { sessionId } = React.use(params);

  const [session, setSession] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [myId, setMyId] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [joined, setJoined] = useState(false);
  const myIdRef = useRef(null);
  const isHostRef = useRef(false);

  const [joinName, setJoinName] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");

  const [mood, setMood] = useState("");
  const [time, setTime] = useState("");
  const [type, setType] = useState("");
  const [platform, setPlatform] = useState("");
  const [genre, setGenre] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [kidsMode, setKidsMode] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [results, setResults] = useState([]);
  const [contentList, setContentList] = useState([]);
  const [contentReady, setContentReady] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  // ─── INIT ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    const storedPid = localStorage.getItem(`pid-${sessionId}`);
    const storedHost = localStorage.getItem(`host-${sessionId}`) === "true";

    if (storedPid) {
      myIdRef.current = storedPid;
      isHostRef.current = storedHost;
      setMyId(storedPid);
      setIsHost(storedHost);
      setJoined(true);
    }

    loadSession();
    loadParticipants();
    fetchContent();

    const uid = Math.random().toString(36).slice(2, 8);

    const sessionCh = supabase
      .channel(`s-${sessionId}-${uid}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "sessions",
        filter: `id=eq.${sessionId}`,
      }, (payload) => {
        setSession(payload.new);
        if (payload.new.status === "decided" && payload.new.final_pick) {
          try { setResults(JSON.parse(payload.new.final_pick)); } catch { }
        }
      })
      .subscribe();

    const partCh = supabase
      .channel(`p-${sessionId}-${uid}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "participants",
        filter: `session_id=eq.${sessionId}`,
      }, () => { loadParticipants(); })
      .subscribe();

    return () => {
      supabase.removeChannel(sessionCh);
      supabase.removeChannel(partCh);
    };
  }, [sessionId]);

  // ─── LOAD SESSION ─────────────────────────────────────────────────────────

  const loadSession = async () => {
    const { data } = await supabase
      .from("sessions").select("*").eq("id", sessionId).single();
    if (data) {
      setSession(data);
      setKidsMode(!!data.kids_mode);
      if (data.status === "decided" && data.final_pick) {
        try { setResults(JSON.parse(data.final_pick)); } catch { }
      }
    }
  };

  // ─── LOAD PARTICIPANTS ────────────────────────────────────────────────────

  const loadParticipants = async () => {
    const { data } = await supabase
      .from("participants").select("*").eq("session_id", sessionId)
      .order("created_at", { ascending: true });
    if (data) setParticipants(data);
  };

  // ─── FETCH CONTENT ────────────────────────────────────────────────────────

  const fetchContent = async () => {
    try {
      const [r1, r2, r3, r4, r5, r6, r7, r8] = await Promise.all([
        fetch(`/api/tmdb?path=/movie/popular&page=1`),
        fetch(`/api/tmdb?path=/movie/popular&page=2`),
        fetch(`/api/tmdb?path=/movie/top_rated&page=1`),
        fetch(`/api/tmdb?path=/movie/top_rated&page=2`),
        fetch(`/api/tmdb?path=/tv/popular&page=1`),
        fetch(`/api/tmdb?path=/tv/popular&page=2`),
        fetch(`/api/tmdb?path=/tv/top_rated&page=1`),
        fetch(`/api/tmdb?path=/tv/top_rated&page=2`),
      ]);
      const [d1, d2, d3, d4, d5, d6, d7, d8] = await Promise.all([
        r1.json(), r2.json(), r3.json(), r4.json(),
        r5.json(), r6.json(), r7.json(), r8.json(),
      ]);
      const all = [
        ...(d1.results || []), ...(d2.results || []),
        ...(d3.results || []), ...(d4.results || []),
        ...(d5.results || []), ...(d6.results || []),
        ...(d7.results || []), ...(d8.results || []),
      ];
      setContentList(all.map(transformTMDbItem));
    } catch { }
    setContentReady(true);
  };

  // ─── JOIN ─────────────────────────────────────────────────────────────────

  const handleJoin = async () => {
    if (!joinName.trim()) return;
    setJoining(true);
    setJoinError("");

    try {
      const { data: p, error: pErr } = await supabase
        .from("participants")
        .insert({ session_id: sessionId, name: joinName.trim() })
        .select().single();
      if (pErr) throw pErr;

      const { data: s } = await supabase
        .from("sessions").select("host_participant_id").eq("id", sessionId).single();

      const becomeHost = !s?.host_participant_id;

      if (becomeHost) {
        const { error: uErr } = await supabase.from("sessions")
          .update({ host_participant_id: p.id, host_name: joinName.trim() })
          .eq("id", sessionId);
        if (uErr) throw uErr;
      }

      localStorage.setItem(`pid-${sessionId}`, p.id);
      localStorage.setItem(`host-${sessionId}`, becomeHost ? "true" : "false");

      myIdRef.current = p.id;
      isHostRef.current = becomeHost;
      setMyId(p.id);
      setIsHost(becomeHost);
      setJoined(true);

      await loadSession();
      await loadParticipants();

    } catch (err) {
      console.error(err);
      setJoinError("Could not join. Please try again.");
    }
    setJoining(false);
  };

  // ─── SHARE ────────────────────────────────────────────────────────────────

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: "Let's decide what to watch", url }); }
      catch (e) {
        if (e.name !== "AbortError") {
          await navigator.clipboard.writeText(url);
          alert("Link copied!");
        }
      }
    } else {
      await navigator.clipboard.writeText(url);
      alert("Link copied!");
    }
  };

  // ─── SUBMIT VOTE ──────────────────────────────────────────────────────────

  const handleSubmitVote = async () => {
    const pid = myIdRef.current;
    if (!pid) return;
    setSubmitting(true);
    const { error } = await supabase.from("participants")
      .update({ mood, time, type, platform, genre }).eq("id", pid);
    if (!error) setSubmitted(true);
    setSubmitting(false);
  };

  // ─── START VOTING ─────────────────────────────────────────────────────────

  const handleStartVoting = async () => {
    await supabase.from("sessions").update({ status: "voting" }).eq("id", sessionId);
  };

  // ─── DECIDE ───────────────────────────────────────────────────────────────

  const handleDecide = async () => {
    if (!contentReady || !contentList.length) return;
    setDeciding(true);

    const { data: votes } = await supabase
      .from("participants").select("*").eq("session_id", sessionId);
    if (!votes?.length) { setDeciding(false); return; }

    const result = await runGroupEngine({
      items: contentList,
      participants: votes,
      filterKeys: FILTER_KEYS,
      config: entertainmentConfig,
      enricher: enrichItems,
      kidsMode,
    });

    const { topPick, backups, trustLabel, mergedFilters, wasFallback } = result;

    const top3 = [topPick, ...backups]
      .filter(Boolean)
      .map((item) => ({ ...item, trustLabel }));

    await supabase.from("sessions")
      .update({ status: "decided", final_pick: JSON.stringify(top3) })
      .eq("id", sessionId);

    setResults(top3);

    try {
      await supabase.from("events").insert({
        mode: "group",
        domain: DOMAIN,
        filters: mergedFilters,
        top_pick: topPick?.name || null,
        match_label: trustLabel,
        was_fallback: wasFallback,
        session_id: sessionId,
      });
    } catch { /* silent */ }

    setDeciding(false);
  };

  // ─── END SESSION ──────────────────────────────────────────────────────────

  const handleEndSession = async () => {
    await supabase.from("sessions").update({ status: "ended" }).eq("id", sessionId);
    window.location.href = "/group";
  };

  // ─── DERIVED ──────────────────────────────────────────────────────────────

  const submittedCount = participants.filter((p) => p.mood || p.type || p.time || p.platform || p.genre).length;
  const allSubmitted = participants.length >= 2 && submittedCount === participants.length;
  const voteActive = mood || time || type || platform || genre;
  const hostSlotEmpty = session && !session.host_participant_id;

  // ─── LOADING ──────────────────────────────────────────────────────────────

  if (!session) {
    return (
      <main style={{ minHeight: "100vh", background: "#080808", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans',system-ui,sans-serif" }}>
        <p style={{ color: "#333", fontSize: "13px" }}>Loading session...</p>
      </main>
    );
  }

  // ─── RENDER ───────────────────────────────────────────────────────────────

  return (
    <main style={{ minHeight: "100vh", background: "#080808", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px", fontFamily: "'DM Sans',system-ui,sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500&family=DM+Serif+Display&display=swap" rel="stylesheet" />

      <div style={{ width: "100%", maxWidth: "360px" }}>

        {/* ── TOP NAV ── */}
        <div style={{ marginBottom: "16px" }}>
          {!joined && (
            <button onClick={() => window.location.href = "/"} style={{ background: "none", border: "none", color: "#333", cursor: "pointer", fontSize: "12px", padding: 0, fontFamily: "'DM Sans',system-ui,sans-serif" }}>← Back</button>
          )}
          {joined && isHost && !showEndConfirm && (
            <button onClick={() => setShowEndConfirm(true)} style={{ background: "none", border: "none", color: "#333", cursor: "pointer", fontSize: "12px", padding: 0, fontFamily: "'DM Sans',system-ui,sans-serif" }}>✕ End session</button>
          )}
          {joined && isHost && showEndConfirm && (
            <div style={{ background: "#1a0d0d", border: "1px solid #3a1e1e", borderRadius: "10px", padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
              <p style={{ fontSize: "11px", color: "#888", margin: 0 }}>End session for everyone?</p>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={() => setShowEndConfirm(false)} style={{ background: "none", border: "1px solid #222", borderRadius: "6px", padding: "4px 10px", color: "#444", fontSize: "11px", cursor: "pointer", fontFamily: "'DM Sans',system-ui,sans-serif" }}>Cancel</button>
                <button onClick={handleEndSession} style={{ background: "#e53935", border: "none", borderRadius: "6px", padding: "4px 10px", color: "#fff", fontSize: "11px", cursor: "pointer", fontFamily: "'DM Sans',system-ui,sans-serif" }}>End</button>
              </div>
            </div>
          )}
          {joined && !isHost && (
            <button onClick={() => window.location.href = "/"} style={{ background: "none", border: "none", color: "#333", cursor: "pointer", fontSize: "12px", padding: 0, fontFamily: "'DM Sans',system-ui,sans-serif" }}>← Leave</button>
          )}
        </div>

        {/* ── HEADER ── */}
        <div style={{ marginBottom: "24px" }}>
          <p style={{ fontSize: "10px", color: "#333", letterSpacing: "0.12em", textTransform: "uppercase", margin: "0 0 5px" }}>Group Session</p>
          <h1 style={{ fontFamily: "'DM Serif Display',serif", fontSize: "26px", color: "#fff", margin: 0, lineHeight: 1.2 }}>
            {session.host_name ? `${session.host_name}'s room` : "Group room"}
            <span style={{ color: "#4caf50" }}>.</span>
          </h1>
        </div>

        {/* ════════════════ STATE: WAITING + NOT JOINED ════════════════ */}
        {!joined && session.status === "waiting" && (
          <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "14px", padding: "16px", marginBottom: "12px" }}>
            {hostSlotEmpty ? (
              <div style={{ background: "#0d1a0d", border: "1px solid #1e3a1e", borderRadius: "8px", padding: "8px 12px", marginBottom: "12px" }}>
                <p style={{ fontSize: "11px", color: "#4caf50", margin: "0 0 2px", fontWeight: 500 }}>👑 You're creating this session</p>
                <p style={{ fontSize: "10px", color: "#3a5a3a", margin: 0 }}>Enter your name to become the host and get the shareable link.</p>
              </div>
            ) : (
              <>
                <p style={{ fontSize: "13px", color: "#555", margin: "0 0 2px" }}>You've been invited.</p>
                <p style={{ fontSize: "11px", color: "#333", margin: "0 0 12px" }}>Enter your name to join the session.</p>
              </>
            )}
            <div style={{ background: "#0d0d0d", border: `1px solid ${joinName ? "#4caf50" : "#1a1a1a"}`, borderRadius: "10px", padding: "10px 12px", marginBottom: "10px", transition: "border-color 0.2s" }}>
              <input
                autoFocus
                value={joinName}
                onChange={(e) => setJoinName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                placeholder="Your name..."
                style={{ width: "100%", background: "none", border: "none", outline: "none", color: "#fff", fontSize: "13px", caretColor: "#4caf50", fontFamily: "'DM Sans',system-ui,sans-serif" }}
              />
            </div>
            {joinError && <p style={{ fontSize: "11px", color: "#e53935", margin: "0 0 8px" }}>{joinError}</p>}
            <button
              onClick={handleJoin}
              disabled={joining || !joinName.trim()}
              style={{ width: "100%", background: joinName.trim() ? "#4caf50" : "#0d0d0d", border: "none", borderRadius: "8px", padding: "10px", fontSize: "13px", fontWeight: 500, color: joinName.trim() ? "#fff" : "#333", cursor: joinName.trim() ? "pointer" : "default", transition: "all 0.2s", fontFamily: "'DM Sans',system-ui,sans-serif" }}
            >
              {joining ? "Joining..." : (hostSlotEmpty ? "Create session →" : "Join session →")}
            </button>
          </div>
        )}

        {/* ════════════════ STATE: WAITING + HOST ════════════════ */}
        {joined && isHost && session.status === "waiting" && (
          <>
            <div style={{ background: "#0d1a0d", border: "1px solid #1e3a1e", borderRadius: "10px", padding: "8px 12px", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "13px" }}>👑</span>
              <p style={{ fontSize: "11px", color: "#4caf50", margin: 0 }}>You are the host. Share the link to invite others.</p>
            </div>
            <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "14px", padding: "14px", marginBottom: "12px" }}>
              <p style={{ fontSize: "9px", color: "#333", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 8px" }}>Share this link</p>
              <div style={{ background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: "10px", padding: "10px 12px", marginBottom: "10px" }}>
                <p style={{ fontSize: "11px", color: "#444", margin: 0, wordBreak: "break-all", lineHeight: 1.4 }}>
                  {typeof window !== "undefined" ? window.location.href : ""}
                </p>
              </div>
              <button onClick={handleShare} style={{ width: "100%", background: "#0d1a0d", border: "1px solid #1e3a1e", borderRadius: "8px", padding: "10px", fontSize: "13px", color: "#4caf50", cursor: "pointer", fontFamily: "'DM Sans',system-ui,sans-serif" }}>
                📋 Copy / Share link
              </button>
            </div>
            <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "14px", padding: "14px", marginBottom: "12px" }}>
              <p style={{ fontSize: "9px", color: "#333", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 10px" }}>Who's here ({participants.length})</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {participants.map((p) => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#4caf50", flexShrink: 0 }} />
                    <p style={{ fontSize: "13px", color: "#888", margin: 0 }}>
                      {p.name}
                      {p.id === session.host_participant_id && <span style={{ fontSize: "9px", color: "#4caf50", marginLeft: "6px" }}>host</span>}
                      {p.id === myId && <span style={{ fontSize: "9px", color: "#444", marginLeft: "6px" }}>you</span>}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <button
              onClick={handleStartVoting}
              disabled={participants.length < 2}
              style={{ width: "100%", background: participants.length >= 2 ? "#4caf50" : "#111", border: "none", borderRadius: "12px", padding: "13px", fontSize: "14px", fontWeight: 500, color: participants.length >= 2 ? "#fff" : "#333", cursor: participants.length >= 2 ? "pointer" : "default", transition: "all 0.2s", fontFamily: "'DM Sans',system-ui,sans-serif" }}
            >
              {participants.length < 2 ? "Waiting for others to join..." : "Start deciding →"}
            </button>
          </>
        )}

        {/* ════════════════ STATE: WAITING + PARTICIPANT ════════════════ */}
        {joined && !isHost && session.status === "waiting" && (
          <>
            <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "14px", padding: "16px 14px", marginBottom: "12px", textAlign: "center" }}>
              <p style={{ fontSize: "20px", margin: "0 0 8px" }}>✓</p>
              <p style={{ fontSize: "13px", color: "#888", margin: "0 0 4px" }}>You're in.</p>
              <p style={{ fontSize: "11px", color: "#333", margin: 0 }}>Waiting for the host to start the session...</p>
            </div>
            <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "14px", padding: "14px" }}>
              <p style={{ fontSize: "9px", color: "#333", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 10px" }}>Who's here ({participants.length})</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {participants.map((p) => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#4caf50", flexShrink: 0 }} />
                    <p style={{ fontSize: "13px", color: "#888", margin: 0 }}>
                      {p.name}
                      {p.id === session.host_participant_id && <span style={{ fontSize: "9px", color: "#4caf50", marginLeft: "6px" }}>host</span>}
                      {p.id === myId && <span style={{ fontSize: "9px", color: "#444", marginLeft: "6px" }}>you</span>}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ════════════════ STATE: VOTING ════════════════ */}
        {joined && session.status === "voting" && (
          <>
            {!submitted ? (
              <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "16px", padding: "14px", marginBottom: "12px" }}>
                <p style={{ fontSize: "11px", color: "#555", margin: "0 0 14px" }}>Pick your preferences</p>

                <div style={{ marginBottom: "12px" }}>
                  <p style={{ fontSize: "9px", color: "#333", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 6px" }}>Type</p>
                  <div style={{ display: "flex", gap: "6px" }}>
                    {TYPES.map((t) => <button key={t} onClick={() => setType(type === t ? "" : t)} style={pill(type === t)}>{t}</button>)}
                  </div>
                </div>

                <div style={{ marginBottom: "12px" }}>
                  <p style={{ fontSize: "9px", color: "#333", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 6px" }}>Mood</p>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    {MOODS.filter((m) => !(kidsMode && m === "Intense")).map((m) => <button key={m} onClick={() => { setGenre(null); setMood(mood === m ? "" : m); }} style={pill(mood === m)}>{m}</button>)}
                  </div>
                </div>

                <div style={{ marginBottom: "12px" }}>
                  <p style={{ fontSize: "9px", color: "#333", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 6px" }}>Genre</p>
                  <div style={{ display: "flex", gap: "5px", overflowX: "auto", paddingBottom: "2px", scrollbarWidth: "none" }}>
                    {GENRES.filter((g) => !(kidsMode && [27, 53, 80, 10752].includes(g.id))).map((g) => (
                      <button
                        key={g.id}
                        onClick={() => { setMood(""); setGenre(genre === String(g.id) ? null : String(g.id)); }}
                        style={{ ...pill(genre === String(g.id)), flexShrink: 0, fontSize: "11px", padding: "3px 10px" }}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: "12px" }}>
                  <p style={{ fontSize: "9px", color: "#333", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 6px" }}>Time</p>
                  <div style={{ display: "flex", gap: "6px" }}>
                    {TIMES.map(([val, label]) => <button key={val} onClick={() => setTime(time === val ? "" : val)} style={pill(time === val)}>{label}</button>)}
                  </div>
                </div>

                <div style={{ marginBottom: "14px" }}>
                  <p style={{ fontSize: "9px", color: "#333", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 6px" }}>Platform</p>
                  <div style={{ display: "flex", gap: "6px", overflowX: "auto", paddingBottom: "2px" }}>
                    {PLATFORMS.map((p) => <button key={p} onClick={() => setPlatform(platform === p ? "" : p)} style={{ ...pill(platform === p), flexShrink: 0 }}>{p}</button>)}
                  </div>
                </div>

                <button
                  onClick={handleSubmitVote}
                  disabled={submitting || !voteActive}
                  style={{ width: "100%", background: voteActive ? "#4caf50" : "#0d0d0d", border: "none", borderRadius: "10px", padding: "11px", fontSize: "13px", fontWeight: 500, color: voteActive ? "#fff" : "#333", cursor: voteActive ? "pointer" : "default", transition: "all 0.2s", fontFamily: "'DM Sans',system-ui,sans-serif" }}
                >
                  {submitting ? "Submitting..." : "Submit my pick →"}
                </button>
              </div>
            ) : (
              <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "14px", padding: "24px 14px", marginBottom: "12px", textAlign: "center" }}>
                <p style={{ fontSize: "24px", margin: "0 0 8px" }}>✅</p>
                <p style={{ fontSize: "13px", color: "#888", margin: "0 0 4px" }}>Your pick is in.</p>
                <p style={{ fontSize: "11px", color: "#333", margin: 0 }}>Waiting for others...</p>
              </div>
            )}

            <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "14px", padding: "14px", marginBottom: "12px" }}>
              <p style={{ fontSize: "9px", color: "#333", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 10px" }}>
                Votes in — {submittedCount}/{participants.length}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {participants.map((p) => {
                  const voted = p.mood || p.type || p.time || p.platform || p.genre;
                  return (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <p style={{ fontSize: "13px", color: "#666", margin: 0 }}>
                        {p.name}
                        {p.id === myId && <span style={{ fontSize: "9px", color: "#444", marginLeft: "6px" }}>you</span>}
                      </p>
                      <span style={{ fontSize: "11px", color: voted ? "#4caf50" : "#333" }}>{voted ? "✓ Ready" : "..."}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {isHost && (
              <button
                onClick={handleDecide}
                disabled={deciding || !contentReady}
                style={{ width: "100%", background: contentReady ? "#e53935" : "#111", border: "none", borderRadius: "12px", padding: "13px", fontSize: "14px", fontWeight: 500, color: contentReady ? "#fff" : "#333", cursor: contentReady ? "pointer" : "default", transition: "all 0.2s", fontFamily: "'DM Sans',system-ui,sans-serif" }}
              >
                {deciding ? "🤖 Finding the best match..." : allSubmitted ? "Decide for everyone →" : `Decide anyway (${submittedCount}/${participants.length} voted)`}
              </button>
            )}
          </>
        )}

        {/* ════════════════ STATE: DECIDED ════════════════ */}
        {session.status === "decided" && results.length > 0 && (
          <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "16px", padding: "14px" }}>
            <p style={{ fontSize: "9px", color: "#4caf50", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 12px" }}>Your group's pick</p>
            <div style={{ display: "flex", gap: "12px", alignItems: "flex-start", marginBottom: "12px" }}>
              {results[0].poster && <img src={results[0].poster} alt={results[0].name} style={{ width: "52px", height: "74px", borderRadius: "8px", objectFit: "cover", flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: "15px", fontWeight: 500, color: "#fff", margin: "0 0 2px", lineHeight: 1.3 }}>{results[0].name}</p>
                <p style={{ fontSize: "11px", color: "#444", margin: "0 0 6px" }}>{results[0].type}</p>
                <span style={{ fontSize: "10px", background: "#1a1a1a", border: "1px solid #222", borderRadius: "20px", padding: "2px 8px", color: "#aaa" }}>
                  {results[0].trustLabel}
                </span>
                {results[0].rating > 0 && (
                  <p style={{ fontSize: "10px", color: "#555", margin: "5px 0 0" }}>
                    ⭐ {results[0].rating.toFixed(1)}{results[0].voteCount > 0 ? ` • ${formatVotes(results[0].voteCount)} votes` : ""}
                  </p>
                )}
              </div>
            </div>
            {results.length > 1 && (
              <div style={{ paddingTop: "12px", borderTop: "1px solid #1a1a1a", marginBottom: "12px" }}>
                <p style={{ fontSize: "9px", color: "#333", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 8px" }}>You may also like</p>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {results.slice(1).map((item, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      {item.poster && <img src={item.poster} alt={item.name} style={{ width: "28px", height: "40px", borderRadius: "5px", objectFit: "cover", flexShrink: 0 }} />}
                      <div>
                        <p style={{ fontSize: "13px", color: "#888", margin: 0 }}>{item.name}</p>
                        <p style={{ fontSize: "10px", color: "#333", margin: 0 }}>{item.type}</p>
                        {item.rating > 0 && <p style={{ fontSize: "9px", color: "#444", margin: 0 }}>⭐ {item.rating.toFixed(1)}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <button onClick={() => window.location.href = "/"} style={{ width: "100%", background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: "8px", padding: "8px", color: "#444", fontSize: "12px", cursor: "pointer", fontFamily: "'DM Sans',system-ui,sans-serif" }}>
              ← Back to home
            </button>
          </div>
        )}

        {/* ════════════════ STATE: ENDED ════════════════ */}
        {session.status === "ended" && (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <p style={{ fontSize: "13px", color: "#444", margin: "0 0 16px" }}>This session has ended.</p>
            <button onClick={() => window.location.href = "/"} style={{ background: "#111", border: "1px solid #1a1a1a", borderRadius: "10px", padding: "10px 20px", color: "#666", fontSize: "13px", cursor: "pointer", fontFamily: "'DM Sans',system-ui,sans-serif" }}>
              ← Back to home
            </button>
          </div>
        )}

      </div>
    </main>
  );
}