// ─── Engine: Scorer ───────────────────────────────────────────────────────────
// Pure functions. Domain-agnostic.
// Takes item + filters + weights + quality thresholds → returns score.
// Trust label logic also lives here.

/**
 * Calculate pre-score for an item BEFORE enrichment.
 * Only uses fields available without enrichment (mood, genres, type).
 * Used to select top candidates for enrichment.
 *
 * @param {Object} item            - Domain item
 * @param {Object} activeFilters   - { mood, genre, time, type, platform, ... }
 * @param {Object} weights         - From domain config
 * @param {Object} moodGenreMap    - genre ID → mood string (from domain config)
 * @returns {number} pre-score
 */
export function preScore(item, activeFilters, weights, moodGenreMap) {
  let score = 0;

  // Genre match — use genre mapping from mood if no explicit genre selected
  if (activeFilters.genre) {
    // Explicit genre selected — hard filter already removed non-matches
    // Give full genre weight
    const genreId = parseInt(activeFilters.genre);
    if (item.genres && item.genres.includes(genreId)) {
      score += weights.genre;
    }
  } else if (activeFilters.mood) {
    // No explicit genre — score via mood → genre mapping
    const itemMoods = getItemMoods(item.genres || [], moodGenreMap);
    if (itemMoods.includes(activeFilters.mood)) {
      score += weights.mood;
    }
  }

  // Vibe match — Plans domain (item.tags array, moodGenreMap is VIBE_TO_TAG)
  if (activeFilters.vibe && item.tags) {
    const vibeTag = moodGenreMap[activeFilters.vibe] || activeFilters.vibe;
    if (item.tags.includes(vibeTag)) {
      score += weights.vibe || 0;
    }
  }

  // Group type match — Plans domain
  if (activeFilters.groupType && item.groupTypes) {
    if (item.groupTypes.includes(activeFilters.groupType)) {
      score += weights.groupType || 0;
    }
  }

  return score;
}

/**
 * Calculate full score for an item AFTER enrichment.
 * Uses all available fields including enriched time + platform.
 *
 * @param {Object} item
 * @param {Object} activeFilters
 * @param {Object} weights
 * @param {Object} moodGenreMap
 * @param {Object} qualityThresholds  - From domain config
 * @param {number} popularityP80      - 80th percentile popularity in current pool
 * @returns {number} full score
 */
export function fullScore(item, activeFilters, weights, moodGenreMap, qualityThresholds, popularityP80, isVague = false) {
  let score = 0;

  // ── Primary intent scores ──

  // Genre match — Entertainment domain
  if (activeFilters.genre) {
    const genreId = parseInt(activeFilters.genre);
    if (item.genres && item.genres.includes(genreId)) {
      score += weights.genre;
    }
  } else if (activeFilters.mood) {
    const itemMoods = getItemMoods(item.genres || [], moodGenreMap);
    if (itemMoods.includes(activeFilters.mood)) {
      score += weights.mood;
    }
  }

  // Vibe match — Plans domain
  if (activeFilters.vibe && item.tags) {
    const vibeTag = moodGenreMap[activeFilters.vibe] || activeFilters.vibe;
    if (item.tags.includes(vibeTag)) {
      score += weights.vibe || 0;
    }
  }

  // Group type match — Plans domain
  if (activeFilters.groupType && item.groupTypes) {
    if (item.groupTypes.includes(activeFilters.groupType)) {
      score += weights.groupType || 0;
    }
  }

  // Time match
  if (activeFilters.time && item.time === activeFilters.time) {
    score += weights.time;
  }

  // Budget match — Plans domain
  if (activeFilters.budget && item.budget) {
    if (item.budget === activeFilters.budget) {
      score += weights.budget || 0;
    }
  }

  // Location match — Plans domain
  if (activeFilters.location && activeFilters.location !== "any" && item.location) {
    if (item.location === activeFilters.location) {
      score += weights.location || 0;
    }
  }

  // ── Quality boost (silent — never overrides intent) ──

  if (qualityThresholds) {
    // Entertainment quality signals
    if (item.rating && qualityThresholds.rating && item.rating >= qualityThresholds.rating) {
      score += weights.highRating || 0;
    }
    if (item.voteCount && qualityThresholds.votes && item.voteCount >= qualityThresholds.votes) {
      score += weights.highVotes || 0;
    }
    if (isVague && popularityP80 && item.popularity && item.popularity >= popularityP80) {
      score += weights.popular || 0;
    }
    // Plans quality signals
    if (item.noveltyScore && qualityThresholds.novelty && item.noveltyScore >= qualityThresholds.novelty) {
      score += weights.novelty || 0;
    }
    if (item.popularityScore && qualityThresholds.popularity && item.popularityScore >= qualityThresholds.popularity) {
      score += weights.popularity || 0;
    }
  }

  return score;
}

