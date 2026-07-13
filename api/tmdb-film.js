// Serverless proxy for TMDB movie details -> taste signal (genre, keywords,
// director, country, year). Keeps TMDB_API_KEY server-side.
const ISO_TO_LABEL = {
  US: "USA", GB: "UK", KR: "South Korea", JP: "Japan", FR: "France", HK: "Hong Kong",
  IT: "Italy", DE: "Germany", CN: "China", IN: "India", TH: "Thailand", DK: "Denmark",
  FI: "Finland", UA: "Ukraine", BR: "Brazil", IR: "Iran", TN: "Tunisia", PS: "Palestine",
  SE: "Sweden", PL: "Poland", CZ: "Czechoslovakia", AT: "Austria", CA: "Canada",
  SU: "Soviet Union", AU: "Australia", MX: "Mexico", ES: "Spain", RU: "Russia", TW: "Taiwan",
};

export default async function handler(req, res) {
  const key = process.env.TMDB_API_KEY;
  const id = (req.query && req.query.id ? String(req.query.id) : "").trim();

  if (!key) {
    return res.status(503).json({ error: "no_key" });
  }
  if (!id) {
    return res.status(400).json({ error: "missing_id" });
  }

  try {
    const url =
      `https://api.themoviedb.org/3/movie/${encodeURIComponent(id)}` +
      `?api_key=${encodeURIComponent(key)}&append_to_response=credits,keywords`;
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(502).json({ error: "upstream" });
    }
    const data = await response.json();

    const director = ((data.credits && data.credits.crew) || []).find((member) => member.job === "Director");
    const firstCountry = (data.production_countries && data.production_countries[0]) || null;
    const iso = firstCountry ? firstCountry.iso_3166_1 : "";
    const country = ISO_TO_LABEL[iso] || (firstCountry ? firstCountry.name : "");

    const film = {
      id: data.id,
      title: data.title || "",
      year: (data.release_date || "").slice(0, 4) || null,
      director: director ? director.name : "",
      country,
      genres: (data.genres || []).map((genre) => genre.name),
      keywords: (((data.keywords || {}).keywords) || [])
        .slice(0, 8)
        .map((keyword) => String(keyword.name || "").toLowerCase()),
    };

    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
    return res.status(200).json({ film });
  } catch (error) {
    return res.status(502).json({ error: "upstream" });
  }
}
