import {
  applyHardFilters,
  passesHardFilters,
  applySeenFilter,
  isVagueRequest,
  applyMinScoreFilter,
} from '../../src/lib/engine/filters.js'

const hardFilterRules = { type: true, genre: true, platform: true }

const items = [
  { id: 1, name: 'Movie A', type: 'Movie', genres: [28], platform: 'Netflix' },
  { id: 2, name: 'Series B', type: 'Series', genres: [18], platform: 'Prime' },
  { id: 3, name: 'Movie C', type: 'Movie', genres: [18], platform: 'Prime' },
  { id: 4, name: 'Movie D', type: 'Movie', genres: [28], platform: null },
]

// ─── applyHardFilters ─────────────────────────────────────────────────────────

describe('applyHardFilters', () => {
  test('filters by type — no Series when Movie selected', () => {
    const result = applyHardFilters(items, { type: 'Movie' }, hardFilterRules)
    expect(result.every(i => i.type === 'Movie')).toBe(true)
  })

  test('filters by genre — only items with matching genre ID', () => {
    const result = applyHardFilters(items, { type: 'Movie', genre: '28' }, hardFilterRules)
    expect(result.every(i => i.genres.includes(28))).toBe(true)
  })

  test('platform null items pass — enriched later', () => {
    const result = applyHardFilters(items, { type: 'Movie', platform: 'Netflix' }, hardFilterRules)
    const names = result.map(i => i.name)
    expect(names).toContain('Movie D') // platform null — should pass
  })

  test('platform Any — no platform restriction', () => {
    const result = applyHardFilters(items, { type: 'Movie', platform: 'Any' }, hardFilterRules)
    expect(result.length).toBe(3)
  })

  test('no filters active — returns all items', () => {
    const result = applyHardFilters(items, {}, hardFilterRules)
    expect(result.length).toBe(items.length)
  })

  test('type + genre combo — only matching items', () => {
    const result = applyHardFilters(items, { type: 'Movie', genre: '18' }, hardFilterRules)
    expect(result.map(i => i.name)).toEqual(['Movie C'])
  })
})

// ─── applySeenFilter ──────────────────────────────────────────────────────────

describe('applySeenFilter', () => {
  test('removes seen items by name', () => {
    const result = applySeenFilter(items, ['Movie A', 'Series B'])
    expect(result.map(i => i.name)).not.toContain('Movie A')
    expect(result.map(i => i.name)).not.toContain('Series B')
  })

  test('empty seen list — returns all items', () => {
    expect(applySeenFilter(items, [])).toHaveLength(items.length)
  })

  test('all items seen — returns empty', () => {
    const seen = items.map(i => i.name)
    expect(applySeenFilter(items, seen)).toHaveLength(0)
  })
})

// ─── isVagueRequest ───────────────────────────────────────────────────────────

describe('isVagueRequest', () => {
  test('no filters + short vibe = vague', () => {
    expect(isVagueRequest({}, 'hi', 3)).toBe(true)
  })

  test('has filter = not vague', () => {
    expect(isVagueRequest({ mood: 'Fun' }, '', 3)).toBe(false)
  })

  test('no filters + long vibe = not vague', () => {
    expect(isVagueRequest({}, 'something fun and relaxing tonight', 3)).toBe(false)
  })

  test('empty vibe + no filters = vague', () => {
    expect(isVagueRequest({}, '', 3)).toBe(true)
  })
})

// ─── applyMinScoreFilter ──────────────────────────────────────────────────────

describe('applyMinScoreFilter', () => {
  const scored = [
    { name: 'A', score: 0 },
    { name: 'B', score: 3 },
    { name: 'C', score: 5 },
  ]

  test('removes zero score items when filters active', () => {
    const result = applyMinScoreFilter(scored, 5)
    expect(result.map(i => i.name)).not.toContain('A')
  })

  test('maxPossible 0 — returns all items', () => {
    expect(applyMinScoreFilter(scored, 0)).toHaveLength(3)
  })
})