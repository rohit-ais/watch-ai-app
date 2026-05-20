// ─── Entertainment Domain: Enricher ──────────────────────────────────────────
// Lazy fetches runtime + platform for a list of items from TMDb.
// Called only for top candidates — never on full pool load.
// Supabase content_cache used to avoid repeat TMDb calls (7-day expiry).
// TMDb calls proxied via /api/tmdb — key never exposed to client.

import { getTimeBucket } from "./config.js";
import { supabase } from "../../supabase.js";

const DOMAIN = "entertainment";
const CACHE_TTL_DAYS = 7;

// ─── Platform normalizer ──────────────────────────────────────────────────────

export function normalizePlatform(name) {
  if (!name) return "Other";
  const n = name.toLowerCase();
  if (n.includes("netflix")) return "Netflix";
  if (n.includes("amazon") || n.includes("prime")) return "Prime";
  if (n.includes("disney")) return "Disney+";
  if (n.includes("jio")) return "JioCinema";
  return "Other";
}

// ─── Single item fetchers ─────────────────────────────────────────────────────

export async function fetchRuntime(id, mediaType) {
  try {
    const res = await fetch(`/api/tmdb?path=/${mediaType}/${id}`);
    const data = await res.json();
    const mins = mediaType === "movie"
      ? data.runtime
      : data.episode_run_time?.[0] || data.last_episode_to_air?.runtime || null;
    return getTimeBucket(mins);
  } catch {
    return "2hr+";
  }
}

export async function fetchPlatform(id, mediaType) {
  try {
    const res = await fetch(`/api/tmdb?path=/${mediaType}/${id}/watch/providers`);
    const data = await res.json();
    const providers = data.results?.IN?.flatrate;
    if (!providers?.length) return "Other";
    return normalizePlatform(providers[0].provider_name);
  } catch {
    return "Other";
  }
}

// ─── Supabase cache helpers ───────────────────────────────────────────────────

async function getFromCache(itemId) {
  try {
    const { data, error } = await supabase
      .from("content_cache")
      .select("item_data")
      .eq("domain", DOMAIN)
      .eq("item_id", String(itemId))
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (error || !data) return null;
    return data.item_data;
  } catch {
    return null;
  }
}

async function writeToCache(itemId, itemData) {
  try {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + CACHE_TTL_DAYS);

    await supabase.from("content_cache").upsert(
      {
        domain:     DOMAIN,
        item_id:    String(itemId),
        item_data:  itemData,
        expires_at: expiresAt.toISOString(),
        created_at: new Date().toISOString(),
      },
      { onConflict: "domain,item_id" }
    );
  } catch {
    // Cache write failure is non-fatal — TMDb data already used
  }
}

// ─── Batch enricher ───────────────────────────────────────────────────────────

export async function enrichItems(items) {
  return Promise.all(
    items.map(async (item) => {
      const needsRuntime  = item.time === null || item.time === undefined;
      const needsPlatform = item.platform === null || item.platform === undefined;

      // Already enriched in memory — skip everything
      if (!needsRuntime && !needsPlatform) return item;

      // ── Check Supabase cache ──
      const cached = await getFromCache(item.id);
      if (cached?.time && cached?.platform) {
        return { ...item, time: cached.time, platform: cached.platform };
      }

      // ── Cache miss — fetch from TMDb via proxy ──
      const [runtime, platform] = await Promise.all([
        needsRuntime  ? fetchRuntime(item.id, item.mediaType)  : Promise.resolve(item.time),
        needsPlatform ? fetchPlatform(item.id, item.mediaType) : Promise.resolve(item.platform),
      ]);

      // ── Write to Supabase cache (non-blocking) ──
      writeToCache(item.id, { time: runtime, platform });

      return { ...item, time: runtime, platform };
    })
  );
}

// ─── Transform ────────────────────────────────────────────────────────────────

export function transformTMDbItem(item) {
  return {
    id:         item.id,
    mediaType:  item.title ? "movie" : "tv",
    name:       item.title || item.name,
    poster:     item.poster_path
                  ? `https://image.tmdb.org/t/p/w200${item.poster_path}`
                  : null,
    popularity: item.popularity  || 0,
    rating:     item.vote_average || 0,
    voteCount:  item.vote_count  || 0,
    type:       item.title ? "Movie" : "Series",
    genres:     item.genre_ids   || [],
    time:       null,
    platform:   null,
  };
}