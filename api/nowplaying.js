// Returns current "now playing" metadata for Suomirap.
//
// Primary source: Bauer's public Listen API (the same one the mobile apps
// use) — near real-time, much fresher than the SSR page. The API timestamps
// are a couple of hours behind Finnish time, so we ignore them for display
// purposes and only care about track/artist/cover.
//
// Fallback: scrape the station page HTML (fields are server-side rendered
// there) in case the API is unavailable or the station code changes.

const API_URL = "https://listenapi.planetradio.co.uk/api9.2/events/rrf/now/1";
const PAGE_URL = "https://www.radioplay.fi/suomirap";

function pick(html, key) {
  const m = html.match(new RegExp('"' + key + '"\\s*:\\s*"([^"]*)"'));
  return m ? m[1] : "";
}

async function fromListenApi() {
  const r = await fetch(API_URL, { cache: "no-store" });
  if (!r.ok) throw new Error("listenapi " + r.status);
  const events = await r.json();
  if (!Array.isArray(events) || events.length === 0) throw new Error("empty events");
  const e = events[0];
  return {
    track: e.nowPlayingTrack || "",
    artist: e.nowPlayingArtist || "",
    image: e.nowPlayingSmallImage || e.nowPlayingImage || "",
    appleMusic: e.nowPlayingAppleMusicUrl || "",
    source: "listenapi",
  };
}

async function fromPage() {
  const r = await fetch(PAGE_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; suomirap-player/1.0)" },
    cache: "no-store",
  });
  if (!r.ok) throw new Error("page " + r.status);
  const html = await r.text();
  return {
    track: pick(html, "nowPlayingTrack"),
    artist: pick(html, "nowPlayingArtist"),
    image: pick(html, "nowPlayingSmallImage") || pick(html, "nowPlayingImage"),
    appleMusic: pick(html, "nowPlayingAppleMusicUrl"),
    source: "page",
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=15, stale-while-revalidate=30");
  try {
    const data = await fromListenApi();
    if (data.track || data.artist) {
      res.status(200).json(data);
      return;
    }
    throw new Error("no track in api response");
  } catch (e) {
    try {
      const data = await fromPage();
      res.status(200).json(data);
    } catch (e2) {
      res.status(502).json({ error: "now-playing unavailable", detail: e2.message });
    }
  }
}
