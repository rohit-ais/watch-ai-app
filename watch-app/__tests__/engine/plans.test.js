// ─── Plans Domain Tests ───────────────────────────────────────────────────────
// Tests for transform, scorer (Plans fields), and filters for Plans domain.

import {
  preScore,
  fullScore,
  calcMaxPossible,
} from '../../src/lib/engine/scorer.js'

import {
  applyHardFilters,
} from '../../src/lib/engine/filters.js'

import {
  transformActivity,
  transformCatalog,
} from '../../src/lib/domains/plans/transform.js'

// ─── Shared test data ─────────────────────────────────────────────────────────

const plansWeights = {
  vibe: 4, groupType: 3, time: 3, budget: 2, location: 2,
  novelty: 1, popularity: 1, conflict: 3,
}

const vibeToTag = {
  Relax:      "relax",
  Fun:        "fun",
  Adventure:  "adventure",
  "Food+Chill": "food-chill",
  "Kids-first": "kids-first",
}

const plansQualityThresholds = { novelty: 2, popularity: 2 }

const plansHardFilterRules = {
  groupType: true,
  time:      true,
  budget:    true,
  location:  false,
  vibe:      false,
}

// Sample catalog items
const sampleActivity = {
  id: 1,
  name: "Board Game Cafe",
  category: "indoor-fun",
  location: "indoor",
  kidsFriendly: true,
  budget: "low",
  timeNeeded: "2-4hr",
  energyLevel: "low",
  groupTypes: ["couple", "friends", "family"],
  vibes: ["fun", "relax"],
  cityType: "metro-tier2",
  weatherSafe: true,
  noveltyScore: 2,
  effortScore: 1,
  popularityScore: 2,
}

const outdoorActivity = {
  id: 2,
  name: "Trek / Hiking Trail",
  category: "friends-group",
  location: "outdoor",
  kidsFriendly: false,
  budget: "low",
  timeNeeded: "half-day",
  energyLevel: "high",
  groupTypes: ["friends"],
  vibes: ["adventure"],
  cityType: "metro-tier2",
  weatherSafe: false,
  noveltyScore: 2,
  effortScore: 3,
  popularityScore: 2,
}

const homeActivity = {
  id: 3,
  name: "Family Board Games Night",
  category: "family-kids",
  location: "home",
  kidsFriendly: true,
  budget: "low",
  timeNeeded: "1-2hr",
  energyLevel: "low",
  groupTypes: ["family"],
  vibes: ["fun", "relax", "kids-first"],
  cityType: "all",
  weatherSafe: true,
  noveltyScore: 1,
  effortScore: 1,
  popularityScore: 3,
}

const metroOnlyActivity = {
  id: 4,
  name: "Ice Skating",
  category: "indoor-fun",
  location: "indoor",
  kidsFriendly: true,
  budget: "medium",
  timeNeeded: "1-2hr",
  energyLevel: "medium",
  groupTypes: ["couple", "friends", "family"],
  vibes: ["fun", "adventure"],
  cityType: "metro-only",
  weatherSafe: true,
  noveltyScore: 3,
  effortScore: 2,
  popularityScore: 2,
}

// ─── transformActivity ────────────────────────────────────────────────────────

describe('transformActivity', () => {
  test('maps name and id correctly', () => {
    const result = transformActivity(sampleActivity)
    expect(result.id).toBe(1)
    expect(result.name).toBe("Board Game Cafe")
  })

  test('type is always Activity', () => {
    const result = transformActivity(sampleActivity)
    expect(result.type).toBe("Activity")
  })

  test('genres is always empty array', () => {
    const result = transformActivity(sampleActivity)
    expect(result.genres).toEqual([])
  })

  test('maps vibes to tags', () => {
    const result = transformActivity(sampleActivity)
    expect(result.tags).toEqual(["fun", "relax"])
  })

  test('maps groupTypes correctly', () => {
    const result = transformActivity(sampleActivity)
    expect(result.groupTypes).toContain("couple")
    expect(result.groupTypes).toContain("friends")
  })

  test('maps timeNeeded to time', () => {
    const result = transformActivity(sampleActivity)
    expect(result.time).toBe("2-4hr")
  })

  test('maps budget correctly', () => {
    const result = transformActivity(sampleActivity)
    expect(result.budget).toBe("low")
  })

  test('home location resolves to indoor', () => {
    const result = transformActivity(homeActivity)
    expect(result.location).toBe("indoor")
  })

  test('outdoor location stays outdoor', () => {
    const result = transformActivity(outdoorActivity)
    expect(result.location).toBe("outdoor")
  })

  test('indoor location stays indoor', () => {
    const result = transformActivity(sampleActivity)
    expect(result.location).toBe("indoor")
  })

  test('preserves noveltyScore', () => {
    const result = transformActivity(sampleActivity)
    expect(result.noveltyScore).toBe(2)
  })

  test('preserves popularityScore', () => {
    const result = transformActivity(sampleActivity)
    expect(result.popularityScore).toBe(2)
  })

  test('metro-only activity excluded for non-metro city', () => {
    const result = transformActivity(metroOnlyActivity, "Pune")
    expect(result).toBeNull()
  })

  test('metro-only activity included for metro city', () => {
    const result = transformActivity(metroOnlyActivity, "Mumbai")
    expect(result).not.toBeNull()
    expect(result.name).toBe("Ice Skating")
  })

  test('cityType all — available in any city', () => {
    const result = transformActivity(homeActivity, "Chandigarh")
    expect(result).not.toBeNull()
  })

  test('no city passed — all activities pass', () => {
    const result = transformActivity(metroOnlyActivity, null)
    expect(result).not.toBeNull()
  })
})

