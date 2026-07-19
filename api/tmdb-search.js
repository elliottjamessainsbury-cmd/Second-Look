// Serverless proxy for TMDB movie search. Keeps TMDB_API_KEY server-side.
// Set TMDB_API_KEY in the Vercel project's Environment Variables to activate.
export default async function handler(req, res) {
  const key = process.env.TMDB_API_KEY;
  const query = (req.query && req.query.q ? String(req.query.q) : "").trim();

  if (!key) {
    return res.status(503).json({ error: "no_key", results: [] });
  }
  if (!query) {
    return res.status(200).json({ results: [] });
  }

  try {
    const url =
      "https://api.themoviedb.org/3/search/movie?include_adult=false" +
      `&api_key=${encodeURIComponent(key)}&query=${encodeURIComponent(query)}`;
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(502).json({ error: "upstream", results: [] });
    }
    const data = await response.json();
    const results = (data.results || [])
      .filter((movie) => movie && movie.title)
      .slice(0, 8)
      .map((movie) => ({
        id: movie.id,
        title: movie.title,
        year: (movie.release_date || "").slice(0, 4) || null,
      }));

    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).json({ results });
  } catch (error) {
    return res.status(502).json({ error: "upstream", results: [] });
  }
}
