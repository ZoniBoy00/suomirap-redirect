# Suomirap Radio Redirect

Vercel serverless functions that provide a permanently working URL and a web
player for the Suomirap (radioplay.fi) live radio stream.

## Why

All Bauer stream mounts (`live-bauerfi.sharp-stream.com`,
`streaming.radioplay.fi`) validate that the `aw_0_1st.skey` query parameter
is a recent unix timestamp. Without a fresh `skey` and the `userConsentV2`
consent string the server serves a "this channel's distribution has ended"
announcement loop instead of music.

The player page on radioplay.fi generates a fresh `skey` in the browser on
every page load — which means a manually copied stream URL stops working.
This project replicates that behavior server-side.

## How it works

1. A player (browser, VLC, ffplay, radio apps, car stereos...) requests
   `/api/suomirap`
2. The function generates a fresh `skey` (current unix timestamp) and builds
   the full stream URL with the static consent string
3. The function responds with `307 Temporary Redirect` to the stream URL
4. The player follows the redirect and plays the stream

The consent string is a static IAB TCF consent encoding and does not expire.

The now-playing metadata (`/api/nowplaying`) is read from the station page,
where Bauer server-side renders the current track info. It is therefore as
fresh as Bauer's own data (updates within a few minutes of a track change).

## Usage

Stream URL for any audio player or stream directory:

```
https://suomirap-redirect.vercel.app/api/suomirap
```

Web player with audio-reactive visualizer and now-playing info:

```
https://suomirap-redirect.vercel.app
```

## Endpoints

- `GET /` — web player page (`public/index.html`)
- `GET /api/suomirap` — 307 redirect to the live stream with a fresh `skey`
- `GET /api/nowplaying` — JSON with the current track, artist, cover image
  and music service links

## Deploy your own

```bash
npm i -g vercel
vercel
```

Or connect this repo to a Vercel project — every push to `master` deploys
automatically.
