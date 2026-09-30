# Suomirap API and Stream Integration

This guide describes the production endpoints for the Suomirap website, its metadata API, the legacy Bauer redirect, and the separate VPS audio proxy. These services use two different hosts.

## Hosts at a glance

- **Website and JSON API (Vercel):** `https://suomirap-redirect.vercel.app`
- **ICY audio proxy (VPS):** `https://5.61.90.42:8443`

The VPS host is not a Vercel API host. It exposes `/health` and `/stream`; requests to `/api/*` there return 404.

| Need                            | Endpoint                                                      | Result                     |
| ------------------------------- | ------------------------------------------------------------- | -------------------------- |
| Current track and show metadata | `GET https://suomirap-redirect.vercel.app/api/nowplaying`     | JSON                       |
| Vercel function liveness        | `GET https://suomirap-redirect.vercel.app/api/health`         | JSON                       |
| Legacy 64 kbps audio redirect   | `GET https://suomirap-redirect.vercel.app/api/suomirap?q=64`  | HTTP 307 redirect to Bauer |
| Legacy 128 kbps audio redirect  | `GET https://suomirap-redirect.vercel.app/api/suomirap?q=128` | HTTP 307 redirect to Bauer |
| Proxy liveness                  | `GET https://5.61.90.42:8443/health`                          | JSON                       |
| 64 kbps ICY audio               | `GET https://5.61.90.42:8443/stream?q=64`                     | Audio stream               |
| 128 kbps ICY audio              | `GET https://5.61.90.42:8443/stream?q=128`                    | Audio stream               |

## 1. Public now-playing JSON API

### Request

```http
GET https://suomirap-redirect.vercel.app/api/nowplaying
```

- No API key or login is required.
- The response allows cross-origin browser reads with `Access-Control-Allow-Origin: *`.
- Use this endpoint for metadata, not audio.

Command-line example:

```sh
curl -fsS https://suomirap-redirect.vercel.app/api/nowplaying
```

Browser JavaScript example:

```js
const response = await fetch(
  "https://suomirap-redirect.vercel.app/api/nowplaying",
);
if (!response.ok) {
  throw new Error(`Now-playing request failed: ${response.status}`);
}
const data = await response.json();
console.log(data.track, data.artist, data.image);
```

### Successful response fields

The response is JSON with these fields:

- `track` — track title; may be an empty string if the source omits it.
- `artist` — artist; may be an empty string if the source omits it.
- `image` — validated HTTPS artwork URL, or an empty string.
- `appleMusic` — validated HTTPS Apple Music URL, or an empty string.
- `trackStartedAt` — ISO 8601 timestamp when available from Bauer's Listen API; an empty string when only the station-page fallback supplies the track.
- `trackDuration` — duration in seconds, or `null` when unavailable.
- `source` — `"listenapi"` for the Listen API, `"page"` for the station-page fallback, or `"stale"` for an in-memory last-good track.
- `stale` — boolean; `true` means the last-good track was served because both current sources failed.
- `show` — current/upcoming schedule data, or `null` when it could not be extracted. When present it contains `title`, `image`, `startedAt`, `until`, and `next`; `next` is another show object or `null`. Times are ISO 8601 strings. If only a next show is known, current-show fields can be empty strings.

Treat image, Apple Music, duration, start-time, and show fields as optional data. Check the values before displaying or using them.

### Data sources, freshness, and errors

- The function requests Bauer's Listen API and the public RadioPlay Suomirap page in parallel. It prefers the Listen API for track data, falls back to track data parsed from the page when the Listen API fails, and uses the page response for the show schedule.
- Both upstream requests have four-second timeouts.
- On a successful response, the handler sets shared-cache directives of 15 seconds, 15 seconds of `stale-while-revalidate`, and 300 seconds of `stale-if-error`. Vercel may normalize the browser-visible `Cache-Control` header; the response is not guaranteed to be freshly fetched on every request.
- The station page HTML is cached in a warm function instance for five minutes. If a refresh fails, that instance can use its previous page for up to one hour.
- If both track sources fail, a warm function instance can return its last-good track for up to 30 minutes. This memory is instance-local, not durable, and can disappear on a cold start.
- If no usable current or in-memory track exists, the endpoint returns HTTP `502`, JSON `{ "error": "now-playing unavailable" }`, and `Cache-Control: no-store`.
- No API key or application-level request limiter is implemented in the checked-in handler. Hosting-platform usage limits still apply; avoid unnecessary polling and respect the cache behavior.

This JSON endpoint is separate from each listener's audio connection. Its track timing is best-effort and may not line up exactly with the audio. The Suomirap web player reads ICY metadata from its own audio stream for playback-synchronized track changes.

## 2. Vercel health endpoint

```http
GET https://suomirap-redirect.vercel.app/api/health
```

