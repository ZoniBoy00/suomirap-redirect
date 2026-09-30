// Returns current "now playing" metadata for Suomirap.
// Bauer embeds the fields into the station page HTML (server-side rendered
// and revalidated every few minutes), so we read them from there and expose
// them as a small JSON endpoint.

const PAGE_URL = "https://www.radioplay.fi/suomirap";

function pick(html, key) {
  const m = html.match(new RegExp('"' + key + '"\\s*:\\s*"([^"]*)"'));
  return m ? m[1] : "";
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=20, stale-while-revalidate=30");
  try {
    const r = await fetch(PAGE_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; suomirap-player/1.0)" },
      cache: "no-store",
    });
    if (!r.ok) throw new Error("upstream " + r.status);
    const html = await r.text();

    res.status(200).json({
      track: pick(html, "nowPlayingTrack"),
      artist: pick(html, "nowPlayingArtist"),
      time: pick(html, "nowPlayingTime"),
      image: pick(html, "nowPlayingSmallImage") || pick(html, "nowPlayingImage"),
      appleMusic: pick(html, "nowPlayingAppleMusicUrl"),
    });
  } catch (e) {
    res.status(502).json({ error: "now-playing unavailable", detail: e.message });
  }
}
