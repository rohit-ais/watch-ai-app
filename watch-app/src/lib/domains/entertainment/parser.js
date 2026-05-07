// ─── Entertainment Domain: Vibe Parser ───────────────────────────────────────
// Parses natural language vibe text into structured filters.
// Entertainment-specific keyword maps.
// Returns: { mood, genre, time }

// ─── Mood keywords ────────────────────────────────────────────────────────────

const MOOD_KEYWORDS = {
  Fun: [
    "funny", "fun", "laugh", "comedy", "happy", "cheerful",
    "hilarious", "humor", "lighthearted", "adventure", "exciting",
    "animated", "cartoon", "kids", "family", "fantasy",
  ],
  Relax: [
    "tired", "chill", "relax", "calm", "lazy", "easy", "slow",
    "cozy", "peaceful", "quiet", "documental", "documentary",
    "background", "low key", "lowkey", "easy watch", "music",
  ],
  Intense: [
    "action", "intense", "thriller", "suspense", "dark", "serious",
    "crime", "horror", "scary", "war", "mystery", "detective",
    "edge of seat", "gripping", "sci-fi", "science fiction",
    "superhero", "spy", "heist", "violent",
  ],
  Emotional: [
    "emotional", "drama", "romantic", "romance", "love", "sad",
    "cry", "touching", "heartwarming", "feel good", "inspiring",
    "historical", "history", "classic", "western", "moving",
    "bittersweet", "tearjerker", "meaningful",
  ],
};

// ─── Genre keywords ───────────────────────────────────────────────────────────
// Maps keyword → TMDb genre ID
// More specific than mood — direct genre intent detection

const GENRE_KEYWORDS = {
  28:    ["action", "fight", "superhero", "spy", "heist", "combat"],
  12:    ["adventure", "quest", "explore", "journey"],
  16:    ["animation", "animated", "cartoon", "anime"],
  35:    ["comedy", "funny", "humor", "laugh", "hilarious", "comic"],
  80:    ["crime", "mafia", "gangster", "heist", "detective", "murder"],
  99:    ["documentary", "documental", "real story", "true story", "non fiction"],
  18:    ["drama", "dramatic", "emotional", "intense drama"],
  14:    ["fantasy", "magic", "wizard", "dragon", "mythical"],
  27:    ["horror", "scary", "terrifying", "ghost", "monster", "slasher"],
  9648:  ["mystery", "detective", "whodunit", "suspense", "investigation"],
  10749: ["romance", "romantic", "love story", "love", "date night"],
  878:   ["sci-fi", "science fiction", "space", "alien", "future", "robot", "dystopia"],
  53:    ["thriller", "suspense", "psychological", "tense", "gripping"],
  10752: ["war", "military", "battle", "world war", "soldier"],
  37:    ["western", "cowboy", "wild west"],
  10751: ["family", "kids", "children", "wholesome", "all ages"],
};

// ─── Time keywords ────────────────────────────────────────────────────────────

const TIME_KEYWORDS = {
  "20-30": ["short", "quick", "episode", "20 min", "30 min", "brief", "short episode"],
  "1hr":   ["hour", "1hr", "1 hour", "medium", "60 min", "one hour"],
  "2hr+":  ["movie", "long", "2hr", "feature", "full movie", "binge", "film"],
};

// ─── Parser ───────────────────────────────────────────────────────────────────

/**
 * Parse vibe text into structured filters.
 * Genre detection takes priority over mood detection.
 * If genre detected → mood is derived from genre mapping.
 *
 * @param {string} text  - Raw user input
 * @returns {{ mood: string, genre: string|null, time: string }}
 */
export function parseVibe(text) {
  if (!text || !text.trim()) return { mood: "", genre: null, time: "" };

  const lower = text.toLowerCase();
  let mood = "";
  let genre = null;
  let time = "";

  // ── Genre detection (highest priority) ──
  for (const [genreId, keywords] of Object.entries(GENRE_KEYWORDS)) {
    if (keywords.some((k) => lower.includes(k))) {
      genre = genreId; // store as string ID
      break;
    }
  }

  // ── Mood detection ──
  // If genre detected, derive mood from genre
  // Otherwise detect from mood keywords
  if (!genre) {
    for (const [m, keywords] of Object.entries(MOOD_KEYWORDS)) {
      if (keywords.some((k) => lower.includes(k))) {
        mood = m;
        break;
      }
    }
  }

  // ── Time detection ──
  for (const [t, keywords] of Object.entries(TIME_KEYWORDS)) {
    if (keywords.some((k) => lower.includes(k))) {
      time = t;
      break;
    }
  }

  return { mood, genre, time };
}

/**
 * Get display chips for parsed vibe.
 * Shows what the engine detected from the text.
 *
 * @param {{ mood: string, genre: string|null, time: string }} parsed
 * @param {Array} genreList  - From domain config GENRES array
 * @returns {Array<string>} chip labels
 */
export function getParsedChips(parsed, genreList) {
  const chips = [];
  if (parsed.genre) {
    const genreObj = genreList.find((g) => g.id === parseInt(parsed.genre));
    if (genreObj) chips.push(genreObj.label);
  } else if (parsed.mood) {
    chips.push(`${parsed.mood} mood`);
  }
  if (parsed.time) chips.push(parsed.time);
  return chips;
}