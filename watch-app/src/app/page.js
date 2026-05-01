"use client";
import { useState, useRef, useEffect } from "react";

// ─── Constants ───────────────────────────────────────────────────────────────

const MOOD_KEYWORDS = {
  Chill: ["tired", "chill", "relax", "calm", "lazy", "easy", "slow", "cozy", "peaceful", "quiet"],
  Fun: ["funny", "fun", "laugh", "comedy", "happy", "cheerful", "hilarious", "humor"],
  Intense: ["action", "intense", "thriller", "exciting", "edge", "suspense", "drama", "dark", "serious"],
  Light: ["light", "simple", "feel good", "heartwarming", "family", "sweet", "gentle", "soft", "cartoon", "kid"],
};

const TIME_KEYWORDS = {
  "20-30": ["short", "quick", "episode", "20", "30", "brief", "30 min"],
  "1hr": ["hour", "1hr", "medium", "60"],
  "2hr+": ["movie", "long", "2hr", "feature", "full", "binge"],
};

const EXAMPLES = [
  "Date night movie...",
  "Funny 30 min show...",
  "Kid safe cartoon...",
  "Weekend binge...",
  "Something intense tonight...",
  "Chill Sunday watch...",
];

const GENRE_TO_MOOD = {
  28: "Intense", 12: "Fun", 16: "Light", 35: "Fun",
  18: "Intense", 27: "Intense", 10749: "Chill",
  878: "Intense", 10751: "Light", 99: "Chill",
};

