// ─── TMDb Proxy Route ─────────────────────────────────────────────────────────
// Server-side proxy for all TMDb API calls.
// TMDB_API_KEY never exposed to client — lives in .env.local only.

const ALLOWED_TMDB_PATHS = [
  /^\/movie\/popular$/,
  /^\/movie\/top_rated$/,
  /^\/tv\/popular$/,
  /^\/tv\/top_rated$/,
  /^\/trending\/all\/week$/,
  /^\/discover\/movie$/,
  /^\/discover\/tv$/,
  /^\/movie\/\d+$/,
  /^\/tv\/\d+$/,
  /^\/movie\/\d+\/watch\/providers$/,
  /^\/tv\/\d+\/watch\/providers$/,
];

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");
  if (!path) {
    return Response.json({ error: "Missing path" }, { status: 400 });
  }

  const allowed = ALLOWED_TMDB_PATHS.some((pattern) => pattern.test(path));
  if (!allowed) {
    return Response.json({ error: "Path not allowed" }, { status: 403 });
  }

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "API key not configured" }, { status: 500 });
  }

  // Forward all params except "path" to TMDb
  const forward = new URLSearchParams();
  searchParams.forEach((val, key) => {
    if (key !== "path") forward.append(key, val);
  });
  forward.append("api_key", apiKey);

  const tmdbUrl = `https://api.themoviedb.org/3${path}?${forward.toString()}`;

  try {
    const res = await fetch(tmdbUrl);
    const data = await res.json();
    return Response.json(data);
  } catch {
    return Response.json({ error: "TMDb fetch failed" }, { status: 502 });
  }
}