Returns HTTP `200`, `Cache-Control: no-store`, and JSON with this shape:

```json
{
  "status": "ok",
  "service": "suomirap-radio",
  "timestamp": "<current server time in ISO 8601>"
}
```

This is a liveness response only. It does not contact Bauer or verify that the stream is playable. It is intended for monitoring, not track metadata.

## 3. Legacy Bauer stream redirect

```http
GET https://suomirap-redirect.vercel.app/api/suomirap?q=64
GET https://suomirap-redirect.vercel.app/api/suomirap?q=128
```

- `q=64` selects Bauer's `fi_suomirap_64.aac` stream.
- `q=128` selects Bauer's `fi_suomirap_128.mp3` stream.
- If `q` is absent or unsupported, the handler falls back to `q=64`.
- The response is HTTP `307` with `Cache-Control: no-store`; a client must follow the redirect to receive audio. The target URL contains a time-based `skey`, so do not cache the redirect.
- This route redirects directly to Bauer; it does not pass audio through the VPS proxy or its monthly relay cap. The current web player does not use this route.
- This is a legacy integration, not a stable third-party API contract. The handler does not return JSON and does not set `Access-Control-Allow-Origin`; browser `fetch()` from other origins is therefore not a supported way to consume it. Browser media-element and upstream behavior can vary; test the intended client instead of assuming cross-origin playback.
- The redirect includes a fixed `userConsentV2` value. It is not collected from the current listener and must never be represented as that listener's individual consent. Do not treat this route as a consent solution for another application.

A native or server-side HTTP client that follows `307` may be able to play the resulting Bauer URL, subject to Bauer's availability and terms. For third-party browser applications, this legacy route is not guaranteed to work.

## 4. VPS ICY stream proxy

The proxy's production base URL is `https://5.61.90.42:8443`. It exposes only `/health` and `/stream`; it does not host `/api/nowplaying`, `/api/health`, or `/api/suomirap`.

### Liveness

```http
GET https://5.61.90.42:8443/health
```

Returns HTTP `200`, `Cache-Control: no-store`, and `{ "ok": true }`. This route does not require an `Origin` header.

### Audio

```http
GET https://5.61.90.42:8443/stream?q=64
GET https://5.61.90.42:8443/stream?q=128
```

- `q=64` returns the 64 kbps AAC ICY stream (`Content-Type: audio/aac`).
- `q=128` returns the 128 kbps MP3 ICY stream (`Content-Type: audio/mpeg`).
- Unsupported or absent `q` falls back to 64 kbps AAC.
- The proxy requests `Icy-MetaData: 1` upstream and relays ICY metadata with the audio. The browser player reads metadata from this same connection.
- Successful responses are not cacheable and expose ICY headers such as `Icy-MetaInt` to the allowed browser origin.

### Origin and CORS behavior

The production systemd configuration allows only this browser origin:

```text
https://suomirap-redirect.vercel.app
```

A request to `/stream` without that allowed `Origin` receives HTTP `403` with `Origin not allowed.` This is why opening the stream URL directly in an address bar fails: that navigation does not send the player's allowed origin. Requests from the Suomirap page include the correct origin and are accepted. The proxy's `OPTIONS` preflight permits `GET` and the `Icy-MetaData` and `Range` request headers.

The `Origin` check is a browser/CORS gate, not user authentication. The production service is configured for the Suomirap player, not as a general-purpose third-party audio API. Other browser origins are rejected unless the deployed allowlist is deliberately changed.

### Production safety limits

- At most 8 concurrent streams.
- A monthly relay cap of 800,000,000,000 bytes, counting bytes received from the upstream and forwarded to listeners; it resets on the UTC calendar-month boundary.
- Stream usage is persisted on the VPS. Vercel API usage and the legacy redirect do not use this VPS stream counter.
- Unknown paths return HTTP `404`; a disallowed origin returns `403`; unsupported methods on `/stream` return `405`; capacity or monthly-cap exhaustion returns `503`. Connection/setup failures may return `502`, while non-2xx statuses received from the upstream are passed through. A failure after audio headers have been sent can end the stream early.

## Which endpoint should an app use?

- **Track/show metadata in a browser or service:** `/api/nowplaying` on the Vercel hostname.
- **Health monitoring:** `/api/health` on Vercel, or `/health` on the VPS if checking the proxy itself.
- **Audio inside the existing Suomirap player:** `/stream` on the VPS; its browser origin is restricted to the Suomirap site.
- **Legacy direct Bauer redirect:** `/api/suomirap?q=64|128` on Vercel. It is not JSON, not used by the current web player, and has the fixed-consent and cross-origin limitations above.

The repository's MIT license applies only to its original code. Bauer/RadioPlay retains rights to the stream, artwork, and metadata; third-party applications must obtain any required permissions and handle their own consent obligations.