const PLATFORMS = ["Netflix", "Prime", "Disney+", "JioCinema", "Any"];
const MOODS = ["Chill", "Fun", "Intense", "Light"];
const TIMES = [["20-30", "20-30m"], ["1hr", "1 Hr"], ["2hr+", "2+ Hr"]];
const TYPES = ["Movie", "Series"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseVibe(text) {
  const lower = text.toLowerCase();
  let mood = "";
  let time = "";
  for (const [m, keywords] of Object.entries(MOOD_KEYWORDS)) {
    if (keywords.some((k) => lower.includes(k))) { mood = m; break; }
  }
  for (const [t, keywords] of Object.entries(TIME_KEYWORDS)) {
    if (keywords.some((k) => lower.includes(k))) { time = t; break; }
  }
  return { mood, time };
}

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

// ─── Component ────────────────────────────────────────────────────────────────

export default function Home() {
  // Vibe / conversational
  const [vibe, setVibe] = useState("");
  const [parsed, setParsed] = useState({ mood: "", time: "" });
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const inputRef = useRef(null);

  // Filters
  const [type, setType] = useState("");
  const [time, setTime] = useState("");
  const [mood, setMood] = useState("");
  const [platform, setPlatform] = useState("");

  // Engine
  const [contentList, setContentList] = useState([]);
  const [appReady, setAppReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // Results
  const [results, setResults] = useState([]);
  const [explore, setExplore] = useState([]);
  const [wasReset, setWasReset] = useState(false);

  // ─── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    inputRef.current?.focus();
    localStorage.removeItem("seen");
    fetchMovies();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % EXAMPLES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  // ─── Vibe input ────────────────────────────────────────────────────────────

  const handleVibeChange = (e) => {
    const val = e.target.value;
    setVibe(val);
    if (val.length > 2) {
      const p = parseVibe(val);
      setParsed(p);
      if (p.mood) setMood(p.mood);
      if (p.time) setTime(p.time);
    } else {
      setParsed({ mood: "", time: "" });
    }
  };

  const clearVibe = () => {
    setVibe("");
    setParsed({ mood: "", time: "" });
    inputRef.current?.focus();
  };

  const isActive = vibe.trim() || type || mood || time || platform;

  // ─── TMDb helpers (outside fetchMovies so handlePick can access) ───────────

  const getProviders = async (id, mediaType, apiKey) => {
    try {
      const res = await fetch(`https://api.themoviedb.org/3/${mediaType}/${id}/watch/providers?api_key=${apiKey}`);
      const data = await res.json();
      const providers = data.results?.IN?.flatrate;
      if (!providers?.length) return "Other";
      return normalizePlatform(providers[0].provider_name);
    } catch { return "Other"; }
  };

  const getRuntime = async (id, mediaType, apiKey) => {
    try {
      const res = await fetch(`https://api.themoviedb.org/3/${mediaType}/${id}?api_key=${apiKey}`);
      const data = await res.json();
      const mins = mediaType === "movie"
        ? data.runtime
        : data.episode_run_time?.[0] || data.last_episode_to_air?.runtime || null;
      if (!mins) return "2hr+";
      if (mins <= 35) return "20-30";
      if (mins <= 75) return "1hr";
      return "2hr+";
    } catch { return "2hr+"; }
  };

  // ─── TMDb fetch ────────────────────────────────────────────────────────────

  const fetchMovies = async () => {
    const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
    let combined = [];

    try {
      const [p1, p2, p3, p4] = await Promise.all([
        fetch(`https://api.themoviedb.org/3/movie/popular?api_key=${apiKey}&page=1`),
        fetch(`https://api.themoviedb.org/3/movie/top_rated?api_key=${apiKey}&page=1`),
        fetch(`https://api.themoviedb.org/3/movie/popular?api_key=${apiKey}&page=2`),
        fetch(`https://api.themoviedb.org/3/movie/top_rated?api_key=${apiKey}&page=2`),
      ]);
      const [d1, d2, d3, d4] = await Promise.all([p1.json(), p2.json(), p3.json(), p4.json()]);
      const movies = [...(d1.results || []), ...(d2.results || []), ...(d3.results || []), ...(d4.results || [])];

      let tvResults = [];
      try {
        const [t1, t2, t3, t4] = await Promise.all([
          fetch(`https://api.themoviedb.org/3/tv/popular?api_key=${apiKey}&page=1`),
          fetch(`https://api.themoviedb.org/3/tv/top_rated?api_key=${apiKey}&page=1`),
          fetch(`https://api.themoviedb.org/3/tv/popular?api_key=${apiKey}&page=2`),
          fetch(`https://api.themoviedb.org/3/tv/top_rated?api_key=${apiKey}&page=2`),
        ]);
        const [td1, td2, td3, td4] = await Promise.all([t1.json(), t2.json(), t3.json(), t4.json()]);
        tvResults = [...(td1.results || []), ...(td2.results || []), ...(td3.results || []), ...(td4.results || [])];
      } catch { /* TV fetch failed, movies only */ }

      combined = [...movies, ...tvResults];
    } catch (error) {
      console.error("API Error:", error);
      try {
        const res = await fetch(`https://api.themoviedb.org/3/movie/popular?api_key=${apiKey}`);
        const data = await res.json();
        combined = data.results || [];
      } catch { combined = []; }
    }

    const transformed = combined.slice(0, 120).map((item) => ({
      id: item.id,
      mediaType: item.title ? "movie" : "tv",
      name: item.title || item.name,
      poster: item.poster_path ? `https://image.tmdb.org/t/p/w200${item.poster_path}` : null,
      popularity: item.popularity || 0,
      rating: item.vote_average || 0,
      type: item.title ? "Movie" : "Series",
      genres: item.genre_ids || [],
      mood: [...new Set((item.genre_ids || []).map((id) => GENRE_TO_MOOD[id]).filter(Boolean))],
      time: null,
      platform: null,
    }));
    setContentList(transformed);
    setAppReady(true);
  };

  // ─── Decision engine ───────────────────────────────────────────────────────

  const handlePick = () => {
    if (!isActive) return;
    setLoading(true);
    setMessage("Analyzing your vibe...");

    setTimeout(async () => {
      const seen = JSON.parse(localStorage.getItem("seen")) || [];
      setMessage("Matching best content...");
      setWasReset(false);

      const activeMood = mood;
      const activeTime = time;
      const activeType = type;
      const activePlatform = platform;

      // Pre-score without time/platform (still null until enriched)
      const scorePre = (item) => {
        let s = 0;
        if (activeType && item.type === activeType) s += 2;
        if (activeMood && item.mood.includes(activeMood)) s += 3;
        return s;
      };

      // Pre-filter by type + mood only
      let candidatePool = contentList
        .filter((item) => !seen.includes(item.name))
        .filter((item) => activeType ? item.type === activeType : true)
        .map((item) => ({ ...item, score: scorePre(item) }))
        .filter((item) => (activeType || activeMood) ? item.score > 0 : true);

      if (candidatePool.length === 0) {
        localStorage.removeItem("seen");
        if (seen.length > 0) setWasReset(true);
        candidatePool = contentList
          .filter((item) => activeType ? item.type === activeType : true)
          .map((item) => ({ ...item, score: scorePre(item) }))
          .filter((item) => (activeType || activeMood) ? item.score > 0 : true);
      }

      // Shuffle and take 20 candidates for enrichment
      const shuffled = candidatePool.sort(() => 0.5 - Math.random()).slice(0, 20);

      // Lazy fetch runtime + platform for 20 candidates only
      setMessage("Fetching details...");
      const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
      const enriched20 = await Promise.all(
        shuffled.map(async (item) => ({
          ...item,
          time: item.time || await getRuntime(item.id, item.mediaType, apiKey),
          platform: item.platform || await getProviders(item.id, item.mediaType, apiKey),
        }))
      );

      // Full score with real time + platform values
      const maxPossible = (activeType ? 2 : 0) + (activeMood ? 3 : 0) + (activeTime ? 2 : 0);

      const scoreFull = (item) => {
        let s = 0;
        if (activeType && item.type === activeType) s += 2;
        if (activeMood && item.mood.includes(activeMood)) s += 3;
        if (activeTime && item.time === activeTime) s += 2;
        return s;
      };

      let finalList = enriched20
        .map((item) => ({ ...item, score: scoreFull(item), maxPossible }))
        .filter((item) => maxPossible === 0 ? true : item.score > 0)
        .filter((item) => activePlatform && activePlatform !== "Any" ? item.platform === activePlatform : true);

      // Fallback: if platform filter kills everything, show best available
      if (finalList.length === 0) {
        finalList = enriched20.map((item) => ({ ...item, score: scoreFull(item), maxPossible }));
      }

      const maxScore = Math.max(...finalList.map((a) => a.score));
      const sorted = [
        ...finalList.filter((a) => a.score === maxScore).sort(() => 0.5 - Math.random()),
        ...finalList.filter((a) => a.score !== maxScore).sort(() => 0.5 - Math.random()),
      ];

      const top3 = sorted.slice(0, 3);
      const newSeen = [...seen, ...top3.map((i) => i.name)];
      localStorage.setItem("seen", JSON.stringify(newSeen));
      setResults(top3);

      // Cache enriched values back into contentList
      setContentList((prev) => prev.map((item) => {
        const match = enriched20.find((e) => e.id === item.id);
        return match ? { ...item, time: match.time, platform: match.platform } : item;
      }));

      const topNames = top3.map((i) => i.name);
      const available = contentList.filter((i) => !topNames.includes(i.name));
      const trending = [...available].sort((a, b) => b.popularity - a.popularity)[0];
      const topRated = [...available]
        .filter((i) => i.name !== trending?.name)
        .sort((a, b) => b.rating - a.rating)[0];

      setExplore([
        trending ? { ...trending, exploreLabel: "🔥 Trending Now" } : null,
        topRated ? { ...topRated, exploreLabel: "⭐ Top Rated" } : null,
      ].filter(Boolean));

      setTimeout(() => { setLoading(false); setMessage(""); }, 300);
    }, 400);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && isActive) handlePick();
  };

  const handleTryAgain = () => {
    setResults([]);
    setExplore([]);
    setWasReset(false);
    inputRef.current?.focus();
  };

  // ─── Styles ────────────────────────────────────────────────────────────────

  const S = {
    pill: (active) => ({
      background: active ? "#e53935" : "#111",
      border: `1px solid ${active ? "#e53935" : "#222"}`,
      borderRadius: "20px",
      padding: "4px 12px",
      fontSize: "12px",
      color: active ? "#fff" : "#666",
      cursor: "pointer",
      transition: "all 0.15s",
      whiteSpace: "nowrap",
    }),
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <main style={{
      minHeight: "100vh",
      background: "#080808",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px 16px",
      fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500&family=DM+Serif+Display&display=swap" rel="stylesheet" />

      <div style={{ width: "100%", maxWidth: "360px" }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: "28px" }}>
          <p style={{ fontSize: "10px", color: "#333", letterSpacing: "0.12em", textTransform: "uppercase", margin: "0 0 5px" }}>
            Decision Engine
          </p>
          <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: "30px", color: "#fff", margin: 0, lineHeight: 1.2 }}>
            What to watch<span style={{ color: "#e53935" }}>?</span>
          </h1>
        </div>

        {/* ── Conversational Input ── */}
        <div style={{
          background: "#111",
          border: `1px solid ${vibe ? "#e53935" : "#1e1e1e"}`,
          borderRadius: "14px",
          padding: "12px 14px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginBottom: "6px",
          transition: "border-color 0.2s",
        }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="7" cy="7" r="5" stroke="#333" strokeWidth="1.5" />
            <path d="M11 11l2.5 2.5" stroke="#333" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={vibe}
            onChange={handleVibeChange}
            onKeyDown={handleKeyDown}
            placeholder={EXAMPLES[placeholderIndex]}
            style={{ flex: 1, background: "none", border: "none", outline: "none", color: "#fff", fontSize: "14px", caretColor: "#e53935" }}
          />
          {vibe && (
            <button onClick={clearVibe} style={{ background: "none", border: "none", color: "#444", cursor: "pointer", padding: 0, fontSize: "16px", lineHeight: 1 }}>×</button>
          )}
          <button
            onClick={() => setShowFilters((v) => !v)}
            title="Advanced filters"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}
          >
            <svg width="14" height="14" viewBox="0 0 13 13" fill="none">
              <circle cx="6.5" cy="6.5" r="2" stroke={showFilters ? "#e53935" : "#333"} strokeWidth="1.2" />
              <path d="M6.5 1v1M6.5 11v1M1 6.5h1M11 6.5h1M2.5 2.5l.7.7M9.8 9.8l.7.7M2.5 10.5l.7-.7M9.8 3.2l.7-.7"
                stroke={showFilters ? "#e53935" : "#333"} strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* ── Hint text ── */}
        <p style={{ fontSize: "10px", color: "#2a2a2a", margin: "0 0 8px", paddingLeft: "2px" }}>
          Try: "something funny", "action movie", "chill night"
        </p>

        {/* ── Parsed chips ── */}
        {(parsed.mood || parsed.time) && (
          <div style={{ display: "flex", gap: "6px", marginBottom: "8px", flexWrap: "wrap" }}>
            {parsed.mood && <span style={S.pill(false)}>{parsed.mood} mood</span>}
            {parsed.time && <span style={S.pill(false)}>{parsed.time}</span>}
          </div>
        )}

        {/* ── Inline Filters (expandable) ── */}
        {showFilters && (
          <div style={{
            background: "#0d0d0d",
            border: "1px solid #1a1a1a",
            borderRadius: "14px",
            padding: "12px",
            marginBottom: "8px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}>
            <div>
              <p style={{ fontSize: "9px", color: "#333", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 5px" }}>Type</p>
              <div style={{ display: "flex", gap: "6px" }}>
                {TYPES.map((t) => (
                  <button key={t} onClick={() => setType(type === t ? "" : t)} style={S.pill(type === t)}>{t}</button>
                ))}
              </div>
            </div>
            <div>
              <p style={{ fontSize: "9px", color: "#333", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 5px" }}>Mood</p>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {MOODS.map((m) => (
                  <button key={m} onClick={() => setMood(mood === m ? "" : m)} style={S.pill(mood === m)}>{m}</button>
                ))}
              </div>
            </div>
            <div>
              <p style={{ fontSize: "9px", color: "#333", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 5px" }}>Time</p>
              <div style={{ display: "flex", gap: "6px" }}>
                {TIMES.map(([val, label]) => (
                  <button key={val} onClick={() => setTime(time === val ? "" : val)} style={S.pill(time === val)}>{label}</button>
                ))}
              </div>
            </div>
            <div>
              <p style={{ fontSize: "9px", color: "#333", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 5px" }}>Platform</p>
              <div style={{ display: "flex", gap: "6px", overflowX: "auto", paddingBottom: "2px" }}>
                {PLATFORMS.map((p) => (
                  <button key={p} onClick={() => setPlatform(platform === p ? "" : p)} style={{ ...S.pill(platform === p), flexShrink: 0 }}>{p}</button>
                ))}
              </div>
            </div>
          </div>
        )}

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
          {loading ? `🤖 ${message}` : "Pick for me"}
        </button>

        {!appReady && (
          <p style={{ fontSize: "10px", color: "#2a2a2a", textAlign: "center", margin: "-14px 0 14px", fontStyle: "italic" }}>
            Loading content...
          </p>
        )}

        {/* ── Results ── */}
        {results.length > 0 && (
          <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "16px", padding: "14px", marginBottom: "12px" }}>

            {wasReset && (
              <span style={{ display: "inline-block", fontSize: "10px", background: "#2a2000", color: "#f0a500", border: "1px solid #3a3000", borderRadius: "20px", padding: "2px 8px", marginBottom: "10px" }}>
                🔁 Showing new picks
              </span>
            )}

            <p style={{ fontSize: "9px", color: "#444", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 10px" }}>Your Top Pick</p>

            <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
              {results[0].poster && (
                <img src={results[0].poster} alt={results[0].name} style={{ width: "52px", height: "74px", borderRadius: "8px", objectFit: "cover", flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: "15px", fontWeight: 500, color: "#fff", margin: "0 0 2px", lineHeight: 1.3 }}>{results[0].name}</p>
                <p style={{ fontSize: "11px", color: "#444", margin: "0 0 6px" }}>{results[0].type}</p>
                <span style={{ fontSize: "10px", background: "#1a1a1a", border: "1px solid #222", borderRadius: "20px", padding: "2px 8px", color: "#aaa" }}>
                  {matchLabel(results[0].score, results[0].maxPossible)}
                </span>
              </div>
            </div>

            {results.length > 1 && (
              <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #1a1a1a" }}>
                <p style={{ fontSize: "9px", color: "#333", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 8px" }}>You may also like</p>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {results.slice(1).map((item, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      {item.poster && (
                        <img src={item.poster} alt={item.name} style={{ width: "28px", height: "40px", borderRadius: "5px", objectFit: "cover", flexShrink: 0 }} />
                      )}
                      <div>
                        <p style={{ fontSize: "13px", color: "#888", margin: 0, lineHeight: 1.3 }}>{item.name}</p>
                        <p style={{ fontSize: "10px", color: "#333", margin: 0 }}>{item.type}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={handleTryAgain}
              style={{ width: "100%", background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: "8px", padding: "8px", color: "#444", fontSize: "12px", cursor: "pointer", marginTop: "12px", fontFamily: "'DM Sans', system-ui, sans-serif" }}
            >
              ↻ Try again
            </button>
          </div>
        )}

        {/* ── Discover ── */}
        {explore.length > 0 && (
          <div style={{ marginBottom: "20px" }}>
            <p style={{ fontSize: "9px", color: "#333", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 8px" }}>Discover</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {explore.map((item, i) => (
                <div key={i} style={{ background: "#111", border: "1px solid #1a1a1a", borderRadius: "12px", padding: "10px", display: "flex", gap: "10px", alignItems: "center" }}>
                  {item.poster && (
                    <img src={item.poster} alt={item.name} style={{ width: "36px", height: "52px", borderRadius: "6px", objectFit: "cover", flexShrink: 0 }} />
                  )}
                  <div>
                    <p style={{ fontSize: "10px", color: "#444", margin: "0 0 2px" }}>{item.exploreLabel}</p>
                    <p style={{ fontSize: "13px", fontWeight: 500, color: "#ccc", margin: "0 0 3px" }}>{item.name}</p>
                    <span style={{ fontSize: "10px", background: "#1a1a1a", border: "1px solid #222", borderRadius: "20px", padding: "1px 7px", color: "#555" }}>{item.type}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Mode buttons ── */}
        <div style={{ borderTop: "1px solid #141414", paddingTop: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>

          <button
            onClick={() => window.location.href = "/group"}
            style={{
              background: "#0d1a0d", border: "1px solid #1e3a1e", borderRadius: "14px",
              padding: "13px 14px", display: "flex", alignItems: "center", justifyContent: "space-between",
              cursor: "pointer", width: "100%", textAlign: "left", position: "relative", overflow: "hidden",
            }}
          >
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "1px", background: "linear-gradient(90deg,transparent,#4caf50,transparent)" }} />
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ width: "32px", height: "32px", background: "#0d2a0d", borderRadius: "9px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                  <circle cx="5" cy="7" r="2.5" stroke="#4caf50" strokeWidth="1.5" />
                  <circle cx="11" cy="7" r="2.5" stroke="#4caf50" strokeWidth="1.5" />
                  <path d="M1 13c0-2 1.8-3.5 4-3.5" stroke="#4caf50" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M15 13c0-2-1.8-3.5-4-3.5" stroke="#4caf50" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <p style={{ fontSize: "13px", fontWeight: 500, color: "#fff", margin: 0 }}>Decide together</p>
                  <span style={{ fontSize: "9px", background: "#1a3a1a", color: "#4caf50", border: "1px solid #2a4a2a", borderRadius: "4px", padding: "1px 5px" }}>New</span>
                </div>
                <p style={{ fontSize: "10px", color: "#4a6a4a", margin: 0 }}>Create a group session</p>
              </div>
            </div>
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <path d="M5 3l4 4-4 4" stroke="#4caf50" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>

          <button
            onClick={() => window.location.href = "/family"}
            style={{
              background: "#111", border: "1px solid #1a1a1a", borderRadius: "14px",
              padding: "13px 14px", display: "flex", alignItems: "center", justifyContent: "space-between",
              cursor: "pointer", width: "100%", textAlign: "left",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ width: "32px", height: "32px", background: "#0f0d1f", borderRadius: "9px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="4.5" r="2.5" stroke="#7c6af5" strokeWidth="1.5" />
                  <path d="M4 13c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="#7c6af5" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="12.5" cy="6" r="1.5" stroke="#7c6af5" strokeWidth="1.2" />
                </svg>
              </div>
              <div>
                <p style={{ fontSize: "13px", fontWeight: 500, color: "#fff", margin: 0 }}>Family mode</p>
                <p style={{ fontSize: "10px", color: "#444", margin: 0 }}>Parent sets rules, kid picks mood</p>
              </div>
            </div>
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <path d="M5 3l4 4-4 4" stroke="#333" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>

        </div>
      </div>
    </main>
  );
}