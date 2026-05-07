// ─── Engine: Seen Tracker ────────────────────────────────────────────────────
// localStorage wrapper for no-repetition logic.
// Session-scoped — different key per domain + session.
// Domain-agnostic — works for any domain.

/**
 * Create a seen tracker for a specific session.
 *
 * @param {string} sessionKey  - Unique key e.g. "entertainment-solo", "entertainment-group-abc123"
 * @returns {Object} tracker with getSeen, addSeen, clearSeen, isExhausted
 */
export function createSeenTracker(sessionKey) {
  const storageKey = `seen-${sessionKey}`;

  return {
    /**
     * Get list of already-seen item names.
     * @returns {Array<string>}
     */
    getSeen() {
      try {
        return JSON.parse(localStorage.getItem(storageKey)) || [];
      } catch {
        return [];
      }
    },

    /**
     * Add item names to seen list.
     * @param {Array<string>} names
     */
    addSeen(names) {
      try {
        const current = this.getSeen();
        const updated = [...new Set([...current, ...names])];
        localStorage.setItem(storageKey, JSON.stringify(updated));
      } catch { /* silent */ }
    },

    /**
     * Clear all seen items for this session.
     */
    clearSeen() {
      try {
        localStorage.removeItem(storageKey);
      } catch { /* silent */ }
    },

    /**
     * Check if the pool is exhausted given a filtered list.
     * Pool is exhausted when filtered list is empty after removing seen items.
     *
     * @param {Array} filteredItems  - Items after hard filters applied
     * @returns {boolean}
     */
    isExhausted(filteredItems) {
      const seen = this.getSeen();
      if (!seen.length) return false;
      const seenSet = new Set(seen);
      return filteredItems.every((item) => seenSet.has(item.name));
    },

    /**
     * Handle pool exhaustion.
     * Clears seen list and returns true if reset was needed.
     *
     * @param {Array} filteredItems
     * @returns {boolean} wasReset
     */
    handleExhaustion(filteredItems) {
      const seen = this.getSeen();
      if (seen.length > 0 && this.isExhausted(filteredItems)) {
        this.clearSeen();
        return true;
      }
      return false;
    },
  };
}

/**
 * Store the timestamp of the last pick.
 * Used for rejection signal detection (Try Again < 5 seconds).
 *
 * @param {string} domain
 */
export function setLastPickTime(domain) {
  try {
    localStorage.setItem(`lastPickTime-${domain}`, Date.now().toString());
  } catch { /* silent */ }
}

/**
 * Get elapsed time since last pick in milliseconds.
 *
 * @param {string} domain
 * @returns {number} elapsed ms, or Infinity if no pick recorded
 */
export function getLastPickElapsed(domain) {
  try {
    const stored = localStorage.getItem(`lastPickTime-${domain}`);
    if (!stored) return Infinity;
    return Date.now() - parseInt(stored);
  } catch {
    return Infinity;
  }
}

/**
 * Check if Try Again was clicked within the rejection threshold.
 * If yes — this is an implicit rejection signal.
 *
 * @param {string} domain
 * @param {number} thresholdMs  - Default 5000ms
 * @returns {boolean}
 */
export function isImplicitRejection(domain, thresholdMs = 5000) {
  return getLastPickElapsed(domain) < thresholdMs;
}