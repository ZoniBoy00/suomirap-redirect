import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const source = await readFile(
  new URL("../public/player-utils.js", import.meta.url),
  "utf8",
);
const window = {};
runInNewContext(source, { window });
const { getTrackTiming, paginateHistory, parseIcyTrackTitle, sameTrack } =
  window.RadioPlayerUtils;

test("parses track-first ICY titles and strips padding and null bytes", () => {
  const parsed = parseIcyTrackTitle("  Mehu – Tippa\u0000  ");
  assert.deepEqual({ ...parsed }, { track: "Mehu", artist: "Tippa" });
  assert.deepEqual(
    { ...parseIcyTrackTitle("No separator\u0000") },
    {
      track: "No separator",
      artist: "",
    },
  );
  assert.equal(parseIcyTrackTitle("  "), null);
  assert.equal(parseIcyTrackTitle(null), null);
});

test("matches ICY and API track labels case- and accent-insensitively", () => {
  assert.equal(
    sameTrack(
      { track: "Räppiä", artist: "JVG" },
      { track: "Rappia", artist: "jvg" },
    ),
    true,
  );
  assert.equal(
    sameTrack(
      { track: "Same song", artist: "Different artist" },
      { track: "Same song", artist: "Another artist" },
    ),
    false,
  );
  assert.equal(sameTrack({ track: "" }, { track: "" }), false);
});

test("caps elapsed time at the reported track duration and marks the next-track wait", () => {
  const start = Date.parse("2026-09-30T10:00:00Z");
  const beforeEnd = getTrackTiming(
    "2026-09-30T10:00:00Z",
    216,
    start + 215_000,
  );
  assert.equal(beforeEnd.state, "playing");
  assert.equal(beforeEnd.elapsedSeconds, 215);
  assert.equal(beforeEnd.remainingSeconds, 1);

  const afterGrace = getTrackTiming(
    "2026-09-30T10:00:00Z",
    216,
    start + 231_000,
  );
  assert.equal(afterGrace.state, "awaiting-next");
  assert.equal(afterGrace.elapsedSeconds, 216);
  assert.equal(afterGrace.remainingSeconds, 0);
});

test("keeps counting when duration is unavailable and rejects an invalid start time", () => {
  const running = getTrackTiming(
    "2026-09-30T10:00:00Z",
    null,
    Date.parse("2026-09-30T10:04:09Z"),
  );
  assert.equal(running.state, "playing");
  assert.equal(running.elapsedSeconds, 249);
  assert.equal(running.durationSeconds, null);
  assert.equal(running.remainingSeconds, null);

  assert.equal(getTrackTiming("not-a-time", 180).state, "unknown");
});

test("splits history into five-item pages without losing the remaining entries", () => {
  const entries = Array.from({ length: 8 }, (_, index) => index + 1);
  const first = paginateHistory(entries, 0, 5);
  assert.deepEqual(Array.from(first.items), [1, 2, 3, 4, 5]);
  assert.equal(first.page, 0);
  assert.equal(first.pageCount, 2);
  assert.equal(first.totalItems, 8);

  const second = paginateHistory(entries, 1, 5);
  assert.deepEqual(Array.from(second.items), [6, 7, 8]);
  assert.equal(second.page, 1);
  assert.equal(second.pageCount, 2);
});

test("clamps invalid history pages and handles an empty history", () => {
  const entries = ["a", "b", "c"];
  const pastEnd = paginateHistory(entries, 8, 2);
  assert.equal(pastEnd.page, 1);
  assert.deepEqual(Array.from(pastEnd.items), ["c"]);

  const beforeStart = paginateHistory(entries, -4, 2);
  assert.equal(beforeStart.page, 0);
  assert.deepEqual(Array.from(beforeStart.items), ["a", "b"]);

  const empty = paginateHistory([], 0, 5);
  assert.equal(empty.page, 0);
  assert.equal(empty.pageCount, 1);
  assert.deepEqual(Array.from(empty.items), []);
});
