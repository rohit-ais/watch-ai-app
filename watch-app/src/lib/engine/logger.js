// ─── Engine: Logger ───────────────────────────────────────────────────────────
// Domain-agnostic event logging to Supabase events table.
// Always silent — never blocks user or throws to UI.
// Logs: picks, rejections, group decisions.

import { supabase } from "../supabase.js";

/**
 * Log a pick event.
 * Called after results are set — fire and forget.
 *
 * @param {Object} params
 * @param {string} params.domain      - e.g. "entertainment"
 * @param {string} params.mode        - "solo" | "group"
 * @param {Object} params.filters     - Active filters at time of pick
 * @param {Object} params.topPick     - Top result item
 * @param {string} params.matchLabel  - Trust label shown to user
 * @param {boolean} params.wasFallback - Was this a fallback result?
 * @param {string|null} params.sessionId - Group session ID or null
 */
export async function logPick({
  domain,
  mode,
  filters,
  topPick,
  matchLabel,
  wasFallback,
  sessionId = null,
}) {
  try {
    await supabase.from("events").insert({
      domain,
      mode,
      filters,
      top_pick:    topPick?.name  || null,
      match_label: matchLabel     || null,
      was_fallback: wasFallback   || false,
      session_id:  sessionId,
    });
  } catch { /* silent — never block user */ }
}

/**
 * Log an implicit rejection event.
 * Called when user clicks Try Again within rejection threshold.
 *
 * @param {Object} params
 * @param {string} params.domain
 * @param {string} params.mode
 * @param {Object} params.filters
 * @param {Object} params.rejectedPick  - The pick that was rejected
 * @param {string|null} params.sessionId
 */
export async function logRejection({
  domain,
  mode,
  filters,
  rejectedPick,
  sessionId = null,
}) {
  try {
    await supabase.from("events").insert({
      domain,
      mode,
      filters,
      top_pick:    rejectedPick?.name || null,
      match_label: "REJECTED",
      was_fallback: false,
      session_id:  sessionId,
    });
  } catch { /* silent */ }
}

/**
 * Log a group decision event.
 * Called when host triggers Decide — logs merged filters + result.
 *
 * @param {Object} params
 * @param {string} params.domain
 * @param {Object} params.mergedFilters  - Result of group merge
 * @param {Object} params.topPick
 * @param {string} params.matchLabel
 * @param {boolean} params.wasFallback
 * @param {string} params.sessionId
 * @param {number} params.participantCount
 */
export async function logGroupDecision({
  domain,
  mergedFilters,
  topPick,
  matchLabel,
  wasFallback,
  sessionId,
  participantCount,
}) {
  try {
    await supabase.from("events").insert({
      domain,
      mode: "group",
      filters: { ...mergedFilters, participantCount },
      top_pick:    topPick?.name || null,
      match_label: matchLabel    || null,
      was_fallback: wasFallback  || false,
      session_id:  sessionId,
    });
  } catch { /* silent */ }
}