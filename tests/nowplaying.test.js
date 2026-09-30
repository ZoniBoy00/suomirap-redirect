import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  currentShow,
  finnishDateKey,
  offsetDate,
  parseFinnishLocalDateTime,
  parseListenEvents,
  pick,
  safeHttpsUrl,
  trackFromPage,
} from "../api/nowplaying.js";

const listenEvents = JSON.parse(
  await readFile(
    new URL("./fixtures/listenapi-events.json", import.meta.url),
    "utf8",
  ),
);
const stationPage = await readFile(
  new URL("./fixtures/station-page.html", import.meta.url),
  "utf8",
);

test("parses and validates the Listen API fixture and selects the newest track", () => {
  const data = parseListenEvents(listenEvents);
  assert.equal(data.track, 'Testikappale "Kertosäe"');
  assert.equal(data.artist, "Esimerkkiesittäjä");
  assert.equal(data.trackDuration, 214);
  assert.equal(data.trackStartedAt, "2026-09-30T05:36:41.000Z");
  assert.throws(
    () => parseListenEvents([{ nowPlayingTrack: 12 }]),
    /valid track event/i,
  );
  assert.throws(
    () =>
      parseListenEvents([
        { nowPlayingTrack: "Bad date", nowPlayingTime: "2026-99-99 99:99:99" },
      ]),
    /valid track event/i,
  );
});

test("parses page fallback fields and keeps only HTTPS links", () => {
  assert.equal(trackFromPage(stationPage).track, 'Testikappale "Kertosäe"');
  assert.equal(
    trackFromPage(stationPage).appleMusic,
    "https://music.apple.com/fi/album/example/900001",
  );
  assert.equal(
    trackFromPage(
      '<script>{"nowPlayingTrack":"x","nowPlayingAppleMusicUrl":"javascript:alert(1)"}</script>',
    ).appleMusic,
    "",
  );
});

test("returns the next scheduled show with its Helsinki start time", () => {
  const show = currentShow(
    stationPage,
    "2026-09-30",
    new Date("2026-09-30T05:30:00Z"),
  );
  assert.equal(show.title, "SuomiRäpin Aamu: Aleksi Korpijaakko");
  assert.equal(show.next.title, "Päivän ohjelma");
  assert.equal(show.next.startedAt, "2026-09-30T10:00:00.000Z");
});

test("finnishDateKey uses the Helsinki calendar day across UTC midnight", () => {
  assert.equal(finnishDateKey(new Date("2026-10-24T21:30:00Z")), "2026-10-25");
  assert.equal(finnishDateKey(new Date("2026-12-31T22:30:00Z")), "2027-01-01");
});

test("offsetDate changes the requested calendar date without timezone drift", () => {
  assert.equal(offsetDate("2026-10-25", -1), "2026-10-24");
  assert.equal(offsetDate("2026-01-01", -1), "2025-12-31");
  assert.equal(offsetDate("2026-12-31", 1), "2027-01-01");
});

test("currentShow finds a show that started yesterday and crosses Helsinki midnight", () => {
  const html =
    '<script>{"schedule":{"data":{"2026-10-24":[{"start":"2026-10-24T23:30:00+03:00","title":"Yöohjelma","duration":7200}]}}}</script>';
  const now = new Date("2026-10-24T21:30:00Z");
  assert.equal(finnishDateKey(now), "2026-10-25");
  assert.equal(currentShow(html, finnishDateKey(now), now)?.title, "Yöohjelma");
});

test("pick decodes escaped quotes, unicode escapes, and ampersands", () => {
  const html = String.raw`{"nowPlayingTrack":"Suomi \"nyt\" \u00e4 & \u0026"}`;
  assert.equal(pick(html, "nowPlayingTrack"), 'Suomi "nyt" ä & &');
});

test("parseFinnishLocalDateTime resolves timestamps using the Helsinki zone", () => {
  assert.equal(
    parseFinnishLocalDateTime("2026-10-25 00:30:00"),
    "2026-10-24T21:30:00.000Z",
  );
  assert.equal(
    parseFinnishLocalDateTime("2026-12-25 12:00:00"),
    "2026-12-25T10:00:00.000Z",
  );
});

test("safeHttpsUrl only accepts absolute HTTPS URLs", () => {
  assert.equal(
    safeHttpsUrl("https://cdn.example/cover.jpg"),
    "https://cdn.example/cover.jpg",
  );
  assert.equal(safeHttpsUrl("javascript:alert(1)"), "");
  assert.equal(safeHttpsUrl("//cdn.example/cover.jpg"), "");
  assert.equal(safeHttpsUrl("not a URL"), "");
});
