// ─── Plans Domain Configuration ──────────────────────────────────────────────
// All constants, mappings, weights and rules for the plans domain.
// Nothing in this file is specific to UI — pure data and rules.

// ─── Vibes ───────────────────────────────────────────────────────────────────

export const VIBES = ["Relax", "Fun", "Adventure", "Food+Chill", "Kids-first"];

// ─── Vibe → activity tag mapping ─────────────────────────────────────────────
// Maps user-selected vibe to activity vibe tags in the catalog.
// Equivalent of GENRE_TO_MOOD in entertainment domain.

export const VIBE_TO_TAG = {
  "Relax":      "relax",
  "Fun":        "fun",
  "Adventure":  "adventure",
  "Food+Chill": "food-chill",
  "Kids-first": "kids-first",
};

// ─── Group Types ─────────────────────────────────────────────────────────────

export const GROUP_TYPES = ["Couple", "Friends", "Family"];

// ─── Time Options ─────────────────────────────────────────────────────────────

export const TIME_OPTIONS = ["1-2hr", "2-4hr", "Half-day", "Full-day"];

// ─── Budget Options ───────────────────────────────────────────────────────────

export const BUDGET_OPTIONS = ["Low", "Medium", "High"];

// ─── Location Options ─────────────────────────────────────────────────────────

export const LOCATION_OPTIONS = ["Indoor", "Outdoor", "Any"];

// ─── Cities ───────────────────────────────────────────────────────────────────

export const CITIES = [
  "Delhi NCR",
  "Mumbai",
  "Bangalore",
  "Hyderabad",
  "Pune",
  "Chandigarh",
];

// Metro-only cities — for cityType hard filter
export const METRO_ONLY_CITIES = ["Delhi NCR", "Mumbai", "Bangalore"];

// ─── Scoring weights ──────────────────────────────────────────────────────────

export const WEIGHTS = {
  vibe:       4,  // vibe match (equivalent of mood in entertainment)
  groupType:  3,  // group type match
  time:       3,  // time fit
  budget:     2,  // budget fit
  location:   2,  // indoor/outdoor fit
  kids:       3,  // kids fit

  // Quality boost
  popularity: 1,  // high popularityScore
  novelty:    1,  // high noveltyScore (surprise factor)
  timeOfDay:  2,  // time of day match

  // Penalty
  conflict:   3,  // group conflict penalty per mismatched participant
};

// ─── Quality thresholds ───────────────────────────────────────────────────────

export const QUALITY_THRESHOLDS = {
  novelty:    2,  // noveltyScore >= 2 gets boost
  popularity: 2,  // popularityScore >= 2 gets boost
};

// ─── Hard filter rules ────────────────────────────────────────────────────────
// All true — Plans filters are hard constraints, not soft signals.
// Budget, location, time, kids are non-negotiable for Plans.

export const HARD_FILTER_RULES = {
  groupType: true,
  time:      true,
  budget:    true,
  location:  true, // hard — Indoor means Indoor, Outdoor means Outdoor, Any passes both
  vibe:      false, // soft — optional filter, scoring only
  timeOfDay: false, // soft — scoring only, never blocks
};

// ─── Trust label thresholds ───────────────────────────────────────────────────
// Same pattern as entertainment domain.

export const TRUST_THRESHOLDS = [
  { min: 100, label: "⚡ Perfect Plan"        },
  { min: 75,  label: "👍 Strong Match"        },
  { min: 50,  label: "🙂 Good Match"          },
  { min: 1,   label: "🎲 Best Available"      },
  { min: 0,   label: "🗺️ Suggested for you"  },
];

// ─── Group conflict threshold ─────────────────────────────────────────────────

export const CONFLICT_THRESHOLD = 0.30;

// ─── Vague request detection ──────────────────────────────────────────────────
// Plans has no vibe text input — always filter-driven.
// Set to 0 so vague mode is never triggered.

export const VAGUE_WORD_THRESHOLD = 0;

// ─── Candidate pool size ──────────────────────────────────────────────────────

export const CANDIDATE_POOL_SIZE = 20;

// ─── Domain identifier ────────────────────────────────────────────────────────

export const DOMAIN = "plans";

// ─── Platform filter key ──────────────────────────────────────────────────────
// Plans has no platform concept — set to null.
// Engine skips platform post-filter entirely when this is null.

export const PLATFORM_FILTER_KEY = null;

// ─── Enriched fields ─────────────────────────────────────────────────────────
// Plans catalog is pre-tagged — no enrichment needed.
// Empty array = engine skips cache-back step cleanly.

export const ENRICHED_FIELDS = [];

// ─── Vague score function ─────────────────────────────────────────────────────
// Fallback scoring when no filters active.
// Uses catalog's own quality signals.

export const vagueScoreFn = (item) =>
  (item.popularityScore || 0) + (item.noveltyScore || 0);

// ─── Assembled config object ──────────────────────────────────────────────────

export const plansConfig = {
  weights:            WEIGHTS,
  hardFilterRules:    HARD_FILTER_RULES,
  trustThresholds:    TRUST_THRESHOLDS,
  qualityThresholds:  QUALITY_THRESHOLDS,
  conflictThreshold:  CONFLICT_THRESHOLD,
  candidatePoolSize:  CANDIDATE_POOL_SIZE,
  vagueWordThreshold: VAGUE_WORD_THRESHOLD,
  moodGenreMap:       VIBE_TO_TAG,
  platformFilterKey:  PLATFORM_FILTER_KEY,
  enrichedFields:     ENRICHED_FIELDS,
  vagueScoreFn:       vagueScoreFn,
};