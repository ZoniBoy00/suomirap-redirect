// Returns current "now playing" metadata for Suomirap.
// Scrapes the public station page (Next.js embeds the fields in the HTML)
// and returns a small JSON object.

const PAGE_URL = "https://www.radioplay.fi/suomirap";

function pick(html, key) {
  const m = html.match(new RegExp('"' + key + '"\\s*:\\s*"([^"]*)"'));
  return m ? m[1] : "";
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=20, stale-while-revalidate=60");
  res.setHeader("Access-Control-Allow-Origin", "*");
  try {
    const r = await fetch(PAGE_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; suomirap-player/1.0)" },
      cache: "no-store",
    });
    if (!r.ok) throw new Error("upstream " + r.status);
    const html = await r.text();

    const track = pick(html, "nowPlayingTrack");
    const artist = pick(html, "nowPlayingArtist");
    const time = pick(html, "nowPlayingTime");
    const image = pick(html, "nowPlayingSmallImage") || pick(html, "nowPlayingImage");
    const appleMusic = pick(html, "nowPlayingAppleMusicUrl");

    res.status(200).json({ track, artist, time, image, appleMusic });
  } catch (e) {
    res.status(502).json({ error: "now-playing unavailable", detail: e.message });
  }
}
