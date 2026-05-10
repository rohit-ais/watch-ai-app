import {
  mergeFilters,
  majority,
  applyConflictPenalty,
  calcGroupFairness,
} from '../../src/lib/engine/merger.js'

import { fullScore, calcMaxPossible } from '../../src/lib/engine/scorer.js'

const weights = { genre: 4, mood: 3, time: 2, highRating: 1, highVotes: 1, popular: 1, conflict: 2 }
const moodGenreMap = { 28: 'Fun', 18: 'Emotional' }
const filterKeys = ['mood', 'time', 'type', 'platform', 'genre']

// ─── majority ─────────────────────────────────────────────────────────────────

describe('majority', () => {
  test('clear majority — returns winner', () => {
    expect(majority(['Fun', 'Fun', 'Relax'])).toBe('Fun')
  })

  test('empty array — returns empty string', () => {
    expect(majority([])).toBe('')
  })

  test('all empty — returns empty string', () => {
    expect(majority(['', '', ''])).toBe('')
  })

  test('single vote — returns it', () => {
    expect(majority(['Intense'])).toBe('Intense')
  })
})

// ─── mergeFilters ─────────────────────────────────────────────────────────────

describe('mergeFilters', () => {
  test('majority mood wins', () => {
    const participants = [
      { mood: 'Fun', time: '', type: '', platform: '', genre: null },
      { mood: 'Fun', time: '', type: '', platform: '', genre: null },
      { mood: 'Relax', time: '', type: '', platform: '', genre: null },
    ]
    expect(mergeFilters(participants, filterKeys).mood).toBe('Fun')
  })

  test('platform — only set if all agree', () => {
    const participants = [
      { mood: '', time: '', type: '', platform: 'Netflix', genre: null },
      { mood: '', time: '', type: '', platform: 'Netflix', genre: null },
    ]
    expect(mergeFilters(participants, filterKeys).platform).toBe('Netflix')
  })

  test('platform — disagreement returns empty', () => {
    const participants = [
      { mood: '', time: '', type: '', platform: 'Netflix', genre: null },
      { mood: '', time: '', type: '', platform: 'Prime', genre: null },
    ]
    expect(mergeFilters(participants, filterKeys).platform).toBe('')
  })

  test('empty participants — returns empty object', () => {
    expect(mergeFilters([], filterKeys)).toEqual({})
  })
})

// ─── applyConflictPenalty ─────────────────────────────────────────────────────

describe('applyConflictPenalty', () => {
  test('single participant — no penalty applied', () => {
    const items = [{ id: 1, score: 5, genres: [28], time: null, rating: 7, voteCount: 100, popularity: 10 }]
    const participants = [{ mood: 'Fun', genre: null, time: '', type: '', platform: '' }]
    const result = applyConflictPenalty(items, participants, weights, moodGenreMap, 0.3, fullScore, calcMaxPossible)
    expect(result[0].score).toBe(5)
  })

  test('conflicting participant — penalty reduces score', () => {
    const items = [{ id: 1, score: 5, genres: [18], time: null, rating: 6, voteCount: 100, popularity: 10 }]
    const participants = [
      { mood: 'Fun',      genre: null, time: '', type: '', platform: '' },
      { mood: 'Emotional', genre: null, time: '', type: '', platform: '' },
    ]
    const result = applyConflictPenalty(items, participants, weights, moodGenreMap, 0.3, fullScore, calcMaxPossible)
    expect(result[0].score).toBeLessThan(5)
  })
})

// ─── calcGroupFairness ────────────────────────────────────────────────────────

describe('calcGroupFairness', () => {
  test('all satisfied — pct 100', () => {
    const item = { genres: [28], time: null, rating: 6, voteCount: 100, popularity: 10 }
    const participants = [
      { mood: 'Fun', genre: null, time: '', type: '', platform: '' },
      { mood: 'Fun', genre: null, time: '', type: '', platform: '' },
    ]
    const result = calcGroupFairness(item, participants, weights, moodGenreMap, 0.3, fullScore, calcMaxPossible)
    expect(result.pct).toBe(100)
  })

  test('empty participants — returns 0', () => {
    const item = { genres: [28] }
    const result = calcGroupFairness(item, [], weights, moodGenreMap, 0.3, fullScore, calcMaxPossible)
    expect(result.pct).toBe(0)
  })
})