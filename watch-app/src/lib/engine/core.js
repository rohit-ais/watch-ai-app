// ─── Engine: Core ────────────────────────────────────────────────────────────
// Domain-agnostic pipeline orchestrator.
// Takes items + filters + config + enricher → returns decision.
// Knows nothing about TMDb, movies, food, or any specific domain.

import {
  applyHardFilters,
  applyKidsModeFilter,
  applySeenFilter,
  applyMinScoreFilter,
  isVagueRequest,
} from "./filters.js";

import {
  preScore,
  fullScore,
  calcMaxPossible,
  getTrustLabel,
  sortAndShuffle,
  calcPopularityP80,
} from "./scorer.js";

import {
  mergeFilters,
  applyConflictPenalty,
  calcGroupFairness,
} from "./merger.js";

// ─── Helper: enforce hard filters on final output ─────────────────────────────
// Runs on final sorted output — guarantees type + genre always hold.
// Platform is intentionally excluded — can be sacrificed in fallback.
// NO escape hatch — if everything is removed, caller receives empty array.

function enforceHardFiltersOnOutput(items, filters, hardFilterRules) {
  if (!items || items.length === 0) return [];
  return items.filter((item) => {
    if (!item) return false;
    for (const [filterKey, isHard] of Object.entries(hardFilterRules)) {
      if (!isHard) continue;
      if (filterKey === "platform") continue; // platform can be sacrificed
      const filterValue = filters[filterKey];
      if (!filterValue) continue;
      if (filterKey === "type" && item.type !== filterValue) return false;
      if (filterKey === "genre") {
        const genreId = parseInt(filterValue);
        if (!item.genres || !item.genres.includes(genreId)) return false;
      }
    }
    return true;
  });
}

// ─── Solo engine ──────────────────────────────────────────────────────────────