// ─── transformCatalog ─────────────────────────────────────────────────────────

describe('transformCatalog', () => {
  const catalog = [sampleActivity, outdoorActivity, homeActivity, metroOnlyActivity]

  test('filters out null entries for city-excluded activities', () => {
    const result = transformCatalog(catalog, "Pune")
    const names = result.map(i => i.name)
    expect(names).not.toContain("Ice Skating")
  })

  test('includes all items when city allows them', () => {
    const result = transformCatalog(catalog, "Mumbai")
    expect(result.length).toBe(4)
  })

  test('returns array of transformed items', () => {
    const result = transformCatalog(catalog, "Delhi NCR")
    expect(result.every(i => i.type === "Activity")).toBe(true)
  })
})

// ─── preScore — Plans fields ──────────────────────────────────────────────────

describe('preScore — Plans domain', () => {
  test('vibe match — returns vibe weight', () => {
    const item = { tags: ["fun", "relax"], groupTypes: ["couple"] }
    const score = preScore(item, { vibe: "Fun" }, plansWeights, vibeToTag)
    expect(score).toBe(4) // vibe(4)
  })

  test('groupType match — returns groupType weight', () => {
    const item = { tags: [], groupTypes: ["couple", "friends"] }
    const score = preScore(item, { groupType: "couple" }, plansWeights, vibeToTag)
    expect(score).toBe(3) // groupType(3)
  })

  test('vibe + groupType match — returns combined weight', () => {
    const item = { tags: ["fun"], groupTypes: ["friends"] }
    const score = preScore(item, { vibe: "Fun", groupType: "friends" }, plansWeights, vibeToTag)
    expect(score).toBe(7) // vibe(4) + groupType(3)
  })

  test('no match — returns 0', () => {
    const item = { tags: ["relax"], groupTypes: ["family"] }
    const score = preScore(item, { vibe: "Fun", groupType: "couple" }, plansWeights, vibeToTag)
    expect(score).toBe(0)
  })

  test('vibe no match — returns 0 for vibe', () => {
    const item = { tags: ["relax"] }
    const score = preScore(item, { vibe: "Fun" }, plansWeights, vibeToTag)
    expect(score).toBe(0)
  })
})

// ─── fullScore — Plans fields ─────────────────────────────────────────────────

