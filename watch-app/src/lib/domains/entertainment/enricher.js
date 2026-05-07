// ─── Entertainment Domain: Enricher ──────────────────────────────────────────
// Lazy fetches runtime + platform for a list of items from TMDb.
// Called only for top candidates — never on full pool load.
// Caches results back into items to avoid repeat fetches.

import { getTimeBucket } from "./config.js";

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

/**
 * Fetch runtime for a single item from TMDb.
 *
 * @param {string|number} id
 * @param {string} mediaType  - "movie" or "tv"
 * @param {string} apiKey
 * @returns {Promise<string>} time bucket: "20-30" | "1hr" | "2hr+"
 */
export async function fetchRuntime(id, mediaType, apiKey) {
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/${mediaType}/${id}?api_key=${apiKey}`
    );
    const data = await res.json();
    const mins = mediaType === "movie"
      ? data.runtime
      : data.episode_run_time?.[0] || data.last_episode_to_air?.runtime || null;
    return getTimeBucket(mins);
  } catch {
    return "2hr+";
  }
}

/**
 * Fetch streaming platform for a single item from TMDb (India region).
 *
 * @param {string|number} id
 * @param {string} mediaType
 * @param {string} apiKey
 * @returns {Promise<string>} normalized platform name
 */
export async function fetchPlatform(id, mediaType, apiKey) {
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/${mediaType}/${id}/watch/providers?api_key=${apiKey}`
    );
    const data = await res.json();
    const providers = data.results?.IN?.flatrate;
    if (!providers?.length) return "Other";
    return normalizePlatform(providers[0].provider_name);
  } catch {
    return "Other";
  }
}

// ─── Batch enricher ───────────────────────────────────────────────────────────

/**
 * Enrich a list of items with runtime + platform.
 * Skips items that are already enriched (time + platform not null).
 * Fetches runtime and platform in parallel per item.
 *
 * @param {Array}  items   - Items to enrich
 * @param {string} apiKey  - TMDb API key
 * @returns {Promise<Array>} enriched items
 */
export async function enrichItems(items, apiKey) {
  return Promise.all(
    items.map(async (item) => {
      // Skip if already enriched — use cached values
      const needsRuntime  = item.time === null || item.time === undefined;
      const needsPlatform = item.platform === null || item.platform === undefined;

      if (!needsRuntime && !needsPlatform) return item;

      const [runtime, platform] = await Promise.all([
        needsRuntime  ? fetchRuntime(item.id, item.mediaType, apiKey)  : Promise.resolve(item.time),
        needsPlatform ? fetchPlatform(item.id, item.mediaType, apiKey) : Promise.resolve(item.platform),
      ]);

      return { ...item, time: runtime, platform };
    })
  );
}

// ─── Transform ────────────────────────────────────────────────────────────────

/**
 * Transform raw TMDb API item into engine-ready format.
 * time and platform are null — enriched lazily on pick.
 *
 * @param {Object} item  - Raw TMDb item
 * @returns {Object} engine item
 */
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
    time:       null,     // enriched lazily
    platform:   null,     // enriched lazily
  };
}