export async function runSoloEngine({
  items,
  filters,
  vibeText = "",
  config,
  enricher,
  apiKey,
  seenTracker,
  kidsMode = false,
}) {
  const {
    weights,
    hardFilterRules,
    trustThresholds,
    qualityThresholds,
    candidatePoolSize,
    vagueWordThreshold,
    moodGenreMap,
  } = config;

  // ── Step 1: Hard filter ──
  // FIX: hardFiltered is ALWAYS the boundary — never fall back to raw items.
  // Raw items contain all types (Movie + Series). Falling back to them is
  // what caused Series to leak when Movie was the selected type.
  const hardFiltered = applyHardFilters(items, filters, hardFilterRules);

  // ── Step 1.5: Kids mode filter ──
  // Removes blocked genres (Horror/Thriller/Crime/War) + blocked certs (R/A/18+).
  // Applied after hard filters so it operates on an already type+genre safe pool.
  const kidsFiltered = kidsMode ? applyKidsModeFilter(hardFiltered) : hardFiltered;

  // ── Step 2: Remove seen items ──
  const seen = seenTracker.getSeen();
  let withoutSeen = applySeenFilter(kidsFiltered, seen);

  // ── Step 3: Handle pool exhaustion ──
  // FIX: on exhaustion, reset seen and reuse kidsFiltered — never raw items.
  // kidsFiltered is already type+genre+kids safe.
  let wasReset = false;
  if (withoutSeen.length === 0) {
    seenTracker.clearSeen();
    wasReset = seen.length > 0;
    withoutSeen = [...kidsFiltered];
  }

  // Edge case: kidsFiltered itself is empty (filter combo returns nothing).
  // Return empty result — do not breach type/genre to find something.
  if (withoutSeen.length === 0) {
    return {
      topPick: null, backups: [], trustLabel: "",
      wasReset, wasFallback: true, maxPossible: 0,
      updatedItems: items,
    };
  }

  // ── Step 4: Vague request detection ──
  const vague = isVagueRequest(filters, vibeText, vagueWordThreshold);

  // ── Step 5: Pre-score ──
  const maxPossible = calcMaxPossible(filters, weights);
  let preScored;

  if (vague) {
    preScored = withoutSeen.map((item) => ({
      ...item,
      score: (item.rating || 0) + (item.popularity || 0) / 100,
    }));
  } else {
    preScored = withoutSeen.map((item) => ({
      ...item,
      score: preScore(item, filters, weights, moodGenreMap),
    }));
  }

  // ── Step 6: Filter by min score ──
  const scoredAboveZero = applyMinScoreFilter(preScored, maxPossible);
  const candidateSource = scoredAboveZero.length > 0 ? scoredAboveZero : preScored;

  // ── Step 7: Shuffle + take top N for enrichment ──
  const popularityP80 = calcPopularityP80(candidateSource);
  const shuffled = [...candidateSource]
    .sort(() => 0.5 - Math.random())
    .slice(0, candidatePoolSize);

  // ── Step 8: Enrich top candidates ──
  let enriched = [];
  try {
    enriched = await enricher(shuffled, apiKey);
  } catch {
    enriched = shuffled; // enrichment failed — use unenriched items
  }

  // Guard: if enrichment returned empty, use shuffled as-is
  if (!enriched || enriched.length === 0) enriched = shuffled;

  // ── Step 9: Full score with enriched data ──
  const fullScored = enriched
    .filter(Boolean)
    .map((item) => ({
      ...item,
      score: fullScore(item, filters, weights, moodGenreMap, qualityThresholds, popularityP80, vague),
      maxPossible,
    }));

  if (fullScored.length === 0) {
    return {
      topPick: null, backups: [], trustLabel: "",
      wasReset, wasFallback: true, maxPossible,
      updatedItems: items,
    };
  }

  // ── Step 10: Score filter for primary path ──
  const scoredPrimary = applyMinScoreFilter(fullScored, maxPossible);
  const primaryPool = scoredPrimary.length > 0 ? scoredPrimary : fullScored;

  // ── Step 11: Platform post-enrichment filter ──
  let finalList;
  let wasFallback = false;

  if (filters.platform && filters.platform !== "Any") {
    const platformFiltered = primaryPool.filter(
      (item) => item.platform === filters.platform
    );
    if (platformFiltered.length > 0) {
      finalList = platformFiltered;
    } else {
      wasFallback = true;
      finalList = [...fullScored].sort(
        (a, b) =>
          (b.rating || 0) + (b.popularity || 0) / 100 -
          (a.rating || 0) - (a.popularity || 0) / 100
      );
    }
  } else {
    finalList = primaryPool;
  }

  // ── Step 12: Sort + shuffle ──
  const sorted = sortAndShuffle(finalList);

  // ── Step 13: SAFETY — enforce type + genre on final output ──
  // FIX: removed escape hatch "(safeTop.length > 0 ? safeTop : sorted)".
  // The old fallback to `sorted` allowed unfiltered items (Series) to appear
  // when enforceHardFiltersOnOutput removed everything. Now if safeTop is
  // empty, we return empty — type + genre are NEVER breached.
  const safeTop = enforceHardFiltersOnOutput(sorted, filters, hardFilterRules);
  const top3 = safeTop.slice(0, 3);

  if (top3.length === 0) {
    return {
      topPick: null, backups: [], trustLabel: "",
      wasReset, wasFallback: true, maxPossible,
      updatedItems: items,
    };
  }

  // ── Step 14: Update seen ──
  seenTracker.addSeen(top3.map((i) => i.name));

  // ── Step 15: Cache enriched values back ──
  const updatedItems = items.map((item) => {
    const enrichedItem = enriched.find((e) => e && e.id === item.id);
    return enrichedItem
      ? { ...item, time: enrichedItem.time, platform: enrichedItem.platform }
      : item;
  });

  // ── Step 16: Build result ──
  const topPick = top3[0] || null;
  const backups = top3.slice(1);
  const trustLabel = topPick
    ? getTrustLabel(topPick.score, maxPossible, trustThresholds)
    : "";

  return {
    topPick,
    backups,
    trustLabel,
    wasReset,
    wasFallback,
    maxPossible,
    updatedItems,
  };
}

// ─── Group engine ─────────────────────────────────────────────────────────────