/**
 * Calculate maxPossible score given active filters.
 * Used for trust label percentage calculation.
 *
 * @param {Object} activeFilters
 * @param {Object} weights
 * @returns {number}
 */
export function calcMaxPossible(activeFilters, weights) {
  let max = 0;
  // Entertainment
  if (activeFilters.genre)     max += weights.genre;
  else if (activeFilters.mood) max += weights.mood;
  if (activeFilters.time)      max += weights.time;
  // Plans
  if (activeFilters.vibe)      max += weights.vibe || 0;
  if (activeFilters.groupType) max += weights.groupType || 0;
  if (activeFilters.budget)    max += weights.budget || 0;
  if (activeFilters.location && activeFilters.location !== "any") max += weights.location || 0;
  // Quality boosts not counted — trust label based on intent match only
  return max;
}

/**
 * Get trust label for a result.
 *
 * @param {number} score
 * @param {number} maxPossible
 * @param {Array}  trustThresholds  - From domain config, sorted descending by min
 * @returns {string} trust label
 */
export function getTrustLabel(score, maxPossible, trustThresholds) {
  if (!maxPossible || maxPossible === 0) {
    return trustThresholds[trustThresholds.length - 1].label;
  }
  const pct = Math.round((score / maxPossible) * 100);
  for (const threshold of trustThresholds) {
    if (pct >= threshold.min) return threshold.label;
  }
  return trustThresholds[trustThresholds.length - 1].label;
}

/**
 * Sort scored items.
 * Items with maxScore come first (shuffled within group).
 * Remaining items shuffled separately.
 * Prevents same top pick every time while respecting score order.
 *
 * @param {Array} scoredItems  - Items with .score property
 * @returns {Array} sorted + shuffled
 */
export function sortAndShuffle(scoredItems) {
  if (!scoredItems.length) return [];
  const maxScore = Math.max(...scoredItems.map((a) => a.score));
  return [
    ...scoredItems.filter((a) => a.score === maxScore).sort(() => 0.5 - Math.random()),
    ...scoredItems.filter((a) => a.score !== maxScore).sort(() => 0.5 - Math.random()),
  ];
}

/**
 * Calculate 80th percentile popularity in a pool.
 * Used to identify "popular" items without hardcoding a threshold.
 *
 * @param {Array} items
 * @returns {number}
 */
export function calcPopularityP80(items) {
  if (!items.length) return 0;
  const sorted = [...items].map((i) => i.popularity || 0).sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * 0.8);
  return sorted[idx] || 0;
}

/**
 * Get mood array for an item based on its genre IDs.
 * An item can match multiple moods.
 *
 * @param {Array}  genreIds     - Array of TMDb genre IDs
 * @param {Object} moodGenreMap - genre ID → mood string
 * @returns {Array} array of mood strings
 */
export function getItemMoods(genreIds, moodGenreMap) {
  return [...new Set(genreIds.map((id) => moodGenreMap[id]).filter(Boolean))];
}