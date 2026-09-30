// Returns current "now playing" metadata for Suomirap.
//
// Primary source: Bauer's public Listen API (the same one the mobile apps
// use). The endpoint is /events/{stationCode}/{time}/{limit} where {time}
// must be an explicit Finnish local timestamp ("YYYY-MM-DD HH:MM:SS").
// The special value "now" resolves to the server's timezone which is ~2h
// behind Finland, so we always build the Finnish time ourselves.
// Events are returned in ascending order -> take the LAST one.
//
// Fallback: scrape the station page HTML (fields are server-side rendered
// there) in case the API is unavailable or the station code changes.

const API_URL = "https://listenapi.planetradio.co.uk/api9.2/events";
const STATION_CODE = "rrf";
const PAGE_URL = "https://www.radioplay.fi/suomirap";

// Current Finnish local time as "YYYY-MM-DD HH:MM:SS"
function finnishNow() {
  const fmt = new Intl.DateTimeFormat("fi-FI", {
    timeZone: "Europe/Helsinki",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const parts = {};
  for (const p of fmt.formatToParts(new Date())) parts[p.type] = p.value;
  // fi-FI may output the hour as "24" right after midnight -> normalize
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day} ${hour}:${parts.minute}:${parts.second}`;
}

function pick(html, key) {
  const m = html.match(new RegExp('"' + key + '"\\s*:\\s*"([^"]*)"'));
  return m ? m[1] : "";
}

async function fromListenApi() {
  const time = finnishNow();
  const url = `${API_URL}/${encodeURIComponent(STATION_CODE)}/${encodeURIComponent(time)}/5`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error("listenapi " + r.status);
  const events = await r.json();
  if (!Array.isArray(events) || events.length === 0) throw new Error("empty events");
  // The API returns events in inconsistent order (ascending or descending
  // depending on the query window), so sort by timestamp ourselves.
  // Timestamps are "YYYY-MM-DD HH:MM:SS" -> lexicographic sort works.
  const sorted = [...events].sort((a, b) =>
    String(a.nowPlayingTime).localeCompare(String(b.nowPlayingTime))
  );
  const e = sorted[sorted.length - 1]; // newest
  if (!e.nowPlayingTrack && !e.nowPlayingArtist) throw new Error("no track in event");
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
    res.status(200).json(data);
  } catch (e) {
    try {
      const data = await fromPage();
      res.status(200).json(data);
    } catch (e2) {
      res.status(502).json({ error: "now-playing unavailable", detail: e2.message });
    }
  }
}
