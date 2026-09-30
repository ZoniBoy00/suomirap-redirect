import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { Script } from "node:vm";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const html = await read("public/index.html");
assert.equal(
  html.charCodeAt(0),
  "<".charCodeAt(0),
  "HTML must be UTF-8 without a BOM",
);
assert.match(html, /<html lang="fi">/);
assert.match(html, /<main\b/);
assert.match(html, /<h1\b/);
assert.match(html, /<noscript\b/);
assert.match(html, /property="og:title"/);
assert.match(html, /property="og:image"/);
assert.match(html, /name="twitter:card"/);
assert.match(html, /rel="canonical"/);
assert.match(html, /rel="icon"/);
assert.doesNotMatch(html, /rel="manifest"|apple-touch-icon/);
assert.doesNotMatch(
  html,
  /<audio[^>]+\ssrc=["']["']/i,
  "audio element must not use an empty src",
);
assert.match(html, /<link rel="stylesheet" href="\/styles\.css"\s*\/?\s*>/);
assert.match(
  html,
  /<script src="\/player-utils\.js" defer><\/script>\s*<script src="\/player\.js" defer><\/script>/,
);
assert.match(html, /id="historyPagination"/);
assert.match(html, /id="historyPrevious"/);
assert.match(html, /id="historyNext"/);
assert.ok(
  html.indexOf('id="historySection"') > html.indexOf('id="volume"'),
  "history must appear after playback controls",
);
assert.ok(
  html.indexOf('id="historySection"') < html.indexOf("<footer"),
  "history must remain above the legal footer",
);

const playerUtils = await read("public/player-utils.js");
new Script(playerUtils, { filename: "public/player-utils.js" });
const playerJs = await read("public/player.js");
new Script(playerJs, { filename: "public/player.js" });

assert.ok(
  playerJs.includes("https://5.61.90.42:8443/stream"),
  "the player must use the HTTPS ICY proxy",
);

const icecastScriptIndex = html.indexOf(
  "icecast-metadata-player-1.17.13.main.min.js",
);
assert.ok(
  icecastScriptIndex >= 0 &&
    icecastScriptIndex < html.indexOf('src="/player-utils.js"'),
  "the ICY player library must load before player utilities",
);

const vercel = JSON.parse(await read("vercel.json"));
const headers = vercel.headers?.flatMap((rule) => rule.headers || []) || [];
for (const name of [
  "Content-Security-Policy",
  "X-Content-Type-Options",
  "Referrer-Policy",
  "Permissions-Policy",
]) {
  assert.ok(
    headers.some((header) => header.key === name),
    `Missing ${name} security header`,
  );
}

const contentSecurityPolicy = headers.find(
  (header) => header.key === "Content-Security-Policy",
)?.value;
assert.ok(
  contentSecurityPolicy?.includes("connect-src 'self' https://5.61.90.42:8443"),
  "CSP must allow the ICY proxy fetch",
);
assert.ok(
  contentSecurityPolicy?.includes(
    "media-src 'self' data: https://5.61.90.42:8443",
  ),
  "CSP must allow proxy audio media",
);

for (const path of [
  "public/styles.css",
  "public/player.js",
  "public/player-utils.js",
  "public/vendor/icecast-metadata-player-1.17.13/build/icecast-metadata-player-1.17.13.main.min.js",
  "public/vendor/icecast-metadata-player-1.17.13/build/icecast-metadata-player-1.17.13.common.min.js",
  "public/vendor/icecast-metadata-player-1.17.13/build/icecast-metadata-player-1.17.13.mediasource.min.js",
  "public/vendor/icecast-metadata-player-1.17.13/build/icecast-metadata-player-1.17.13.mpeg.min.js",
  "public/vendor/icecast-metadata-player-1.17.13/build/icecast-metadata-player-1.17.13.synaudio.min.js",
  "public/vendor/icecast-metadata-player-1.17.13/build/icecast-metadata-player-1.17.13.flac.min.js",
  "public/vendor/icecast-metadata-player-1.17.13/build/icecast-metadata-player-1.17.13.opus.min.js",
  "public/vendor/icecast-metadata-player-1.17.13/build/icecast-metadata-player-1.17.13.vorbis.min.js",
  "vendor/icecast-metadata-player-1.17.13/LICENSE",
  "public/favicon.svg",
  "public/cover-fallback.svg",
  "public/og-image.png",
  "public/screenshot.png",
  "public/robots.txt",
  "public/sitemap.xml",
])
  await access(new URL(`../${path}`, import.meta.url));

console.log(
  "Project checks passed: HTML shell, player JavaScript, security headers, and public assets.",
);
