import {
  preScore,
  fullScore,
  calcMaxPossible,
  getTrustLabel,
  sortAndShuffle,
  calcPopularityP80,
  getItemMoods,
} from '../../src/lib/engine/scorer.js'

const weights = {
  genre: 4, mood: 3, time: 2,
  highRating: 1, highVotes: 1, popular: 1,
  conflict: 2,
}

const moodGenreMap = { 28: 'Fun', 18: 'Emotional', 27: 'Intense', 35: 'Fun' }

const qualityThresholds = { rating: 7.5, votes: 10000 }

// ─── preScore ─────────────────────────────────────────────────────────────────

describe('preScore', () => {
  test('genre match — returns genre weight', () => {
    const item = { genres: [28] }
    expect(preScore(item, { genre: '28' }, weights, moodGenreMap)).toBe(4)
  })

  test('mood match via genre map — returns mood weight', () => {
    const item = { genres: [28] }
    expect(preScore(item, { mood: 'Fun' }, weights, moodGenreMap)).toBe(3)
  })

  test('no match — returns 0', () => {
    const item = { genres: [18] }
    expect(preScore(item, { mood: 'Fun' }, weights, moodGenreMap)).toBe(0)
  })

  test('genre takes priority over mood', () => {
    const item = { genres: [28] }
    expect(preScore(item, { genre: '28', mood: 'Fun' }, weights, moodGenreMap)).toBe(4)
  })
})

// ─── fullScore ────────────────────────────────────────────────────────────────

describe('fullScore', () => {
  test('genre + time match — returns genre + time weight', () => {
    const item = { genres: [28], time: '2hr+', rating: 6, voteCount: 100, popularity: 10 }
    const score = fullScore(item, { genre: '28', time: '2hr+' }, weights, moodGenreMap, qualityThresholds, 50)
    expect(score).toBe(6) // genre(4) + time(2)
  })

  test('quality boost — high rating adds 1', () => {
    const item = { genres: [28], time: null, rating: 8, voteCount: 100, popularity: 10 }
    const score = fullScore(item, { genre: '28' }, weights, moodGenreMap, qualityThresholds, 50)
    expect(score).toBe(5) // genre(4) + highRating(1)
  })

  test('no filters — only quality boost counts', () => {
    const item = { genres: [28], rating: 8, voteCount: 15000, popularity: 80 }
    const score = fullScore(item, {}, weights, moodGenreMap, qualityThresholds, 50)
    expect(score).toBe(3) // highRating(1) + highVotes(1) + popular(1)
  })
})

// ─── calcMaxPossible ──────────────────────────────────────────────────────────

describe('calcMaxPossible', () => {
  test('genre + time active — returns genre + time weight', () => {
    expect(calcMaxPossible({ genre: '28', time: '2hr+' }, weights)).toBe(6)
  })

  test('mood + time active — returns mood + time weight', () => {
    expect(calcMaxPossible({ mood: 'Fun', time: '1hr' }, weights)).toBe(5)
  })

  test('no filters — returns 0', () => {
    expect(calcMaxPossible({}, weights)).toBe(0)
  })
})

// ─── getTrustLabel ────────────────────────────────────────────────────────────

describe('getTrustLabel', () => {
  const trustThresholds = [
    { min: 80, label: '⚡ Perfect Match' },
    { min: 50, label: '✅ Great Pick' },
    { min: 1,  label: '🎲 Exploratory' },
    { min: 0,  label: '🎬 Recommended' },
  ]

  test('100% match — Perfect Match', () => {
    expect(getTrustLabel(6, 6, trustThresholds)).toBe('⚡ Perfect Match')
  })

  test('50% match — Great Pick', () => {
    expect(getTrustLabel(3, 6, trustThresholds)).toBe('✅ Great Pick')
  })

  test('maxPossible 0 — returns last label', () => {
    expect(getTrustLabel(0, 0, trustThresholds)).toBe('🎬 Recommended')
  })
})

// ─── calcPopularityP80 ────────────────────────────────────────────────────────

describe('calcPopularityP80', () => {
  test('returns 80th percentile value', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ popularity: (i + 1) * 10 }))
    expect(calcPopularityP80(items)).toBe(90)
  })

  test('empty array — returns 0', () => {
    expect(calcPopularityP80([])).toBe(0)
  })
})

// ─── getItemMoods ─────────────────────────────────────────────────────────────

describe('getItemMoods', () => {
  test('returns moods for genre IDs', () => {
    expect(getItemMoods([28, 18], moodGenreMap)).toEqual(['Fun', 'Emotional'])
  })

  test('unknown genre — filtered out', () => {
    expect(getItemMoods([999], moodGenreMap)).toEqual([])
  })

  test('duplicate moods — deduped', () => {
    expect(getItemMoods([28, 35], moodGenreMap)).toEqual(['Fun'])
  })
})