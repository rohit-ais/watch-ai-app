"use client";
import { supabase } from "../lib/supabase";
import { useState } from "react";
import { useEffect } from "react";


export default function Home() {
  const [type, setType] = useState("");
  const [time, setTime] = useState("");
  const [mood, setMood] = useState("");
  const [platform, setPlatform] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [contentList, setContentList] = useState([]);
  const [explore, setExplore] = useState([]);
  const [wasReset, setWasReset] = useState(false);
  const [appReady, setAppReady] = useState(false);

  useEffect(() => {
    supabase.from("sessions").select("*").limit(1).then(console.log);
    localStorage.removeItem("seen");
    fetchMovies();
  }, []);

  const genreToMood = {
    28: "Intense",
    12: "Fun",
    16: "Light",
    35: "Fun",
    18: "Intense",
    27: "Intense",
    10749: "Chill",
    878: "Intense",
    10751: "Light",
    99: "Chill",
  };

  const fetchMovies = async () => {
    const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;

    const normalizePlatform = (name) => {
      if (!name) return "Other";
      const n = name.toLowerCase();
      if (n.includes("netflix")) return "Netflix";
      if (n.includes("amazon") || n.includes("prime")) return "Prime";
      if (n.includes("disney")) return "Disney+";
      if (n.includes("jio")) return "JioCinema";
      return "Other";
    };

    const getProviders = async (id, type) => {
      try {
        const res = await fetch(
          `https://api.themoviedb.org/3/${type}/${id}/watch/providers?api_key=${apiKey}`
        );
        const data = await res.json();
        const providers = data.results?.IN?.flatrate;
        if (!providers || providers.length === 0) return "Other";
        return normalizePlatform(providers[0].provider_name);
      } catch {
        return "Other";
      }
    };

    const getRuntime = async (id, type) => {
      try {
        const res = await fetch(
          `https://api.themoviedb.org/3/${type}/${id}?api_key=${apiKey}`
        );
        const data = await res.json();
        const mins =
          type === "movie"
            ? data.runtime
            : data.episode_run_time?.[0] ||
            data.last_episode_to_air?.runtime ||
            null;
        if (!mins) return "2hr+";
        if (mins <= 35) return "20-30";
        if (mins <= 75) return "1hr";
        return "2hr+";
      } catch {
        return "2hr+";
      }
    };

    let combined = [];

    try {
      const [popRes, topRes, pop2Res, top2Res] = await Promise.all([
        fetch(`https://api.themoviedb.org/3/movie/popular?api_key=${apiKey}&page=1`),
        fetch(`https://api.themoviedb.org/3/movie/top_rated?api_key=${apiKey}&page=1`),
        fetch(`https://api.themoviedb.org/3/movie/popular?api_key=${apiKey}&page=2`),
        fetch(`https://api.themoviedb.org/3/movie/top_rated?api_key=${apiKey}&page=2`)
      ]);
      const popData = await popRes.json();
      const topData = await topRes.json();
      const pop2Data = await pop2Res.json();
      const top2Data = await top2Res.json();
      const data = {
        results: [
          ...(popData.results || []),
          ...(topData.results || []),
          ...(pop2Data.results || []),
          ...(top2Data.results || [])
        ]
      };

      let tvResults = [];
      try {
        const [tvPopRes, tvTopRes, tvPop2Res, tvTop2Res] = await Promise.all([
          fetch(`https://api.themoviedb.org/3/tv/popular?api_key=${apiKey}&page=1`),
          fetch(`https://api.themoviedb.org/3/tv/top_rated?api_key=${apiKey}&page=1`),
          fetch(`https://api.themoviedb.org/3/tv/popular?api_key=${apiKey}&page=2`),
          fetch(`https://api.themoviedb.org/3/tv/top_rated?api_key=${apiKey}&page=2`)
        ]);
        const tvPopData = await tvPopRes.json();
        const tvTopData = await tvTopRes.json();
        const tvPop2Data = await tvPop2Res.json();
        const tvTop2Data = await tvTop2Res.json();
        tvResults = [
          ...(tvPopData.results || []),
          ...(tvTopData.results || []),
          ...(tvPop2Data.results || []),
          ...(tvTop2Data.results || [])
        ];
      } catch {
        // TV fetch failed, movies only
      }
      combined = [...data.results, ...tvResults];
    } catch (error) {
      console.error("API Error:", error);
      const res = await fetch(
        `https://api.themoviedb.org/3/movie/popular?api_key=${apiKey}`
      );
      const data = await res.json();
      combined = data.results;
    }

    const transformed = await Promise.all(
      combined.slice(0, 120).map(async (item) => ({
        name: item.title || item.name,
        poster: item.poster_path
          ? `https://image.tmdb.org/t/p/w200${item.poster_path}`
          : null,
        popularity: item.popularity || 0,
        rating: item.vote_average || 0,
        type: item.title ? "Movie" : "Series",
        genres: item.genre_ids,
        mood: [...new Set(item.genre_ids.map((id) => genreToMood[id]).filter(Boolean))],
        time: await getRuntime(item.id, item.title ? "movie" : "tv"),
        platform: await getProviders(item.id, item.title ? "movie" : "tv"),
      }))
    );

    setContentList(transformed);
    setAppReady(true);
  };

  const handlePick = () => {
    setLoading(true);
    setMessage("Analyzing your mood...");

    setTimeout(() => {
      const seen = JSON.parse(localStorage.getItem("seen")) || [];
      setMessage("Matching best content...");
      setWasReset(false);

      const maxPossible = (type ? 2 : 0) + (mood ? 3 : 0) + (time ? 2 : 0);

      const scoredList = contentList
        .filter((item) => !seen.includes(item.name))
        .filter((item) => (type ? item.type === type : true))
        .map((item) => {
          let score = 0;
          if (type && item.type === type) score += 2;
          if (mood && item.mood.includes(mood)) score += 3;
          if (time && item.time === time) score += 2;
          return { ...item, score, maxPossible };
        })
        .filter((item) => (maxPossible === 0 ? true : item.score > 0))
        .filter((item) => (platform && platform !== "Any" ? item.platform === platform : true));

      let finalList = scoredList;

      if (finalList.length === 0) {
        localStorage.removeItem("seen");
        if (seen.length > 0) setWasReset(true);
        finalList = contentList
          .filter((item) => (type ? item.type === type : true))
          .map((item) => {
            let score = 0;
            if (type && item.type === type) score += 2;
            if (mood && item.mood.includes(mood)) score += 3;
            if (time && item.time === time) score += 2;
            return { ...item, score, maxPossible };
          })
          .filter((item) => (maxPossible === 0 ? true : item.score > 0))
          .filter((item) => (platform && platform !== "Any" ? item.platform === platform : true));
      }

      const maxScore = Math.max(...finalList.map((a) => a.score));
      const top = finalList.filter((a) => a.score === maxScore);
      const rest = finalList.filter((a) => a.score !== maxScore);
      const sorted = [
        ...top.sort(() => 0.5 - Math.random()),
        ...rest.sort(() => 0.5 - Math.random()),
      ];

      const newSeen = [
        ...seen,
        ...sorted.slice(0, 3).map((item) => item.name),
      ];
      localStorage.setItem("seen", JSON.stringify(newSeen));

      setResults(sorted.slice(0, 3));

      const topNames = sorted.slice(0, 3).map((i) => i.name);
      const available = contentList.filter((item) => !topNames.includes(item.name));
      const trending = [...available].sort((a, b) => b.popularity - a.popularity)[0];
      const topRated = [...available]
        .filter((item) => item.name !== trending?.name)
        .sort((a, b) => b.rating - a.rating)[0];
      const exploreItems = [
        trending ? { ...trending, exploreLabel: "🔥 Trending Now" } : null,
        topRated ? { ...topRated, exploreLabel: "⭐ Top Rated" } : null,
      ].filter(Boolean);

      setExplore(exploreItems);
      setMessage("Almost there...");

      setTimeout(() => {
        setLoading(false);
        setMessage("");
      }, 300);
    }, 400);
  };

  const filterBtn = (active) =>
    `px-3 py-1 text-sm rounded-full border transition-all ${
      active
        ? "bg-red-500 border-red-500 text-white"
        : "border-gray-700 text-gray-300 hover:border-gray-500"
    }`;

  const matchLabel = (score, max) => {
    const pct = max ? Math.round((score / max) * 100) : 0;
    if (pct === 100) return "⚡ Perfect Match";
    if (pct >= 75) return "👍 Strong Match";
    if (pct >= 50) return "🙂 Good Match";
    if (pct > 0) return "🎲 Best Available";
    return "🎬 Recommended for you";
  };

  return (
    <main className="min-h-screen bg-black text-white max-w-md mx-auto px-4 pt-6 pb-10">

      {/* Header */}
      <div className="mb-4">
        <h1 className="text-xl font-bold tracking-tight">🎬 What to watch?</h1>
        <p className="text-xs text-gray-500 mt-0.5">Pick your vibe, get your answer.</p>
      </div>

      {/* Filters */}
      <div className="space-y-3 mb-4">

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 w-14 shrink-0">Type</span>
          <div className="flex gap-2">
            {["Movie", "Series"].map((t) => (
              <button key={t} onClick={() => setType(type === t ? "" : t)} className={filterBtn(type === t)}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 w-14 shrink-0">Time</span>
          <div className="flex gap-2">
            {[["20-30", "20-30m"], ["1hr", "1 Hr"], ["2hr+", "2+ Hr"]].map(([val, label]) => (
              <button key={val} onClick={() => setTime(time === val ? "" : val)} className={filterBtn(time === val)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 w-14 shrink-0">Mood</span>
          <div className="flex gap-2 flex-wrap">
            {["Chill", "Fun", "Intense", "Light"].map((m) => (
              <button key={m} onClick={() => setMood(mood === m ? "" : m)} className={filterBtn(mood === m)}>
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 w-14 shrink-0">Platform</span>
          <div className="flex gap-2 overflow-x-auto pb-0.5">
            {["Netflix", "Prime", "Disney+", "JioCinema", "Any"].map((p) => (
              <button key={p} onClick={() => setPlatform(platform === p ? "" : p)} className={`${filterBtn(platform === p)} shrink-0`}>
                {p}
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* Pick Button */}
      <button
        onClick={handlePick}
        disabled={loading || !appReady}
        className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-full text-base transition-all"
      >
        {loading ? `🤖 ${message}` : "🎯 Pick for me"}
      </button>

      {!appReady && (
        <p className="text-xs text-gray-600 mt-2 text-center animate-pulse">⏳ Loading content...</p>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="mt-4 bg-gray-900 rounded-2xl p-4">

          {wasReset && (
            <span className="inline-block text-xs bg-yellow-500 text-black px-2 py-0.5 rounded-full mb-2">
              🔁 Showing new picks
            </span>
          )}

          <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Your Top Pick</p>
          <div className="flex gap-3 items-start">
            {results[0].poster && (
              <img
                src={results[0].poster}
                alt={results[0].name}
                className="w-14 h-20 rounded-lg object-cover shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-base leading-tight">{results[0].name}</p>
              <p className="text-xs text-gray-400 mt-0.5">{results[0].type}</p>
              <span className="inline-block mt-1.5 text-xs bg-gray-700 px-2 py-0.5 rounded-full">
                {matchLabel(results[0].score, results[0].maxPossible)}
              </span>
            </div>
          </div>

          {results.length > 1 && (
            <div className="mt-3 pt-3 border-t border-gray-800">
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">You may also like</p>
              <div className="space-y-2">
                {results.slice(1).map((item, index) => (
                  <div key={index} className="flex items-center gap-2">
                    {item.poster && (
                      <img
                        src={item.poster}
                        alt={item.name}
                        className="w-8 h-11 rounded object-cover shrink-0"
                      />
                    )}
                    <div>
                      <p className="text-sm font-medium leading-tight">{item.name}</p>
                      <p className="text-xs text-gray-400">{item.type}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Discover */}
      {explore.length > 0 && (
        <div className="mt-6">
          <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Discover</p>
          <div className="space-y-2">
            {explore.map((item, index) => (
              <div key={index} className="bg-gray-900 rounded-xl p-3 flex gap-3 items-center">
                {item.poster && (
                  <img
                    src={item.poster}
                    alt={item.name}
                    className="w-10 h-14 rounded-lg object-cover shrink-0"
                  />
                )}
                <div>
                  <p className="text-xs text-gray-400">{item.exploreLabel}</p>
                  <p className="text-sm font-semibold">{item.name}</p>
                  <span className="inline-block text-xs bg-gray-700 px-2 py-0.5 rounded-full mt-0.5">
                    {item.type}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </main>
  );
}