# Suomirap Radio Redirect

Vercel serverless function that provides a permanently working URL for the
Suomirap (radioplay.fi) live radio stream.

## Why

The Bauer stream server (`live-bauerfi.sharp-stream.com`) validates that the
`aw_0_1st.skey` query parameter is a recent unix timestamp. Without a fresh
` skey` (and a `userConsentV2` consent string) the server serves a
"this channel's distribution has ended" announcement loop instead of music.

The player page on radioplay.fi generates a fresh `skey` in the browser on
every page load — which means a manually copied stream URL stops working.
This project replicates that behavior server-side.

## How it works

1. A player (VLC, ffplay, radio apps, car stereos...) requests
   `https://suomirap-redirect.vercel.app`
2. The function generates a fresh `skey` (current unix timestamp) and builds
   the full stream URL with the static consent string
3. The function responds with `307 Temporary Redirect` to the stream URL
4. The player follows the redirect and plays the stream

The consent string is a static IAB TCF consent encoding and does not expire.

## Usage

Add the URL to any audio player or stream directory:

```
https://suomirap-redirect.vercel.app
```

## Deploy your own

```bash
npm i -g vercel
vercel
```

Or connect this repo to a Vercel project — every push to `main` deploys
automatically.

## API

- `GET /` — 307 redirect to the live stream with a fresh `skey`
- `GET /api/suomirap` — same, without the rewrite
