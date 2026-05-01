"use client";
import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../../../lib/supabase";

// ─── Constants ───────────────────────────────────────────────────────────────

const MOODS = ["Chill", "Fun", "Intense", "Light"];
const TIMES = [["20-30", "20-30m"], ["1hr", "1 Hr"], ["2hr+", "2+ Hr"]];
const TYPES = ["Movie", "Series"];
const PLATFORMS = ["Netflix", "Prime", "Disney+", "JioCinema", "Any"];
const GENRE_TO_MOOD = {
  28: "Intense", 12: "Fun", 16: "Light", 35: "Fun",
  18: "Intense", 27: "Intense", 10749: "Chill",
  878: "Intense", 10751: "Light", 99: "Chill",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizePlatform(name) {
  if (!name) return "Other";
  const n = name.toLowerCase();
  if (n.includes("netflix")) return "Netflix";
  if (n.includes("amazon") || n.includes("prime")) return "Prime";
  if (n.includes("disney")) return "Disney+";
  if (n.includes("jio")) return "JioCinema";
  return "Other";
}

function matchLabel(score, max) {
  const pct = max ? Math.round((score / max) * 100) : 0;
  if (pct === 100) return "⚡ Perfect Match";
  if (pct >= 75) return "👍 Strong Match";
  if (pct >= 50) return "🙂 Good Match";
  if (pct > 0) return "🎲 Best Available";
  return "🎬 Recommended for you";
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

  // ── Session + participants (always loaded fresh from DB) ──
  const [session, setSession] = useState(null);
  const [participants, setParticipants] = useState([]);

  // ── My identity — set ONCE on join, persisted in localStorage ──
  // Keys: `pid-{sessionId}` and `host-{sessionId}`
  const [myId, setMyId] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [joined, setJoined] = useState(false);
  const myIdRef = useRef(null);
  const isHostRef = useRef(false);

  // ── Join form ──
  const [joinName, setJoinName] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");

  // ── Voting ──
  const [mood, setMood] = useState("");
  const [time, setTime] = useState("");
  const [type, setType] = useState("");
  const [platform, setPlatform] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ── Deciding ──
  const [deciding, setDeciding] = useState(false);
  const [results, setResults] = useState([]);

  // ── Content pool ──
  const [contentList, setContentList] = useState([]);
  const [contentReady, setContentReady] = useState(false);

  // ── End session confirm ──
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  // ─── INIT ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    // Step 1: Restore identity from localStorage (survives re-renders)
    const storedPid = localStorage.getItem(`pid-${sessionId}`);
    const storedHost = localStorage.getItem(`host-${sessionId}`) === "true";

    if (storedPid) {
      myIdRef.current = storedPid;
      isHostRef.current = storedHost;
      setMyId(storedPid);
      setIsHost(storedHost);
      setJoined(true);
    }

    // Step 2: Load data
    loadSession();
    loadParticipants();
    fetchContent();

    // Step 3: Realtime — unique channel per client
    const uid = Math.random().toString(36).slice(2, 8);

    const sessionCh = supabase
      .channel(`s-${sessionId}-${uid}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "sessions",
        filter: `id=eq.${sessionId}`,
      }, (payload) => {
        // ONLY update session state — never touch isHost or myId here
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
  // Only updates session state — never touches isHost/myId

  const loadSession = async () => {
    const { data } = await supabase
      .from("sessions").select("*").eq("id", sessionId).single();
    if (data) {
      setSession(data);
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
    const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
    try {
      const [r1, r2, r3, r4] = await Promise.all([
        fetch(`https://api.themoviedb.org/3/movie/popular?api_key=${apiKey}&page=1`),
        fetch(`https://api.themoviedb.org/3/movie/top_rated?api_key=${apiKey}&page=1`),
        fetch(`https://api.themoviedb.org/3/tv/popular?api_key=${apiKey}&page=1`),
        fetch(`https://api.themoviedb.org/3/tv/top_rated?api_key=${apiKey}&page=1`),
      ]);
      const [d1, d2, d3, d4] = await Promise.all([r1.json(), r2.json(), r3.json(), r4.json()]);
      const all = [...(d1.results||[]), ...(d2.results||[]), ...(d3.results||[]), ...(d4.results||[])];
      setContentList(all.slice(0, 120).map((item) => ({
        id: item.id,
        mediaType: item.title ? "movie" : "tv",
        name: item.title || item.name,
        poster: item.poster_path ? `https://image.tmdb.org/t/p/w200${item.poster_path}` : null,
        popularity: item.popularity || 0,
        rating: item.vote_average || 0,
        type: item.title ? "Movie" : "Series",
        mood: [...new Set((item.genre_ids||[]).map((id) => GENRE_TO_MOOD[id]).filter(Boolean))],
        time: null, platform: null,
      })));
    } catch { }
    setContentReady(true);
  };

  // ─── JOIN ─────────────────────────────────────────────────────────────────

  const handleJoin = async () => {
    if (!joinName.trim()) return;
    setJoining(true);
    setJoinError("");

    try {
      // 1. Insert participant row
      const { data: p, error: pErr } = await supabase
        .from("participants")
        .insert({ session_id: sessionId, name: joinName.trim() })
        .select().single();
      if (pErr) throw pErr;

      // 2. Read current session to check if host slot is taken
      const { data: s } = await supabase
        .from("sessions").select("host_participant_id").eq("id", sessionId).single();

      // 3. First person to join = host
      const becomeHost = !s?.host_participant_id;

      if (becomeHost) {
        const { error: uErr } = await supabase.from("sessions")
          .update({ host_participant_id: p.id, host_name: joinName.trim() })
          .eq("id", sessionId);
        if (uErr) throw uErr;
      }

      // 4. Persist to localStorage — session-scoped, permanent for this session
      localStorage.setItem(`pid-${sessionId}`, p.id);
      localStorage.setItem(`host-${sessionId}`, becomeHost ? "true" : "false");

      // 5. Set state — these are set once and FINAL
      myIdRef.current = p.id;
      isHostRef.current = becomeHost;
      setMyId(p.id);
      setIsHost(becomeHost);
      setJoined(true);

      // 6. Reload fresh data
      await loadSession();
      await loadParticipants();

    } catch (err) {
      console.error("JOIN ERROR:", JSON.stringify(err));
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
      .update({ mood, time, type, platform }).eq("id", pid);
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

    const majority = (arr) => {
      const freq = {};
      arr.forEach((v) => { if (v) freq[v] = (freq[v]||0)+1; });
      return Object.entries(freq).sort((a,b)=>b[1]-a[1])[0]?.[0]||"";
    };

    const mergedMood = majority(votes.map((v)=>v.mood));
    const mergedTime = majority(votes.map((v)=>v.time));
    const mergedType = majority(votes.map((v)=>v.type));
    const pVotes = votes.map((v)=>v.platform).filter(Boolean);
    const mergedPlatform = pVotes.length>0 && pVotes.every((p)=>p===pVotes[0]) ? pVotes[0] : "";

    const scorePre = (item) => {
      let s=0;
      if (mergedType && item.type===mergedType) s+=2;
      if (mergedMood && item.mood.includes(mergedMood)) s+=3;
      return s;
    };

    let pool = contentList
      .filter((item)=>mergedType?item.type===mergedType:true)
      .map((item)=>({...item,score:scorePre(item)}))
      .filter((item)=>(mergedType||mergedMood)?item.score>0:true)
      .sort(()=>0.5-Math.random()).slice(0,20);

    if (!pool.length) pool = contentList.sort(()=>0.5-Math.random()).slice(0,20);

    const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
    const enriched = await Promise.all(pool.map(async (item) => {
      let runtime = item.time;
      let ip = item.platform;
      if (!runtime) {
        try {
          const res = await fetch(`https://api.themoviedb.org/3/${item.mediaType}/${item.id}?api_key=${apiKey}`);
          const d = await res.json();
          const mins = item.mediaType==="movie"?d.runtime:d.episode_run_time?.[0]||d.last_episode_to_air?.runtime||null;
          runtime = !mins?"2hr+":mins<=35?"20-30":mins<=75?"1hr":"2hr+";
        } catch { runtime="2hr+"; }
      }
      if (!ip) {
        try {
          const res = await fetch(`https://api.themoviedb.org/3/${item.mediaType}/${item.id}/watch/providers?api_key=${apiKey}`);
          const d = await res.json();
          const pr = d.results?.IN?.flatrate;
          ip = pr?.length?normalizePlatform(pr[0].provider_name):"Other";
        } catch { ip="Other"; }
      }
      return {...item,time:runtime,platform:ip};
    }));

    const maxPossible = (mergedType?2:0)+(mergedMood?3:0)+(mergedTime?2:0);
    const scoreFull = (item) => {
      let s=0;
      if (mergedType&&item.type===mergedType) s+=2;
      if (mergedMood&&item.mood.includes(mergedMood)) s+=3;
      if (mergedTime&&item.time===mergedTime) s+=2;
      return s;
    };

    let finalList = enriched
      .map((item)=>({...item,score:scoreFull(item),maxPossible}))
      .filter((item)=>maxPossible===0?true:item.score>0)
      .filter((item)=>mergedPlatform&&mergedPlatform!=="Any"?item.platform===mergedPlatform:true);

    if (!finalList.length) finalList = enriched.map((item)=>({...item,score:scoreFull(item),maxPossible}));

    const maxScore = Math.max(...finalList.map((a)=>a.score));
    const sorted = [
      ...finalList.filter((a)=>a.score===maxScore).sort(()=>0.5-Math.random()),
      ...finalList.filter((a)=>a.score!==maxScore).sort(()=>0.5-Math.random()),
    ];
    const top3 = sorted.slice(0,3);

    await supabase.from("sessions")
      .update({status:"decided",final_pick:JSON.stringify(top3)})
      .eq("id",sessionId);

    setResults(top3);
    setDeciding(false);
  };

  // ─── END SESSION ──────────────────────────────────────────────────────────

  const handleEndSession = async () => {
    await supabase.from("sessions").update({status:"ended"}).eq("id",sessionId);
    window.location.href="/group";
  };

  // ─── DERIVED ──────────────────────────────────────────────────────────────

  const submittedCount = participants.filter((p)=>p.mood||p.type||p.time||p.platform).length;
  const allSubmitted = participants.length>=2 && submittedCount===participants.length;
  const voteActive = mood||time||type||platform;

  // Host slot empty = next person to join will be host
  const hostSlotEmpty = session && !session.host_participant_id;

  // ─── LOADING ──────────────────────────────────────────────────────────────

  if (!session) {
    return (
      <main style={{minHeight:"100vh",background:"#080808",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Sans',system-ui,sans-serif"}}>
        <p style={{color:"#333",fontSize:"13px"}}>Loading session...</p>
      </main>
    );
  }

  // ─── RENDER ───────────────────────────────────────────────────────────────

  return (
    <main style={{minHeight:"100vh",background:"#080808",display:"flex",alignItems:"center",justifyContent:"center",padding:"24px 16px",fontFamily:"'DM Sans',system-ui,sans-serif"}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500&family=DM+Serif+Display&display=swap" rel="stylesheet"/>

      <div style={{width:"100%",maxWidth:"360px"}}>

        {/* ── TOP NAV ── */}
        <div style={{marginBottom:"16px"}}>
          {!joined && (
            <button onClick={()=>window.location.href="/"} style={{background:"none",border:"none",color:"#333",cursor:"pointer",fontSize:"12px",padding:0,fontFamily:"'DM Sans',system-ui,sans-serif"}}>← Back</button>
          )}
          {joined && isHost && !showEndConfirm && (
            <button onClick={()=>setShowEndConfirm(true)} style={{background:"none",border:"none",color:"#333",cursor:"pointer",fontSize:"12px",padding:0,fontFamily:"'DM Sans',system-ui,sans-serif"}}>✕ End session</button>
          )}
          {joined && isHost && showEndConfirm && (
            <div style={{background:"#1a0d0d",border:"1px solid #3a1e1e",borderRadius:"10px",padding:"10px 12px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:"10px"}}>
              <p style={{fontSize:"11px",color:"#888",margin:0}}>End session for everyone?</p>
              <div style={{display:"flex",gap:"8px"}}>
                <button onClick={()=>setShowEndConfirm(false)} style={{background:"none",border:"1px solid #222",borderRadius:"6px",padding:"4px 10px",color:"#444",fontSize:"11px",cursor:"pointer",fontFamily:"'DM Sans',system-ui,sans-serif"}}>Cancel</button>
                <button onClick={handleEndSession} style={{background:"#e53935",border:"none",borderRadius:"6px",padding:"4px 10px",color:"#fff",fontSize:"11px",cursor:"pointer",fontFamily:"'DM Sans',system-ui,sans-serif"}}>End</button>
              </div>
            </div>
          )}
          {joined && !isHost && (
            <button onClick={()=>window.location.href="/"} style={{background:"none",border:"none",color:"#333",cursor:"pointer",fontSize:"12px",padding:0,fontFamily:"'DM Sans',system-ui,sans-serif"}}>← Leave</button>
          )}
        </div>

        {/* ── HEADER ── */}
        <div style={{marginBottom:"24px"}}>
          <p style={{fontSize:"10px",color:"#333",letterSpacing:"0.12em",textTransform:"uppercase",margin:"0 0 5px"}}>Group Session</p>
          <h1 style={{fontFamily:"'DM Serif Display',serif",fontSize:"26px",color:"#fff",margin:0,lineHeight:1.2}}>
            {session.host_name ? `${session.host_name}'s room` : "Group room"}
            <span style={{color:"#4caf50"}}>.</span>
          </h1>
        </div>

        {/* ════════════════════════════════════════════════
            STATE: WAITING + NOT JOINED
            Shows join form. Copy adapts: host vs participant
        ════════════════════════════════════════════════ */}
        {!joined && session.status==="waiting" && (
          <div style={{background:"#111",border:"1px solid #1e1e1e",borderRadius:"14px",padding:"16px",marginBottom:"12px"}}>

            {/* Host copy vs participant copy */}
            {hostSlotEmpty ? (
              <>
                <div style={{background:"#0d1a0d",border:"1px solid #1e3a1e",borderRadius:"8px",padding:"8px 12px",marginBottom:"12px"}}>
                  <p style={{fontSize:"11px",color:"#4caf50",margin:"0 0 2px",fontWeight:500}}>👑 You're creating this session</p>
                  <p style={{fontSize:"10px",color:"#3a5a3a",margin:0}}>Enter your name to become the host and get the shareable link.</p>
                </div>
              </>
            ) : (
              <>
                <p style={{fontSize:"13px",color:"#555",margin:"0 0 2px"}}>You've been invited.</p>
                <p style={{fontSize:"11px",color:"#333",margin:"0 0 12px"}}>Enter your name to join the session.</p>
              </>
            )}

            <div style={{background:"#0d0d0d",border:`1px solid ${joinName?"#4caf50":"#1a1a1a"}`,borderRadius:"10px",padding:"10px 12px",marginBottom:"10px",transition:"border-color 0.2s"}}>
              <input
                autoFocus
                value={joinName}
                onChange={(e)=>setJoinName(e.target.value)}
                onKeyDown={(e)=>e.key==="Enter"&&handleJoin()}
                placeholder="Your name..."
                style={{width:"100%",background:"none",border:"none",outline:"none",color:"#fff",fontSize:"13px",caretColor:"#4caf50",fontFamily:"'DM Sans',system-ui,sans-serif"}}
              />
            </div>
            {joinError && <p style={{fontSize:"11px",color:"#e53935",margin:"0 0 8px"}}>{joinError}</p>}
            <button
              onClick={handleJoin}
              disabled={joining||!joinName.trim()}
              style={{width:"100%",background:joinName.trim()?"#4caf50":"#0d0d0d",border:"none",borderRadius:"8px",padding:"10px",fontSize:"13px",fontWeight:500,color:joinName.trim()?"#fff":"#333",cursor:joinName.trim()?"pointer":"default",transition:"all 0.2s",fontFamily:"'DM Sans',system-ui,sans-serif"}}
            >
              {joining?"Joining...":(hostSlotEmpty?"Create session →":"Join session →")}
            </button>
          </div>
        )}

        {/* ════════════════════════════════════════════════
            STATE: WAITING + JOINED AS HOST
        ════════════════════════════════════════════════ */}
        {joined && isHost && session.status==="waiting" && (
          <>
            {/* Host badge */}
            <div style={{background:"#0d1a0d",border:"1px solid #1e3a1e",borderRadius:"10px",padding:"8px 12px",marginBottom:"12px",display:"flex",alignItems:"center",gap:"8px"}}>
              <span style={{fontSize:"13px"}}>👑</span>
              <p style={{fontSize:"11px",color:"#4caf50",margin:0}}>You are the host. Share the link to invite others.</p>
            </div>

            {/* Share link */}
            <div style={{background:"#111",border:"1px solid #1e1e1e",borderRadius:"14px",padding:"14px",marginBottom:"12px"}}>
              <p style={{fontSize:"9px",color:"#333",textTransform:"uppercase",letterSpacing:"0.1em",margin:"0 0 8px"}}>Share this link</p>
              <div style={{background:"#0d0d0d",border:"1px solid #1a1a1a",borderRadius:"10px",padding:"10px 12px",marginBottom:"10px"}}>
                <p style={{fontSize:"11px",color:"#444",margin:0,wordBreak:"break-all",lineHeight:1.4}}>
                  {typeof window!=="undefined"?window.location.href:""}
                </p>
              </div>
              <button
                onClick={handleShare}
                style={{width:"100%",background:"#0d1a0d",border:"1px solid #1e3a1e",borderRadius:"8px",padding:"10px",fontSize:"13px",color:"#4caf50",cursor:"pointer",fontFamily:"'DM Sans',system-ui,sans-serif"}}
              >
                📋 Copy / Share link
              </button>
            </div>

            {/* Who's here */}
            <div style={{background:"#111",border:"1px solid #1e1e1e",borderRadius:"14px",padding:"14px",marginBottom:"12px"}}>
              <p style={{fontSize:"9px",color:"#333",textTransform:"uppercase",letterSpacing:"0.1em",margin:"0 0 10px"}}>Who's here ({participants.length})</p>
              <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
                {participants.map((p)=>(
                  <div key={p.id} style={{display:"flex",alignItems:"center",gap:"8px"}}>
                    <div style={{width:"6px",height:"6px",borderRadius:"50%",background:"#4caf50",flexShrink:0}}/>
                    <p style={{fontSize:"13px",color:"#888",margin:0}}>
                      {p.name}
                      {p.id===session.host_participant_id&&<span style={{fontSize:"9px",color:"#4caf50",marginLeft:"6px"}}>host</span>}
                      {p.id===myId&&<span style={{fontSize:"9px",color:"#444",marginLeft:"6px"}}>you</span>}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Start deciding — host only */}
            <button
              onClick={handleStartVoting}
              disabled={participants.length<2}
              style={{width:"100%",background:participants.length>=2?"#4caf50":"#111",border:"none",borderRadius:"12px",padding:"13px",fontSize:"14px",fontWeight:500,color:participants.length>=2?"#fff":"#333",cursor:participants.length>=2?"pointer":"default",transition:"all 0.2s",fontFamily:"'DM Sans',system-ui,sans-serif"}}
            >
              {participants.length<2?"Waiting for others to join...":"Start deciding →"}
            </button>
          </>
        )}

        {/* ════════════════════════════════════════════════
            STATE: WAITING + JOINED AS PARTICIPANT
        ════════════════════════════════════════════════ */}
        {joined && !isHost && session.status==="waiting" && (
          <>
            <div style={{background:"#111",border:"1px solid #1e1e1e",borderRadius:"14px",padding:"16px 14px",marginBottom:"12px",textAlign:"center"}}>
              <p style={{fontSize:"20px",margin:"0 0 8px"}}>✓</p>
              <p style={{fontSize:"13px",color:"#888",margin:"0 0 4px"}}>You're in.</p>
              <p style={{fontSize:"11px",color:"#333",margin:0}}>Waiting for the host to start the session...</p>
            </div>

            {/* Who's here — participant view */}
            <div style={{background:"#111",border:"1px solid #1e1e1e",borderRadius:"14px",padding:"14px"}}>
              <p style={{fontSize:"9px",color:"#333",textTransform:"uppercase",letterSpacing:"0.1em",margin:"0 0 10px"}}>Who's here ({participants.length})</p>
              <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
                {participants.map((p)=>(
                  <div key={p.id} style={{display:"flex",alignItems:"center",gap:"8px"}}>
                    <div style={{width:"6px",height:"6px",borderRadius:"50%",background:"#4caf50",flexShrink:0}}/>
                    <p style={{fontSize:"13px",color:"#888",margin:0}}>
                      {p.name}
                      {p.id===session.host_participant_id&&<span style={{fontSize:"9px",color:"#4caf50",marginLeft:"6px"}}>host</span>}
                      {p.id===myId&&<span style={{fontSize:"9px",color:"#444",marginLeft:"6px"}}>you</span>}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ════════════════════════════════════════════════
            STATE: VOTING
            Both host and participant see filter form.
            Only host sees Decide button.
        ════════════════════════════════════════════════ */}
        {joined && session.status==="voting" && (
          <>
            {!submitted ? (
              <div style={{background:"#111",border:"1px solid #1e1e1e",borderRadius:"16px",padding:"14px",marginBottom:"12px"}}>
                <p style={{fontSize:"11px",color:"#555",margin:"0 0 14px"}}>Pick your preferences</p>

                <div style={{marginBottom:"12px"}}>
                  <p style={{fontSize:"9px",color:"#333",textTransform:"uppercase",letterSpacing:"0.1em",margin:"0 0 6px"}}>Type</p>
                  <div style={{display:"flex",gap:"6px"}}>
                    {TYPES.map((t)=><button key={t} onClick={()=>setType(type===t?"":t)} style={pill(type===t)}>{t}</button>)}
                  </div>
                </div>

                <div style={{marginBottom:"12px"}}>
                  <p style={{fontSize:"9px",color:"#333",textTransform:"uppercase",letterSpacing:"0.1em",margin:"0 0 6px"}}>Mood</p>
                  <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
                    {MOODS.map((m)=><button key={m} onClick={()=>setMood(mood===m?"":m)} style={pill(mood===m)}>{m}</button>)}
                  </div>
                </div>

                <div style={{marginBottom:"12px"}}>
                  <p style={{fontSize:"9px",color:"#333",textTransform:"uppercase",letterSpacing:"0.1em",margin:"0 0 6px"}}>Time</p>
                  <div style={{display:"flex",gap:"6px"}}>
                    {TIMES.map(([val,label])=><button key={val} onClick={()=>setTime(time===val?"":val)} style={pill(time===val)}>{label}</button>)}
                  </div>
                </div>

                <div style={{marginBottom:"14px"}}>
                  <p style={{fontSize:"9px",color:"#333",textTransform:"uppercase",letterSpacing:"0.1em",margin:"0 0 6px"}}>Platform</p>
                  <div style={{display:"flex",gap:"6px",overflowX:"auto",paddingBottom:"2px"}}>
                    {PLATFORMS.map((p)=><button key={p} onClick={()=>setPlatform(platform===p?"":p)} style={{...pill(platform===p),flexShrink:0}}>{p}</button>)}
                  </div>
                </div>

                <button
                  onClick={handleSubmitVote}
                  disabled={submitting||!voteActive}
                  style={{width:"100%",background:voteActive?"#4caf50":"#0d0d0d",border:"none",borderRadius:"10px",padding:"11px",fontSize:"13px",fontWeight:500,color:voteActive?"#fff":"#333",cursor:voteActive?"pointer":"default",transition:"all 0.2s",fontFamily:"'DM Sans',system-ui,sans-serif"}}
                >
                  {submitting?"Submitting...":"Submit my pick →"}
                </button>
              </div>
            ) : (
              <div style={{background:"#111",border:"1px solid #1e1e1e",borderRadius:"14px",padding:"24px 14px",marginBottom:"12px",textAlign:"center"}}>
                <p style={{fontSize:"24px",margin:"0 0 8px"}}>✅</p>
                <p style={{fontSize:"13px",color:"#888",margin:"0 0 4px"}}>Your pick is in.</p>
                <p style={{fontSize:"11px",color:"#333",margin:0}}>Waiting for others...</p>
              </div>
            )}

            {/* Vote progress */}
            <div style={{background:"#111",border:"1px solid #1e1e1e",borderRadius:"14px",padding:"14px",marginBottom:"12px"}}>
              <p style={{fontSize:"9px",color:"#333",textTransform:"uppercase",letterSpacing:"0.1em",margin:"0 0 10px"}}>
                Votes in — {submittedCount}/{participants.length}
              </p>
              <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
                {participants.map((p)=>{
                  const voted=p.mood||p.type||p.time||p.platform;
                  return (
                    <div key={p.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <p style={{fontSize:"13px",color:"#666",margin:0}}>
                        {p.name}
                        {p.id===myId&&<span style={{fontSize:"9px",color:"#444",marginLeft:"6px"}}>you</span>}
                      </p>
                      <span style={{fontSize:"11px",color:voted?"#4caf50":"#333"}}>{voted?"✓ Ready":"..."}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Decide button — HOST ONLY */}
            {isHost && (
              <button
                onClick={handleDecide}
                disabled={deciding||!contentReady}
                style={{width:"100%",background:contentReady?"#e53935":"#111",border:"none",borderRadius:"12px",padding:"13px",fontSize:"14px",fontWeight:500,color:contentReady?"#fff":"#333",cursor:contentReady?"pointer":"default",transition:"all 0.2s",fontFamily:"'DM Sans',system-ui,sans-serif"}}
              >
                {deciding?"🤖 Finding the best match...":allSubmitted?"Decide for everyone →":`Decide anyway (${submittedCount}/${participants.length} voted)`}
              </button>
            )}
          </>
        )}

        {/* ════════════════════════════════════════════════
            STATE: DECIDED — same for everyone
        ════════════════════════════════════════════════ */}
        {session.status==="decided" && results.length>0 && (
          <div style={{background:"#111",border:"1px solid #1e1e1e",borderRadius:"16px",padding:"14px"}}>
            <p style={{fontSize:"9px",color:"#4caf50",textTransform:"uppercase",letterSpacing:"0.1em",margin:"0 0 12px"}}>Your group's pick</p>
            <div style={{display:"flex",gap:"12px",alignItems:"flex-start",marginBottom:"12px"}}>
              {results[0].poster&&<img src={results[0].poster} alt={results[0].name} style={{width:"52px",height:"74px",borderRadius:"8px",objectFit:"cover",flexShrink:0}}/>}
              <div style={{flex:1,minWidth:0}}>
                <p style={{fontSize:"15px",fontWeight:500,color:"#fff",margin:"0 0 2px",lineHeight:1.3}}>{results[0].name}</p>
                <p style={{fontSize:"11px",color:"#444",margin:"0 0 6px"}}>{results[0].type}</p>
                <span style={{fontSize:"10px",background:"#1a1a1a",border:"1px solid #222",borderRadius:"20px",padding:"2px 8px",color:"#aaa"}}>
                  {matchLabel(results[0].score,results[0].maxPossible)}
                </span>
              </div>
            </div>
            {results.length>1&&(
              <div style={{paddingTop:"12px",borderTop:"1px solid #1a1a1a",marginBottom:"12px"}}>
                <p style={{fontSize:"9px",color:"#333",textTransform:"uppercase",letterSpacing:"0.1em",margin:"0 0 8px"}}>You may also like</p>
                <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
                  {results.slice(1).map((item,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:"8px"}}>
                      {item.poster&&<img src={item.poster} alt={item.name} style={{width:"28px",height:"40px",borderRadius:"5px",objectFit:"cover",flexShrink:0}}/>}
                      <div>
                        <p style={{fontSize:"13px",color:"#888",margin:0}}>{item.name}</p>
                        <p style={{fontSize:"10px",color:"#333",margin:0}}>{item.type}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <button onClick={()=>window.location.href="/"} style={{width:"100%",background:"#0d0d0d",border:"1px solid #1a1a1a",borderRadius:"8px",padding:"8px",color:"#444",fontSize:"12px",cursor:"pointer",fontFamily:"'DM Sans',system-ui,sans-serif"}}>
              ← Back to home
            </button>
          </div>
        )}

        {/* ════════════════════════════════════════════════
            STATE: ENDED
        ════════════════════════════════════════════════ */}
        {session.status==="ended"&&(
          <div style={{textAlign:"center",padding:"24px 0"}}>
            <p style={{fontSize:"13px",color:"#444",margin:"0 0 16px"}}>This session has ended.</p>
            <button onClick={()=>window.location.href="/"} style={{background:"#111",border:"1px solid #1a1a1a",borderRadius:"10px",padding:"10px 20px",color:"#666",fontSize:"13px",cursor:"pointer",fontFamily:"'DM Sans',system-ui,sans-serif"}}>
              ← Back to home
            </button>
          </div>
        )}

      </div>
    </main>
  );
}