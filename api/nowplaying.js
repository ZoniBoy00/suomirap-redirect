// Returns current "now playing" metadata + on-air show for Suomirap.
//
// Track: Bauer's public Listen API (same source as the mobile apps) is near
// real-time. The endpoint is /events/{stationCode}/{time}/{limit} where
// {time} must be an explicit Finnish local timestamp ("YYYY-MM-DD HH:MM:SS")
// — the special value "now" resolves to the server's timezone which is ~2h
// behind Finland. Events come back in inconsistent order, so we sort by
// timestamp and take the newest.
//
// Show: the station page server-side renders today's schedule
// ("schedule":{"data":{"YYYY-MM-DD":[{start,title,duration,...}]}}). We find
// the episode whose time window covers "now" and report it as on-air.
//
// Fallback for the track: the same page also embeds nowPlaying* fields.

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
  const hour = parts.hour === "24" ? "00" : parts.hour; // fi-FI quirk
  return `${parts.year}-${parts.month}-${parts.day} ${hour}:${parts.minute}:${parts.second}`;
}

// Finnish "now" as a Date and its date key "YYYY-MM-DD" (schedule lookup)
function finnishDateParts() {
  const nowStr = finnishNow(); // "YYYY-MM-DD HH:MM:SS"
  const [date, time] = nowStr.split(" ");
  // Page schedule timestamps carry +03:00; parse our string in the same zone
  const asDate = new Date(`${date}T${time}+03:00`);
  return { date, asDate, nowStr };
}

function pick(html, key) {
  const m = html.match(new RegExp('"' + key + '"\\s*:\\s*"([^"]*)"'));
  return m ? m[1] : "";
}

// Extract the balanced "schedule":{"data":{...}} object from the HTML and
// return the episode covering "now", or null.
function currentShow(html, date, asDate) {
  const key = '"schedule":{"data":';
  const i = html.indexOf(key);
  if (i < 0) return null;
  // Walk to the matching closing brace of the schedule object
  let depth = 0, end = -1;
  for (let j = i + '"schedule":'.length; j < html.length; j++) {
    if (html[j] === "{") depth++;
    else if (html[j] === "}") { depth--; if (depth === 0) { end = j + 1; break; } }
  }
  if (end < 0) return null;
  let data;
  try {
    data = JSON.parse(html.slice(i + '"schedule":'.length, end)).data;
  } catch (e) {
    return null;
  }
  // Check today and yesterday (covers shows spanning midnight)
  for (const day of [date, offsetDate(date, -1)]) {
    const episodes = data[day];
    if (!Array.isArray(episodes)) continue;
    for (const ep of episodes) {
      const start = new Date(ep.start);
      const endT = new Date(start.getTime() + (ep.duration || 0) * 1000);
      if (asDate >= start && asDate < endT) {
        return { title: ep.title || "", image: ep.image_url || "", until: endT.toISOString() };
      }
    }
  }
  return null;
}

function offsetDate(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00+03:00");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function fetchPage() {
  const r = await fetch(PAGE_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; suomirap-player/1.0)" },
    cache: "no-store",
  });
  if (!r.ok) throw new Error("page " + r.status);
  return r.text();
}

async function fromListenApi() {
  const time = finnishNow();
  const url = `${API_URL}/${encodeURIComponent(STATION_CODE)}/${encodeURIComponent(time)}/5`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error("listenapi " + r.status);
  const events = await r.json();
  if (!Array.isArray(events) || events.length === 0) throw new Error("empty events");
  // The API returns events in inconsistent order -> sort by timestamp.
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
  };
}

function trackFromPage(html) {
  return {
    track: pick(html, "nowPlayingTrack"),
    artist: pick(html, "nowPlayingArtist"),
    image: pick(html, "nowPlayingSmallImage") || pick(html, "nowPlayingImage"),
    appleMusic: pick(html, "nowPlayingAppleMusicUrl"),
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=15, stale-while-revalidate=30");
  const { date, asDate } = finnishDateParts();

  const [apiResult, pageResult] = await Promise.allSettled([
    fromListenApi(),
    fetchPage(),
  ]);

  // Track: prefer the (fresher) Listen API, fall back to the page
  let trackData = null;
  if (apiResult.status === "fulfilled") trackData = apiResult.value;
  else if (pageResult.status === "fulfilled") trackData = trackFromPage(pageResult.value);

  // Show: always from the page's embedded schedule
  let show = null;
  if (pageResult.status === "fulfilled") {
    show = currentShow(pageResult.value, date, asDate);
  }

  if (!trackData) {
    res.status(502).json({ error: "now-playing unavailable" });
    return;
  }
  res.status(200).json({ ...trackData, source: apiResult.status === "fulfilled" ? "listenapi" : "page", show });
}
