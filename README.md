# Suomirap Radio Redirect

A Vercel-hosted redirect service and web player for the live Suomirap radio stream.

## Features

- Stable stream URL that generates a fresh Bauer `skey` on every request.
- 64 kbps AAC (default) and 128 kbps MP3 stream quality options.
- Web player with now-playing track and artwork, on-air show information, music-service search links, volume control, and an audio visualizer.
- A spinning vinyl record using the current track artwork; the record spins while playback is active.
- Autoplay attempt with a muted fallback, play/pause controls, and automatic stream reconnects.

## Stream URLs

Use either URL in a compatible audio player or directory:

```text
https://suomirap-redirect.vercel.app/api/suomirap
https://suomirap-redirect.vercel.app/api/suomirap?q=64
https://suomirap-redirect.vercel.app/api/suomirap?q=128
```

`q=64` selects 64 kbps AAC. `q=128` selects 128 kbps MP3. If `q` is omitted or unsupported, the endpoint defaults to 64 kbps AAC.

The web player is available at:

```text
https://suomirap-redirect.vercel.app
```

Browsers may block audible autoplay. If playback does not start automatically, use the play button.

## How it works

The stream mounts validate the `aw_0_1st.skey` query parameter. The redirect endpoint generates a current Unix timestamp, adds the stream's consent parameters, and responds with a `307 Temporary Redirect` to the selected Bauer stream mount.

The `/api/nowplaying` endpoint fetches track metadata from Bauer's public Listen API and the station page in parallel. It prefers the Listen API for track and artist details, falls back to the station page when needed, and reads the current on-air show from the station page's embedded schedule. The endpoint uses a short shared cache (`s-maxage=15`, `stale-while-revalidate=30`).

## Endpoints

- `GET /` — web player (`public/index.html`)
- `GET /api/suomirap` — redirects to the 64 kbps AAC stream by default
- `GET /api/suomirap?q=64` — redirects to the 64 kbps AAC stream
- `GET /api/suomirap?q=128` — redirects to the 128 kbps MP3 stream
- `GET /api/nowplaying` — returns JSON track metadata, artwork, Apple Music URL, source, and current show (when available)

## Deploy your own

Install the Vercel CLI and deploy from the repository root:

```bash
npm install --global vercel
vercel
```

Alternatively, import the repository into a Vercel project. If Git-based deployments are enabled and `master` is configured as the production branch, pushes to `master` deploy automatically. Deployment behavior depends on the Vercel project settings; it is not configured by `vercel.json` alone.
