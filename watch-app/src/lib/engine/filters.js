// ─── Engine: Hard Filters ────────────────────────────────────────────────────
// Pure functions. Domain-agnostic.
// Takes items + active filters + hard filter rules → returns filtered list.
// Never scores — only removes items that break hard rules.

/**
 * Apply hard filters to an item list.
 *
 * @param {Array}  items            - Array of domain items
 * @param {Object} activeFilters    - User selected filters { type, platform, genre, ... }
 * @param {Object} hardFilterRules  - From domain config — which filters are hard blockers
 * @returns {Array} filtered items
 */
export function applyHardFilters(items, activeFilters, hardFilterRules) {
  return items.filter((item) => passesHardFilters(item, activeFilters, hardFilterRules));
}

/**
 * Check if a single item passes all hard filters.
 *
 * @param {Object} item
 * @param {Object} activeFilters
 * @param {Object} hardFilterRules
 * @returns {boolean}
 */
export function passesHardFilters(item, activeFilters, hardFilterRules) {
  for (const [filterKey, isHard] of Object.entries(hardFilterRules)) {
    if (!isHard) continue;                          // soft filter — skip here
    const filterValue = activeFilters[filterKey];
    if (!filterValue) continue;                     // filter not active — skip

    // Platform special case — "Any" means no restriction
    if (filterKey === "platform" && filterValue === "Any") continue;

    // Type check
    if (filterKey === "type") {
      if (item.type !== filterValue) return false;
    }

    // Platform check
    if (filterKey === "platform") {
      if (item.platform && item.platform !== filterValue) return false;
      // If platform not yet enriched (null) — keep item, enrich later
    }

    // Genre check — item must contain the selected genre ID
    if (filterKey === "genre") {
      const genreId = parseInt(filterValue);
      if (!item.genres || !item.genres.includes(genreId)) return false;
    }

    // Generic field check — handles Plans domain filters
    if (filterKey !== "type" && filterKey !== "platform" && filterKey !== "genre") {
      // groupType filter checks item.groupTypes (array)
      if (filterKey === "groupType") {
        if (!item.groupTypes || !item.groupTypes.includes(filterValue)) return false;
      } else {
        // Scalar field check — budget, time
        const itemValue = item[filterKey];
        if (itemValue !== undefined && itemValue !== null) {
          if (itemValue !== filterValue) return false;
        }
      }
    }
  }
  return true;
}

/**
 * Apply seen filter — remove items already shown this session.
 *
 * @param {Array}  items    - Item list
 * @param {Array}  seenList - Array of item names already shown
 * @returns {Array}
 */
export function applySeenFilter(items, seenList) {
  if (!seenList || seenList.length === 0) return items;
  const seenSet = new Set(seenList);
  return items.filter((item) => !seenSet.has(item.name));
}

/**
 * Detect vague request.
 * Vague = no filters active AND vibe text is very short.
 * In vague mode, engine falls back to popularity + rating as primary signal.
 *
 * @param {Object} activeFilters
 * @param {string} vibeText
 * @param {number} wordThreshold   - From domain config
 * @returns {boolean}
 */
export function isVagueRequest(activeFilters, vibeText, wordThreshold) {
  const hasAnyFilter = Object.values(activeFilters).some((v) => v && v !== "");
  if (hasAnyFilter) return false;
  const wordCount = vibeText.trim().split(/\s+/).filter(Boolean).length;
  return wordCount <= wordThreshold;
}

/**
 * Filter by minimum score — removes items with zero intent match
 * when filters are active.
 *
 * @param {Array}   items        - Scored items (must have .score property)
 * @param {number}  maxPossible  - Maximum possible score given active filters
 * @returns {Array}
 */
export function applyMinScoreFilter(items, maxPossible) {
  if (maxPossible === 0) return items; // no filters active — keep all
  return items.filter((item) => item.score > 0);
}

// ─── Kids Mode Filter ─────────────────────────────────────────────────────────
// Hard blocks genres + certifications inappropriate for children.
// Called by core.js immediately after applyHardFilters when kidsMode = true.

const KIDS_BLOCKED_GENRES = [27, 53, 80, 10752]; // Horror, Thriller, Crime, War
const KIDS_BLOCKED_CERTS = ["R", "A", "18+"];

/**
 * Remove items that contain blocked genres or certifications.
 * @param {Array} items
 * @returns {Array}
 */
export function applyKidsModeFilter(items) {
  return items.filter((item) => {
    if (item.genres?.some((g) => KIDS_BLOCKED_GENRES.includes(g))) return false;
    if (item.certification && KIDS_BLOCKED_CERTS.includes(item.certification)) return false;
    return true;
  });
}