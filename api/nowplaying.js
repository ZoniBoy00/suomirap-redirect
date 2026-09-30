// Returns current track metadata and on-air show information for Suomirap.

const API_URL = "https://listenapi.planetradio.co.uk/api9.2/events";
const STATION_CODE = "rrf";
const PAGE_URL = "https://www.radioplay.fi/suomirap";
const UPSTREAM_TIMEOUT_MS = 4000;
const SCHEDULE_TTL_MS = 5 * 60 * 1000;
const SCHEDULE_STALE_LIMIT_MS = 60 * 60 * 1000;
const TRACK_STALE_LIMIT_MS = 30 * 60 * 1000;

let pageCache = { html: "", fetchedAt: 0 };
let lastGoodTrack = null;

export function finnishNow(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("fi-FI", {
      timeZone: "Europe/Helsinki",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

export function finnishDateKey(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("fi-FI", {
      timeZone: "Europe/Helsinki",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function offsetDate(dateStr, days) {
  const date = new Date(`${dateStr}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function parseFinnishLocalDateTime(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(
    String(value || ""),
  );
  if (!match) return "";
  const [, year, month, day, hour, minute, second] = match;
  const [y, mo, d, h, mi, s] = [+year, +month, +day, +hour, +minute, +second];
  if (
    y < 1000 ||
    mo < 1 ||
    mo > 12 ||
    d < 1 ||
    d > 31 ||
    h > 23 ||
    mi > 59 ||
    s > 59
  )
    return "";
  const dateCheck = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  if (
    dateCheck.getUTCFullYear() !== y ||
    dateCheck.getUTCMonth() !== mo - 1 ||
    dateCheck.getUTCDate() !== d
  )
    return "";
  const wanted = Date.UTC(y, mo - 1, d, h, mi, s);
  let timestamp = wanted;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Helsinki",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(timestamp))
        .map((part) => [part.type, part.value]),
    );
    const observed = Date.UTC(
      +parts.year,
      +parts.month - 1,
      +parts.day,
      +parts.hour,
      +parts.minute,
      +parts.second,
    );
    const adjustment = wanted - observed;
    timestamp += adjustment;
    if (adjustment === 0) break;
  }
  const result = new Date(timestamp);
  return Number.isNaN(result.getTime()) ? "" : result.toISOString();
}

export function safeHttpsUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !url.hostname ||
      url.username ||
      url.password
    )
      return "";
    return url.href;
  } catch {
    return "";
  }
}

export function pick(html, key) {
  const escapedKey = String(key).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(html).match(
    new RegExp('"' + escapedKey + '"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*")'),
  );
  if (!match) return "";
  try {
    const value = JSON.parse(match[1]);
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}

function extractJsonObject(html, start) {
  if (html[start] !== "{") return "";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < html.length; i++) {
    const char = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) return html.slice(start, i + 1);
  }
  return "";
}

export function currentShow(html, date, now = new Date()) {
  const match = /"schedule"\s*:\s*\{\s*"data"\s*:\s*\{/.exec(String(html));
  if (!match) return null;
  const dataStart = match.index + match[0].length - 1;
  let data;
  try {
    data = JSON.parse(extractJsonObject(String(html), dataStart));
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  let current = null;
  const upcoming = [];
  const days = [date, offsetDate(date, -1), offsetDate(date, 1)];
  for (const day of days) {
    const episodes = data[day];
    if (!Array.isArray(episodes)) continue;
    for (const episode of episodes) {
      const start = new Date(episode.start);
      const duration = Number(episode.duration) || 0;
      if (Number.isNaN(start.getTime()) || duration <= 0) continue;
      const end = new Date(start.getTime() + duration * 1000);
      const entry = {
        title: typeof episode.title === "string" ? episode.title : "",
        image: safeHttpsUrl(episode.image_url),
        startedAt: start.toISOString(),
        until: end.toISOString(),
      };
      if (now >= start && now < end) current = entry;
      else if (start > now && entry.title) upcoming.push(entry);
    }
  }
  upcoming.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const next = upcoming[0] || null;
  if (current) return { ...current, next };
  return next ? { title: "", image: "", startedAt: "", until: "", next } : null;
}

async function fetchPage() {
  const now = Date.now();
  if (pageCache.html && now - pageCache.fetchedAt < SCHEDULE_TTL_MS)
    return pageCache.html;
  try {
    const response = await fetch(PAGE_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; suomirap-player/1.0)",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error("page " + response.status);
    const html = await response.text();
    if (!html || html.length > 2_000_000)
      throw new Error("invalid station page size");
    pageCache = { html, fetchedAt: Date.now() };
    return html;
  } catch (error) {
    if (pageCache.html && now - pageCache.fetchedAt < SCHEDULE_STALE_LIMIT_MS)
      return pageCache.html;
    throw error;
  }
}

export function parseListenEvents(events) {
  if (!Array.isArray(events))
    throw new Error("Listen API returned an invalid event list");
  const validEvents = events.filter((event) => {
    if (!event || typeof event !== "object" || Array.isArray(event))
      return false;
    if (
      !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(
        String(event.nowPlayingTime || ""),
      )
    )
      return false;
    if (
      event.nowPlayingTrack != null &&
      typeof event.nowPlayingTrack !== "string"
    )
      return false;
    if (
      event.nowPlayingArtist != null &&
      typeof event.nowPlayingArtist !== "string"
    )
      return false;
    return Boolean(
      parseFinnishLocalDateTime(event.nowPlayingTime) &&
      (event.nowPlayingTrack || event.nowPlayingArtist),
    );
  });
  if (validEvents.length === 0)
    throw new Error("Listen API returned no valid track event");
  const event = [...validEvents]
    .sort((a, b) => a.nowPlayingTime.localeCompare(b.nowPlayingTime))
    .at(-1);
  const trackStartedAt = parseFinnishLocalDateTime(event.nowPlayingTime);
  if (!trackStartedAt || (!event.nowPlayingTrack && !event.nowPlayingArtist)) {
    throw new Error("Listen API returned no valid track event");
  }
  return {
    track: event.nowPlayingTrack || "",
    artist: event.nowPlayingArtist || "",
    image: safeHttpsUrl(event.nowPlayingSmallImage || event.nowPlayingImage),
    appleMusic: safeHttpsUrl(event.nowPlayingAppleMusicUrl),
    trackStartedAt,
    trackDuration:
      Number(event.nowPlayingDuration) > 0
        ? Number(event.nowPlayingDuration)
        : null,
  };
}

async function fromListenApi() {
  const time = finnishNow();
  const url = `${API_URL}/${encodeURIComponent(STATION_CODE)}/${encodeURIComponent(time)}/5`;
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error("listenapi " + response.status);
  return parseListenEvents(await response.json());
}

export function trackFromPage(html) {
  const track = pick(html, "nowPlayingTrack");
  const artist = pick(html, "nowPlayingArtist");
  if (!track && !artist) return null;
  return {
    track,
    artist,
    image: safeHttpsUrl(
      pick(html, "nowPlayingSmallImage") || pick(html, "nowPlayingImage"),
    ),
    appleMusic: safeHttpsUrl(pick(html, "nowPlayingAppleMusicUrl")),
    trackStartedAt: "",
    trackDuration: null,
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Cache-Control",
    "s-maxage=15, stale-while-revalidate=15, stale-if-error=300",
  );
  const now = new Date();
  const date = finnishDateKey(now);

  const [apiResult, pageResult] = await Promise.allSettled([
    fromListenApi(),
    fetchPage(),
  ]);
  let trackData = apiResult.status === "fulfilled" ? apiResult.value : null;
  let source = trackData ? "listenapi" : "page";
  let show =
    pageResult.status === "fulfilled"
      ? currentShow(pageResult.value, date, now)
      : null;

  if (!trackData && pageResult.status === "fulfilled")
    trackData = trackFromPage(pageResult.value);
  if (trackData) lastGoodTrack = { data: trackData, savedAt: Date.now() };
  let stale = false;
  if (
    !trackData &&
    lastGoodTrack &&
    Date.now() - lastGoodTrack.savedAt < TRACK_STALE_LIMIT_MS
  ) {
    trackData = lastGoodTrack.data;
    source = "stale";
    stale = true;
  }

  if (!trackData) {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: "now-playing unavailable" });
    return;
  }
  res.status(200).json({ ...trackData, source, stale, show });
}
