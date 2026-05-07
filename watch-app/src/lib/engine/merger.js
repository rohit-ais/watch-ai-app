// ─── Engine: Group Merger ────────────────────────────────────────────────────
// Pure functions. Domain-agnostic.
// Merges participant filter votes into a single filter set.
// Applies conflict penalty when a participant has very low match.

/**
 * Merge participant votes into a single filter set.
 * Uses majority vote for each filter dimension.
 * Platform: only applied if ALL participants picked the same platform.
 *
 * @param {Array}  participants  - Array of participant objects with filter fields
 * @param {Array}  filterKeys    - Which filter keys to merge e.g. ["mood","time","type","platform","genre"]
 * @returns {Object} merged filters
 */
export function mergeFilters(participants, filterKeys) {
  if (!participants || participants.length === 0) return {};

  const merged = {};

  for (const key of filterKeys) {
    if (key === "platform") {
      // Platform: only filter if everyone agrees
      const platformVotes = participants
        .map((p) => p[key])
        .filter((v) => v && v !== "" && v !== "Any");

      merged[key] = platformVotes.length > 0 &&
        platformVotes.every((p) => p === platformVotes[0])
        ? platformVotes[0]
        : "";
    } else {
      // All other filters: majority vote
      merged[key] = majority(participants.map((p) => p[key]));
    }
  }

  return merged;
}

/**
 * Score an item for a single participant.
 * Used for conflict detection.
 *
 * @param {Object}   item
 * @param {Object}   participantFilters  - Single participant's filter choices
 * @param {Object}   weights             - From domain config
 * @param {Object}   moodGenreMap        - From domain config
 * @param {Function} scoreItemFn         - fullScore function from scorer.js
 * @returns {number} score for this participant
 */
export function scoreForParticipant(item, participantFilters, weights, moodGenreMap, scoreItemFn) {
  return scoreItemFn(item, participantFilters, weights, moodGenreMap, null, null);
}

/**
 * Calculate max possible score for a participant's filters.
 *
 * @param {Object} participantFilters
 * @param {Object} weights
 * @param {Function} calcMaxFn  - calcMaxPossible from scorer.js
 * @returns {number}
 */
export function maxForParticipant(participantFilters, weights, calcMaxFn) {
  return calcMaxFn(participantFilters, weights);
}

/**
 * Apply group conflict penalty to scored items.
 *
 * For each item:
 * - Score it against each participant's individual filters
 * - If any participant's match % is below conflictThreshold → apply penalty
 * - Penalty = weights.conflict per mismatched participant
 *
 * @param {Array}    scoredItems        - Items with .score property (merged score)
 * @param {Array}    participants       - Full participant array with filter fields
 * @param {Object}   weights            - From domain config
 * @param {Object}   moodGenreMap       - From domain config
 * @param {number}   conflictThreshold  - e.g. 0.30 (30%)
 * @param {Function} scoreItemFn        - fullScore from scorer.js
 * @param {Function} calcMaxFn          - calcMaxPossible from scorer.js
 * @returns {Array} items with adjusted scores
 */
export function applyConflictPenalty(
  scoredItems,
  participants,
  weights,
  moodGenreMap,
  conflictThreshold,
  scoreItemFn,
  calcMaxFn
) {
  if (!participants || participants.length <= 1) return scoredItems;

  return scoredItems.map((item) => {
    let penalty = 0;

    for (const participant of participants) {
      const pFilters = {
        mood:     participant.mood     || "",
        genre:    participant.genre    || null,
        time:     participant.time     || "",
        type:     participant.type     || "",
        platform: participant.platform || "",
      };

      const pMax   = calcMaxFn(pFilters, weights);
      const pScore = scoreItemFn(item, pFilters, weights, moodGenreMap, null, null);

      // Only apply penalty if participant has active filters
      if (pMax > 0) {
        const matchPct = pScore / pMax;
        if (matchPct < conflictThreshold) {
          penalty += weights.conflict || 2;
        }
      }
    }

    return {
      ...item,
      score: Math.max(0, item.score - penalty),
      conflictPenalty: penalty,
    };
  });
}

/**
 * Get majority value from an array of votes.
 * Returns empty string if no clear majority or no votes.
 *
 * @param {Array} votes
 * @returns {string}
 */
export function majority(votes) {
  if (!votes || votes.length === 0) return "";
  const valid = votes.filter((v) => v && v !== "");
  if (valid.length === 0) return "";

  const freq = {};
  valid.forEach((v) => { freq[v] = (freq[v] || 0) + 1; });

  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  return sorted[0][0];
}

/**
 * Calculate group fairness score.
 * Returns percentage of participants whose match % is above conflict threshold.
 * Used for UI display ("Best for 3/4 people").
 *
 * @param {Object}   item
 * @param {Array}    participants
 * @param {Object}   weights
 * @param {Object}   moodGenreMap
 * @param {number}   conflictThreshold
 * @param {Function} scoreItemFn
 * @param {Function} calcMaxFn
 * @returns {{ satisfied: number, total: number, pct: number }}
 */
export function calcGroupFairness(
  item,
  participants,
  weights,
  moodGenreMap,
  conflictThreshold,
  scoreItemFn,
  calcMaxFn
) {
  if (!participants || participants.length === 0) {
    return { satisfied: 0, total: 0, pct: 0 };
  }

  let satisfied = 0;

  for (const participant of participants) {
    const pFilters = {
      mood:     participant.mood     || "",
      genre:    participant.genre    || null,
      time:     participant.time     || "",
      type:     participant.type     || "",
      platform: participant.platform || "",
    };

    const pMax   = calcMaxFn(pFilters, weights);
    const pScore = scoreItemFn(item, pFilters, weights, moodGenreMap, null, null);

    if (pMax === 0 || pScore / pMax >= conflictThreshold) {
      satisfied++;
    }
  }

  return {
    satisfied,
    total: participants.length,
    pct: Math.round((satisfied / participants.length) * 100),
  };
}