describe('fullScore — Plans domain', () => {
  test('vibe + groupType + time match', () => {
    const item = {
      tags: ["fun"], groupTypes: ["couple"],
      time: "1-2hr", budget: "low", location: "indoor",
      noveltyScore: 1, popularityScore: 1,
    }
    const score = fullScore(
      item,
      { vibe: "Fun", groupType: "couple", time: "1-2hr" },
      plansWeights, vibeToTag, plansQualityThresholds, 0
    )
    expect(score).toBe(10) // vibe(4) + groupType(3) + time(3)
  })

  test('budget match adds budget weight', () => {
    const item = {
      tags: [], groupTypes: [],
      time: null, budget: "low", location: "indoor",
      noveltyScore: 1, popularityScore: 1,
    }
    const score = fullScore(
      item,
      { budget: "low" },
      plansWeights, vibeToTag, plansQualityThresholds, 0
    )
    expect(score).toBe(2) // budget(2)
  })

  test('location match adds location weight', () => {
    const item = {
      tags: [], groupTypes: [],
      time: null, budget: null, location: "indoor",
      noveltyScore: 1, popularityScore: 1,
    }
    const score = fullScore(
      item,
      { location: "indoor" },
      plansWeights, vibeToTag, plansQualityThresholds, 0
    )
    expect(score).toBe(2) // location(2)
  })

  test('location Any — no location score added', () => {
    const item = {
      tags: [], groupTypes: [],
      time: null, budget: null, location: "indoor",
      noveltyScore: 1, popularityScore: 1,
    }
    const score = fullScore(
      item,
      { location: "any" },
      plansWeights, vibeToTag, plansQualityThresholds, 0
    )
    expect(score).toBe(0)
  })

  test('novelty boost — noveltyScore >= threshold adds novelty weight', () => {
    const item = {
      tags: [], groupTypes: [],
      time: null, budget: null, location: null,
      noveltyScore: 2, popularityScore: 1,
    }
    const score = fullScore(
      item, {},
      plansWeights, vibeToTag, plansQualityThresholds, 0
    )
    expect(score).toBe(1) // novelty(1)
  })

  test('popularity boost — popularityScore >= threshold adds popularity weight', () => {
    const item = {
      tags: [], groupTypes: [],
      time: null, budget: null, location: null,
      noveltyScore: 1, popularityScore: 2,
    }
    const score = fullScore(
      item, {},
      plansWeights, vibeToTag, plansQualityThresholds, 0
    )
    expect(score).toBe(1) // popularity(1)
  })

  test('full match — all signals fire', () => {
    const item = {
      tags: ["fun"], groupTypes: ["couple"],
      time: "1-2hr", budget: "low", location: "indoor",
      noveltyScore: 2, popularityScore: 2,
    }
    const score = fullScore(
      item,
      { vibe: "Fun", groupType: "couple", time: "1-2hr", budget: "low", location: "indoor" },
      plansWeights, vibeToTag, plansQualityThresholds, 0
    )
    expect(score).toBe(16) // vibe(4)+groupType(3)+time(3)+budget(2)+location(2)+novelty(1)+popularity(1)
  })
})

// ─── calcMaxPossible — Plans fields ───────────────────────────────────────────

describe('calcMaxPossible — Plans domain', () => {
  test('vibe + groupType + time + budget + location', () => {
    const filters = {
      vibe: "Fun", groupType: "couple",
      time: "1-2hr", budget: "low", location: "indoor"
    }
    expect(calcMaxPossible(filters, plansWeights)).toBe(14)
    // vibe(4) + groupType(3) + time(3) + budget(2) + location(2)
  })

  test('no filters — returns 0', () => {
    expect(calcMaxPossible({}, plansWeights)).toBe(0)
  })

  test('location Any — not counted in max', () => {
    const filters = { location: "any" }
    expect(calcMaxPossible(filters, plansWeights)).toBe(0)
  })

  test('groupType only', () => {
    expect(calcMaxPossible({ groupType: "friends" }, plansWeights)).toBe(3)
  })
})

// ─── applyHardFilters — Plans rules ───────────────────────────────────────────

describe('applyHardFilters — Plans domain', () => {
  const activities = [
    { id: 1, name: "Board Game Cafe", groupTypes: ["couple","friends"], time: "2-4hr", budget: "low",    location: "indoor" },
    { id: 2, name: "Trek",            groupTypes: ["friends"],          time: "half-day", budget: "low", location: "outdoor" },
    { id: 3, name: "Fine Dining",     groupTypes: ["couple"],           time: "1-2hr",    budget: "high", location: "indoor" },
    { id: 4, name: "Water Park",      groupTypes: ["family","friends"], time: "full-day", budget: "medium", location: "outdoor" },
  ]

  test('groupType hard filter — returns only matching group types', () => {
    const result = applyHardFilters(
      activities,
      { groupType: "family" },
      plansHardFilterRules
    )
    expect(result.map(i => i.name)).toEqual(["Water Park"])
  })

  test('budget hard filter — removes high budget when low selected', () => {
    const result = applyHardFilters(
      activities,
      { budget: "low" },
      plansHardFilterRules
    )
    expect(result.map(i => i.name)).not.toContain("Fine Dining")
  })

  test('time hard filter — returns only matching time', () => {
    const result = applyHardFilters(
      activities,
      { time: "1-2hr" },
      plansHardFilterRules
    )
    expect(result.map(i => i.name)).toEqual(["Fine Dining"])
  })

  test('no filters — returns all items', () => {
    const result = applyHardFilters(activities, {}, plansHardFilterRules)
    expect(result.length).toBe(4)
  })

  test('groupType + budget combo', () => {
    const result = applyHardFilters(
      activities,
      { groupType: "couple", budget: "low" },
      plansHardFilterRules
    )
    expect(result.map(i => i.name)).toEqual(["Board Game Cafe"])
  })
})