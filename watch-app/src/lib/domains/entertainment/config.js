// ─── Entertainment Domain Configuration ─────────────────────────────────────
// All constants, mappings, weights and rules for the entertainment domain.
// Nothing in this file is specific to UI — pure data and rules.

// ─── Moods ───────────────────────────────────────────────────────────────────

export const MOODS = ["Fun", "Relax", "Intense", "Emotional"];

export const MOOD_DISPLAY = {
  Fun:       "😄 Fun",
  Relax:     "😌 Relax",
  Intense:   "🔥 Intense",
  Emotional: "❤️ Emotional",
};

// ─── Genre → Mood mapping ─────────────────────────────────────────────────────
// Maps TMDb genre IDs to mood buckets.
// An item can match multiple moods via its genre list.

export const GENRE_TO_MOOD = {
  // Fun
  35:    "Fun",      // Comedy
  12:    "Fun",      // Adventure
  14:    "Fun",      // Fantasy
  10751: "Fun",      // Family
  16:    "Fun",      // Animation

  // Relax
  99:    "Relax",    // Documentary
  10402: "Relax",    // Music
  10770: "Relax",    // TV Movie
  // 10751 and 16 also map to Relax — handled via multi-mood logic below

  // Intense
  28:    "Intense",  // Action
  80:    "Intense",  // Crime
  53:    "Intense",  // Thriller
  27:    "Intense",  // Horror
  9648:  "Intense",  // Mystery
  878:   "Intense",  // Science Fiction
  10752: "Intense",  // War
  10759: "Intense",  // Action & Adventure (TV)
  10765: "Intense",  // Sci-Fi & Fantasy (TV)
  10768: "Intense",  // War & Politics (TV)

  // Emotional
  18:    "Emotional", // Drama
  10749: "Emotional", // Romance
  36:    "Emotional", // History
  37:    "Emotional", // Western
  10766: "Emotional", // Soap (TV)

  // TV-specific
  10762: "Fun",      // Kids
  10764: "Relax",    // Reality
  10767: "Relax",    // Talk
};

// Genres that map to multiple moods
export const MULTI_MOOD_GENRES = {
  10751: ["Fun", "Relax"],  // Family
  16:    ["Fun", "Relax"],  // Animation
};

// ─── Genres (user-facing filter) ─────────────────────────────────────────────
// These are the genres shown in the UI filter panel.
// genre ID → display label

export const GENRES = [
  { id: 28,    label: "Action"       },
  { id: 12,    label: "Adventure"    },
  { id: 16,    label: "Animation"    },
  { id: 35,    label: "Comedy"       },
  { id: 80,    label: "Crime"        },
  { id: 99,    label: "Documentary"  },
  { id: 18,    label: "Drama"        },
  { id: 14,    label: "Fantasy"      },
  { id: 27,    label: "Horror"       },
  { id: 9648,  label: "Mystery"      },
  { id: 10749, label: "Romance"      },
  { id: 878,   label: "Sci-Fi"       },
  { id: 53,    label: "Thriller"     },
  { id: 10752, label: "War"          },
  { id: 37,    label: "Western"      },
  { id: 10751, label: "Family"       },
];

// ─── Types ───────────────────────────────────────────────────────────────────

export const TYPES = ["Movie", "Series"];

// ─── Platforms ───────────────────────────────────────────────────────────────

export const PLATFORMS = ["Netflix", "Prime", "Disney+", "JioCinema", "Any"];

// ─── Time buckets ────────────────────────────────────────────────────────────

export const TIME_BUCKETS = [
  { value: "20-30", label: "20-30m", maxMins: 35  },
  { value: "1hr",   label: "1 Hr",   maxMins: 75  },
  { value: "2hr+",  label: "2+ Hr",  maxMins: null },
];

export function getTimeBucket(mins) {
  if (!mins) return "2hr+";
  if (mins <= 35) return "20-30";
  if (mins <= 75) return "1hr";
  return "2hr+";
}

// ─── Scoring weights ─────────────────────────────────────────────────────────
// Primary intent scores — what user selected today

export const WEIGHTS = {
  genre:      4,  // genre match (hard if genre selected, soft via mood mapping)
  mood:       3,  // mood match
  time:       2,  // time bucket match

  // Quality boost — silent signals, never override intent
  highRating: 1,  // rating > QUALITY_THRESHOLDS.rating
  highVotes:  1,  // voteCount > QUALITY_THRESHOLDS.votes
  popular:    1,  // popularity > QUALITY_THRESHOLDS.popularity (top 20%)

  // Penalty
  conflict:   2,  // group conflict penalty per mismatched participant
  recent:     1,  // recently shown penalty (applied via seen logic)
};

// ─── Quality thresholds ───────────────────────────────────────────────────────

export const QUALITY_THRESHOLDS = {
  rating:     7.5,   // minimum rating for +1 quality boost
  votes:      10000, // minimum vote count for +1 quality boost
  popularity: 100,   // minimum popularity score for +1 boost (TMDb scale)
};

// ─── Hard filter rules ────────────────────────────────────────────────────────
// Defines which filters are hard blockers (remove item if no match)
// vs soft scored (keep item, just score lower)

export const HARD_FILTER_RULES = {
  type:     true,   // type mismatch → remove
  platform: true,   // platform mismatch → remove (if platform !== "Any")
  genre:    true,   // genre mismatch → remove (if genre explicitly selected)
  mood:     false,  // mood mismatch → score lower, don't remove
  time:     false,  // time mismatch → score lower, don't remove
};

// ─── Trust label thresholds ───────────────────────────────────────────────────
// Maps score percentage to trust label shown on result card

export const TRUST_THRESHOLDS = [
  { min: 100, label: "⚡ Perfect Match"      },
  { min: 75,  label: "👍 Strong Match"       },
  { min: 50,  label: "🙂 Good Match"         },
  { min: 1,   label: "🎲 Best Available"     },
  { min: 0,   label: "🎬 Recommended for you"},
];

// ─── Group conflict threshold ─────────────────────────────────────────────────
// If a participant's match % is below this, apply conflict penalty

export const CONFLICT_THRESHOLD = 0.30; // 30%

// ─── Vague request detection ──────────────────────────────────────────────────
// If no filters selected AND vibe word count <= this → treat as vague request
// Vague = use popularity + rating as primary signal

export const VAGUE_WORD_THRESHOLD = 3;

// ─── Candidate pool size ──────────────────────────────────────────────────────
// How many items to enrich before full scoring

export const CANDIDATE_POOL_SIZE = 20;

// ─── Domain identifier ────────────────────────────────────────────────────────

export const DOMAIN = "entertainment";
// ─── Assembled config object ──────────────────────────────────────────────────
// Passed directly to core engine functions.

export const entertainmentConfig = {
  weights:            WEIGHTS,
  hardFilterRules:    HARD_FILTER_RULES,
  trustThresholds:    TRUST_THRESHOLDS,
  qualityThresholds:  QUALITY_THRESHOLDS,
  conflictThreshold:  CONFLICT_THRESHOLD,
  candidatePoolSize:  CANDIDATE_POOL_SIZE,
  vagueWordThreshold: VAGUE_WORD_THRESHOLD,
  moodGenreMap:       GENRE_TO_MOOD,
};