export async function runGroupEngine({
  items,
  participants,
  filterKeys,
  config,
  enricher,
  apiKey,
  kidsMode = false,
}) {
  const {
    weights,
    hardFilterRules,
    trustThresholds,
    qualityThresholds,
    conflictThreshold,
    candidatePoolSize,
    moodGenreMap,
  } = config;

  // ── Step 1: Merge participant filters ──
  const mergedFilters = mergeFilters(participants, filterKeys);

  // ── Step 2: Hard filter ──
  // FIX: same as solo — never fall back to raw items if hardFiltered is empty.
  const hardFiltered = applyHardFilters(items, mergedFilters, hardFilterRules);

  // ── Step 1.5: Kids mode filter ──
  // Applied after hard filters — removes blocked genres + certifications.
  const kidsFiltered = kidsMode ? applyKidsModeFilter(hardFiltered) : hardFiltered;

  // Edge case: no items pass hard filters — return empty result.
  if (kidsFiltered.length === 0) {
    return {
      topPick: null, backups: [], trustLabel: "",
      mergedFilters, wasFallback: true, maxPossible: 0,
      fairness: { satisfied: 0, total: participants.length, pct: 0 },
    };
  }

  // ── Step 3: Pre-score ──
  const maxPossible = calcMaxPossible(mergedFilters, weights);
  const popularityP80 = calcPopularityP80(kidsFiltered);

  const preScored = kidsFiltered.map((item) => ({
    ...item,
    score: preScore(item, mergedFilters, weights, moodGenreMap),
  }));

  const scoredAboveZero = applyMinScoreFilter(preScored, maxPossible);
  const candidateSource = scoredAboveZero.length > 0 ? scoredAboveZero : preScored;

  // ── Step 4: Shuffle + take top N ──
  const shuffled = [...candidateSource]
    .sort(() => 0.5 - Math.random())
    .slice(0, candidatePoolSize);

  // ── Step 5: Enrich ──
  let enriched = [];
  try {
    enriched = await enricher(shuffled, apiKey);
  } catch {
    enriched = shuffled;
  }
  if (!enriched || enriched.length === 0) enriched = shuffled;

  // ── Step 6: Full score ──
  const fullScored = enriched
    .filter(Boolean)
    .map((item) => ({
      ...item,
      score: fullScore(item, mergedFilters, weights, moodGenreMap, qualityThresholds, popularityP80, false),
      maxPossible,
    }));

  if (fullScored.length === 0) {
    return {
      topPick: null, backups: [], trustLabel: "",
      mergedFilters, wasFallback: true, maxPossible,
      fairness: { satisfied: 0, total: participants.length, pct: 0 },
    };
  }

  // ── Step 7: Conflict penalty ──
  const withPenalty = applyConflictPenalty(
    fullScored, participants, weights, moodGenreMap,
    conflictThreshold, fullScore, calcMaxPossible
  );

  // ── Step 8: Platform post-enrichment filter ──
  let finalList;
  let wasFallback = false;

  const scoredPrimary = applyMinScoreFilter(withPenalty, maxPossible);
  const primaryPool = scoredPrimary.length > 0 ? scoredPrimary : withPenalty;

  if (mergedFilters.platform && mergedFilters.platform !== "Any") {
    const platformFiltered = primaryPool.filter(
      (item) => item.platform === mergedFilters.platform
    );
    if (platformFiltered.length > 0) {
      finalList = platformFiltered;
    } else {
      wasFallback = true;
      finalList = [...withPenalty].sort(
        (a, b) =>
          (b.rating || 0) + (b.popularity || 0) / 100 -
          (a.rating || 0) - (a.popularity || 0) / 100
      );
    }
  } else {
    finalList = primaryPool;
  }

  // ── Step 9: Sort + shuffle ──
  const sorted = sortAndShuffle(finalList);

  // ── Step 10: SAFETY — enforce type + genre on final output ──
  // FIX: removed escape hatch — same reasoning as solo engine Step 13.
  // type + genre are NEVER breached, even if safeTop is empty.
  const safeTop = enforceHardFiltersOnOutput(sorted, mergedFilters, hardFilterRules);
  const top3 = safeTop.slice(0, 3);

  if (top3.length === 0) {
    return {
      topPick: null, backups: [], trustLabel: "",
      mergedFilters, wasFallback: true, maxPossible,
      fairness: { satisfied: 0, total: participants.length, pct: 0 },
    };
  }

  // ── Step 11: Group fairness ──
  const fairness = calcGroupFairness(
    top3[0], participants, weights, moodGenreMap,
    conflictThreshold, fullScore, calcMaxPossible
  );

  // ── Step 12: Build result ──
  const topPick = top3[0] || null;
  const backups = top3.slice(1);
  const trustLabel = topPick
    ? getTrustLabel(topPick.score, maxPossible, trustThresholds)
    : "";

  return {
    topPick,
    backups,
    trustLabel,
    mergedFilters,
    wasFallback,
    maxPossible,
    fairness,
  };
}