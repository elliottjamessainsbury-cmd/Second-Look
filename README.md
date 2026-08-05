# **Second Look**

Film discovery for people who've exhausted the obvious recommendations.

**Live:** [https://second-look-delta.vercel.app](https://second-look-delta.vercel.app)

## **Why it exists**

Most recommendation engines optimise for familiarity, so the picks come back generic. They're bad at the specific itch \- so-bad-it's-good classics, meditative black and white, films with stunts that make you sit up, or just something to fill a Sunday afternoon.

Indie films, shorts, forgotten classics and modern films buried by streaming algorithms are all hard to find. And there's nothing quite like turning up a film that becomes one of your personal classics.

## **How it works**

- **Search** runs against the TMDb API, so the searchable range is large. Suggestions also draw on a film's director \- their other work, and films they've recommended themselves.  
- **Editorial weighting** scores films on decade, length, tone, director and cast.  
- **A graph** connects those signals across a curated universe of approved films. It's grown by hand, which is slow and deliberately so \- the depth of that curation is the thing the big engines can't replicate. Community input comes later.  
- **Saving and dismissing** refines your taste over time. Occasionally the app asks why, which gives it far better signal than a binary. Saved films double as a watchlist.  
- **Each recommendation carries AI-generated copy** explaining why it surfaced, alongside links to stream or buy a physical copy.  
- **A combined listings calendar** for London's repertory and arthouse cinemas. As far as I can tell this doesn't exist anywhere else, and it turns discovery into something you can act on this week.

## **The decision that shaped the product**

The obvious way to build this is to let volume do the work \- scrape the big film sites, index everything, rank by similarity. I built the recommendation engine the other way, and that choice defined what the product could credibly promise.

Scraped data is noisy and inconsistent, and site structures shift under you. More importantly, recommendation quality becomes almost impossible to control or debug at that scale. If you can't explain why a film surfaced, you can't fix it when it's wrong \- and every recommendation here ships with a reason attached, so the reasoning has to hold up.

So the engine runs on a structured, curated dataset with editorial weighting on top, enriched from APIs where that adds something. Where the recommendations come from is a decision, not a byproduct of what was easiest to collect.

The trade-off is real. Precision improved and debugging became possible, but the universe of films is smaller and it grows by hand. Which is exactly why accuracy at scale is the current problem rather than a solved one.

## **What's next**

- **Recommendation accuracy at scale.** The scoring holds up well across a curated set; the work now is keeping it honest as that set grows.  
- **Physical media.** A lot of great films aren't streaming, or are out of print entirely. Surfacing where to buy them is the near-term step, and a marketplace is the longer-term ambition \- partly because the alternative for most people is piracy.

## **Stack**

Next.js, TypeScript and Tailwind, deployed on Vercel. Accounts and saved films run on Supabase. Film metadata from the TMDb API. Recommendation scoring, editorial weighting and the curated universe run server-side.

## **How it was built**

Built solo with Claude Code, with Claude and Codex running as review agents over the output rather than just generating it. That review loop is most of the value \- a second and third pass catching what the first one talked itself into. The product decisions, the curation and the calls about what the recommendations are allowed to claim are mine.

## **Status**

Live and in beta.  
