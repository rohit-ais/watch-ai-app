// ─── Plans Domain: Transform ──────────────────────────────────────────────────
// Maps activity catalog items to the generic engine item format.
// Engine only knows: id, name, type, genres, mood, tags, rating,
// popularity, voteCount. Transform bridges catalog schema → engine schema.

import { METRO_ONLY_CITIES } from "./config.js";

// ─── City type resolver ───────────────────────────────────────────────────────
// Returns true if this activity is available in the user's selected city.

function isCityAvailable(cityType, selectedCity) {
  if (!selectedCity) return true;
  if (cityType === "all") return true;
  if (cityType === "metro-tier2") return true; // all supported cities qualify
  if (cityType === "metro-only") return METRO_ONLY_CITIES.includes(selectedCity);
  return true;
}

// ─── Location resolver ────────────────────────────────────────────────────────
// Maps catalog location ("indoor" | "outdoor" | "home") to engine-readable value.
// "home" is treated as "indoor" for filter matching purposes.

function resolveLocation(location) {
  if (location === "home") return "indoor";
  return location;
}

// ─── Transform single activity ────────────────────────────────────────────────
// Maps one catalog item → engine item.
//
// Engine field mapping:
//   id            → id (unchanged)
//   name          → name (unchanged)
//   type          → always "Activity" (Plans has no Movie/Series split)
//   genres        → [] (Plans uses tags/vibes, not genre IDs)
//   tags          → vibes array from catalog (used by scorer for vibe match)
//   groupTypes    → groupTypes array (used for groupType scoring)
//   mood          → primary vibe (first item in vibes array)
//   rating        → popularityScore (1-3 scale, used for quality boost)
//   popularity    → popularityScore * 33 (scaled to ~100 for engine compat)
//   voteCount     → popularityScore * 1000 (proxy — no real votes in catalog)
//   time          → timeNeeded (matched against user time filter)
//   budget        → budget (matched against user budget filter)
//   location      → resolved location (indoor/outdoor)
//   kidsFriendly  → kidsFriendly (boolean)
//   cityType      → cityType (used in hard filter)
//   noveltyScore  → noveltyScore (quality boost signal)
//   popularityScore → popularityScore (quality boost signal)
//   effortScore   → effortScore (low effort boost signal)
//   weatherSafe   → weatherSafe (boolean)

export function transformActivity(item, selectedCity = null) {
  // City hard filter — skip unavailable activities entirely
  if (!isCityAvailable(item.cityType, selectedCity)) return null;

  return {
    id:             item.id,
    name:           item.name,
    type:           "Activity",
    genres:         [],
    tags:           item.vibes || [],
    groupTypes:     item.groupTypes || [],
    mood:           item.vibes?.[0] || "",
    rating:         item.popularityScore || 1,
    popularity:     (item.popularityScore || 1) * 33,
    voteCount:      (item.popularityScore || 1) * 1000,
    time:           item.timeNeeded,
    budget:         item.budget,
    location:       resolveLocation(item.location),
    kidsFriendly:   item.kidsFriendly,
    cityType:       item.cityType,
    noveltyScore:   item.noveltyScore,
    popularityScore: item.popularityScore,
    effortScore:    item.effortScore,
    weatherSafe:    item.weatherSafe,
    category:       item.category,
    timeOfDay:      item.timeOfDay || [],
    actionType:     item.actionType ?? null,   // ← add
    mapQuery:       item.mapQuery ?? null,      // ← add
  };
}

// ─── Transform full catalog ───────────────────────────────────────────────────
// Filters out null entries (city-excluded activities).

export function transformCatalog(catalog, selectedCity = null) {
  return catalog
    .map((item) => transformActivity(item, selectedCity))
    .filter(Boolean);
}

// ─── Plans enricher ───────────────────────────────────────────────────────────
// Plans catalog is pre-tagged — no async enrichment needed.
// Returns items unchanged. Satisfies engine's enricher interface.

export async function enrichItems(items) {
  return items;
}