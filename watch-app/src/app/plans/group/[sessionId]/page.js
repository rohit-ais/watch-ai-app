"use client";
import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../../../../lib/supabase";
import { plansConfig, TIME_OPTIONS, BUDGET_OPTIONS, LOCATION_OPTIONS, VIBES, DOMAIN } from "../../../../lib/domains/plans/config";
import { ACTIVITY_CATALOG } from "../../../../lib/domains/plans/activityCatalog";
import { transformCatalog, enrichItems } from "../../../../lib/domains/plans/transform";
import { runGroupEngine } from "../../../../lib/engine/core";

const FILTER_KEYS = ["time", "budget", "location", "vibe", "groupType"];

const pill = (active) => ({
  background: active ? "#4caf50" : "#111",
  border: "1px solid " + (active ? "#4caf50" : "#222"),
  borderRadius: "20px",
  padding: "4px 12px",
  fontSize: "12px",
  color: active ? "#fff" : "#666",
  cursor: "pointer",
  transition: "all 0.15s",
  whiteSpace: "nowrap",
  fontFamily: "'DM Sans', system-ui, sans-serif",
});

export default function PlansGroupRoom({ params }) {
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

  const [time, setTime] = useState("");
  const [budget, setBudget] = useState("");
  const [location, setLocation] = useState("");
  const [vibe, setVibe] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [deciding, setDeciding] = useState(false);
  const [results, setResults] = useState([]);
  const [activityList, setActivityList] = useState([]);
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  // ── Init ──
  useEffect(() => {
    const storedPid = localStorage.getItem("pid-" + sessionId);
    const storedHost = localStorage.getItem("host-" + sessionId) === "true";

    if (storedPid) {
      myIdRef.current = storedPid;
      isHostRef.current = storedHost;
      setMyId(storedPid);
      setIsHost(storedHost);
      setJoined(true);
    }

    loadSession();
    loadParticipants();

    const uid = Math.random().toString(36).slice(2, 8);

    const sessionCh = supabase
      .channel("ps-" + sessionId + "-" + uid)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "sessions",
        filter: "id=eq." + sessionId,
      }, (payload) => {
        setSession(payload.new);
        if (payload.new.status === "decided" && payload.new.final_pick) {
          try { setResults(JSON.parse(payload.new.final_pick)); } catch { }
        }
      })
      .subscribe();

    const partCh = supabase
      .channel("pp-" + sessionId + "-" + uid)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "participants",
        filter: "session_id=eq." + sessionId,
      }, () => { loadParticipants(); })
      .subscribe();

    return () => {
      supabase.removeChannel(sessionCh);
      supabase.removeChannel(partCh);
    };
  }, [sessionId]);

  const loadSession = async () => {
    const { data } = await supabase
      .from("sessions").select("*").eq("id", sessionId).single();
    if (data) {
      setSession(data);
      if (data.status === "decided" && data.final_pick) {
        try { setResults(JSON.parse(data.final_pick)); } catch { }
      }
      if (data.city) {
        const transformed = transformCatalog(ACTIVITY_CATALOG, data.city);
        setActivityList(transformed);
      }
    }
  };

  const loadParticipants = async () => {
    const { data } = await supabase
      .from("participants").select("*").eq("session_id", sessionId)
      .order("created_at", { ascending: true });
    if (data) setParticipants(data);
  };

  const handleJoin = async () => {
    if (!joinName.trim()) return;
    setJoining(true);
    setJoinError("");
    try {
      const { data: p, error: pErr } = await supabase
        .from("participants")
        .insert({ session_id: sessionId, name: joinName.trim(), domain: "plans" })
        .select().single();
      if (pErr) throw pErr;

      const { data: s } = await supabase
        .from("sessions").select("host_participant_id").eq("id", sessionId).single();

      const becomeHost = !s?.host_participant_id;

      if (becomeHost) {
        await supabase.from("sessions")
          .update({ host_participant_id: p.id, host_name: joinName.trim() })
          .eq("id", sessionId);
      }

      localStorage.setItem("pid-" + sessionId, p.id);
      localStorage.setItem("host-" + sessionId, becomeHost ? "true" : "false");

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

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: "Let's decide what to do", url }); }
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

  const handleSubmitVote = async () => {
    const pid = myIdRef.current;
    if (!pid) return;
    setSubmitting(true);
    const { error } = await supabase.from("participants")
      .update({
        time: time ? time.toLowerCase() : null,
        budget: budget ? budget.toLowerCase() : null,
        location: location ? location.toLowerCase() : null,
        vibe: vibe ? vibe.toLowerCase().replace("+", "-") : null,
      }).eq("id", pid);
    if (!error) setSubmitted(true);
    setSubmitting(false);
  };

  const handleStartVoting = async () => {
    await supabase.from("sessions").update({ status: "voting" }).eq("id", sessionId);
  };

  const handleDecide = async () => {
    setDeciding(true);

    const { data: sessionData } = await supabase
      .from("sessions").select("city, group_type").eq("id", sessionId).single();

    const currentList = sessionData?.city
      ? transformCatalog(ACTIVITY_CATALOG, sessionData.city)
      : activityList;

    if (!currentList.length) { setDeciding(false); return; }

    const { data: votes } = await supabase
      .from("participants").select("*").eq("session_id", sessionId);
    if (!votes?.length) { setDeciding(false); return; }

    const votesWithGroupType = votes.map((v) => ({
      ...v,
      groupType: sessionData?.group_type || "",
    }));

    const result = await runGroupEngine({
      items: currentList,
      participants: votesWithGroupType,
      filterKeys: FILTER_KEYS,
      config: plansConfig,
      enricher: enrichItems,
      kidsMode: false,
    });

    const { topPick, backups, trustLabel, mergedFilters, wasFallback } = result;
    const top3 = [topPick, ...backups].filter(Boolean).map((item) => ({ ...item, trustLabel }));

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
    } catch { }

    setDeciding(false);
  };

  const handleEndSession = async () => {
    await supabase.from("sessions").update({ status: "ended" }).eq("id", sessionId);
    window.location.href = "/plans/group";
  };

  const submittedCount = participants.filter((p) => p.time || p.budget || p.location).length;
  const allSubmitted = participants.length >= 2 && submittedCount === participants.length;
  const voteActive = time || budget || location || vibe;
  const hostSlotEmpty = session && !session.host_participant_id;

  if (!session) {
    return (
      <main style={{ minHeight: "100vh", background: "#080808", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans',system-ui,sans-serif" }}>
        <p style={{ color: "#333", fontSize: "13px" }}>Loading session...</p>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", background: "#080808", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px", fontFamily: "'DM Sans',system-ui,sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500&family=DM+Serif+Display&display=swap" rel="stylesheet" />

      <div style={{ width: "100%", maxWidth: "360px" }}>

        {/* ── TOP NAV ── */}
        <div style={{ marginBottom: "16px" }}>
          {!joined && (
            <button onClick={() => window.location.href = "/plans/group"} style={{ background: "none", border: "none", color: "#333", cursor: "pointer", fontSize: "12px", padding: 0, fontFamily: "'DM Sans',system-ui,sans-serif" }}>← Back</button>
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
            {session.host_name ? session.host_name + "'s room" : "Group room"}
            <span style={{ color: "#4caf50" }}>.</span>
          </h1>
          {session.city && session.group_type && (
            <p style={{ fontSize: "11px", color: "#333", margin: "6px 0 0" }}>
              {session.city} · {session.group_type.charAt(0).toUpperCase() + session.group_type.slice(1)}
            </p>
          )}
        </div>

        {/* ── STATE: WAITING + NOT JOINED ── */}
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
            <div style={{ background: "#0d0d0d", border: "1px solid " + (joinName ? "#4caf50" : "#1a1a1a"), borderRadius: "10px", padding: "10px 12px", marginBottom: "10px", transition: "border-color 0.2s" }}>
              <input
                autoFocus
                value={joinName}
                onChange={(e) => setJoinName(e.target.value.slice(0, 30))}
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
              {joining ? "Joining..." : (hostSlotEmpty ? "Create session \u2192" : "Join session \u2192")}
            </button>
          </div>
        )}

        {/* ── STATE: WAITING + HOST ── */}
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
              {participants.length < 2 ? "Waiting for others to join..." : "Start deciding \u2192"}
            </button>
          </>
        )}

        {/* ── STATE: WAITING + PARTICIPANT ── */}
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

        {/* ── STATE: VOTING ── */}
        {joined && session.status === "voting" && (
          <>
            {!submitted ? (
              <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "16px", padding: "14px", marginBottom: "12px" }}>
                <p style={{ fontSize: "11px", color: "#555", margin: "0 0 14px" }}>Pick your preferences</p>

                <div style={{ marginBottom: "12px" }}>
                  <p style={{ fontSize: "9px", color: "#333", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 6px" }}>Time available</p>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    {TIME_OPTIONS.map((t) => (
                      <button key={t} onClick={() => setTime(time === t ? "" : t)} style={pill(time === t)}>{t}</button>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: "12px" }}>
                  <p style={{ fontSize: "9px", color: "#333", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 6px" }}>Budget</p>
                  <div style={{ display: "flex", gap: "6px" }}>
                    {BUDGET_OPTIONS.map((b) => (
                      <button key={b} onClick={() => setBudget(budget === b ? "" : b)} style={pill(budget === b)}>{b}</button>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: "12px" }}>
                  <p style={{ fontSize: "9px", color: "#333", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 6px" }}>Indoor or outdoor?</p>
                  <div style={{ display: "flex", gap: "6px" }}>
                    {LOCATION_OPTIONS.map((l) => (
                      <button key={l} onClick={() => setLocation(location === l ? "" : l)} style={pill(location === l)}>{l}</button>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: "14px" }}>
                  <p style={{ fontSize: "9px", color: "#333", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 6px" }}>
                    Vibe <span style={{ color: "#222", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>— optional</span>
                  </p>
                  <div style={{ display: "flex", gap: "6px", overflowX: "auto", paddingBottom: "2px", scrollbarWidth: "none" }}>
                    {VIBES.map((v) => (
                      <button key={v} onClick={() => setVibe(vibe === v ? "" : v)} style={{ ...pill(vibe === v), flexShrink: 0 }}>{v}</button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleSubmitVote}
                  disabled={submitting || !voteActive}
                  style={{ width: "100%", background: voteActive ? "#4caf50" : "#0d0d0d", border: "none", borderRadius: "10px", padding: "11px", fontSize: "13px", fontWeight: 500, color: voteActive ? "#fff" : "#333", cursor: voteActive ? "pointer" : "default", transition: "all 0.2s", fontFamily: "'DM Sans',system-ui,sans-serif" }}
                >
                  {submitting ? "Submitting..." : "Submit my pick \u2192"}
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
                  const voted = p.time || p.budget || p.location;
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
                disabled={deciding || !activityList.length}
                style={{ width: "100%", background: activityList.length ? "#e53935" : "#111", border: "none", borderRadius: "12px", padding: "13px", fontSize: "14px", fontWeight: 500, color: activityList.length ? "#fff" : "#333", cursor: activityList.length ? "pointer" : "default", transition: "all 0.2s", fontFamily: "'DM Sans',system-ui,sans-serif" }}
              >
                {deciding ? "Finding the best plan..." : allSubmitted ? "Decide for everyone \u2192" : "Decide anyway (" + submittedCount + "/" + participants.length + " voted)"}
              </button>
            )}
          </>
        )}

        {/* ── STATE: DECIDED ── */}
        {session.status === "decided" && results.length > 0 && (
          <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "16px", padding: "14px" }}>
            <p style={{ fontSize: "9px", color: "#4caf50", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 12px" }}>Your group's plan</p>
            <div style={{ marginBottom: "12px" }}>
              <p style={{ fontSize: "18px", fontWeight: 500, color: "#fff", margin: "0 0 6px", lineHeight: 1.3, fontFamily: "'DM Serif Display',serif" }}>
                {results[0].name}
              </p>
              <span style={{ fontSize: "10px", background: "#1a0a0a", border: "1px solid #3a1e1e", borderRadius: "20px", padding: "2px 8px", color: "#e53935" }}>
                {results[0].trustLabel}
              </span>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "8px" }}>
                {[
                  results[0].location && (results[0].location.charAt(0).toUpperCase() + results[0].location.slice(1)),
                  results[0].time,
                  results[0].budget && (results[0].budget.charAt(0).toUpperCase() + results[0].budget.slice(1) + " budget"),
                ].filter(Boolean).map((tag, i) => (
                  <span key={i} style={{ fontSize: "10px", background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: "20px", padding: "2px 8px", color: "#555" }}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            {results.length > 1 && (
              <div style={{ paddingTop: "12px", borderTop: "1px solid #1a1a1a", marginBottom: "12px" }}>
                <p style={{ fontSize: "9px", color: "#333", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 8px" }}>You may also like</p>
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
              onClick={() => window.location.href = "/plans/group"}
              style={{ width: "100%", background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: "8px", padding: "8px", color: "#444", fontSize: "12px", cursor: "pointer", fontFamily: "'DM Sans',system-ui,sans-serif" }}
            >
              ← Start a new room
            </button>
          </div>
        )}

        {/* ── STATE: ENDED ── */}
        {session.status === "ended" && (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <p style={{ fontSize: "13px", color: "#444", margin: "0 0 16px" }}>This session has ended.</p>
            <button
              onClick={() => window.location.href = "/plans/group"}
              style={{ background: "#111", border: "1px solid #1a1a1a", borderRadius: "10px", padding: "10px 20px", color: "#666", fontSize: "13px", cursor: "pointer", fontFamily: "'DM Sans',system-ui,sans-serif" }}
            >
              ← Start a new room
            </button>
          </div>
        )}

      </div>
    </main>
  );
}