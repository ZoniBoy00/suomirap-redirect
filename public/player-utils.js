(() => {
  function getTrackTiming(
    startedAt,
    durationSeconds,
    nowMs = Date.now(),
    graceSeconds = 15,
  ) {
    const startMs = Date.parse(startedAt);
    if (!Number.isFinite(startMs) || !Number.isFinite(nowMs)) {
      return {
        state: "unknown",
        elapsedSeconds: 0,
        durationSeconds: null,
        remainingSeconds: null,
      };
    }

    const elapsed = Math.max(0, Math.floor((nowMs - startMs) / 1000));
    const duration = Number(durationSeconds);
    const hasDuration = Number.isFinite(duration) && duration > 0;
    const trackDuration = hasDuration ? Math.floor(duration) : null;
    const grace = Number.isFinite(graceSeconds)
      ? Math.max(0, graceSeconds)
      : 15;

    return {
      state:
        hasDuration && elapsed >= trackDuration + grace
          ? "awaiting-next"
          : "playing",
      elapsedSeconds: hasDuration ? Math.min(elapsed, trackDuration) : elapsed,
      durationSeconds: trackDuration,
      remainingSeconds: hasDuration
        ? Math.max(0, trackDuration - elapsed)
        : null,
    };
  }

  function paginateHistory(items, requestedPage, requestedPageSize = 5) {
    const entries = Array.isArray(items) ? items : [];
    const pageSize =
      Number.isInteger(requestedPageSize) && requestedPageSize > 0
        ? requestedPageSize
        : 5;
    const pageCount = Math.max(1, Math.ceil(entries.length / pageSize));
    const page = Math.min(
      Math.max(Number.isInteger(requestedPage) ? requestedPage : 0, 0),
      pageCount - 1,
    );

    return {
      items: entries.slice(page * pageSize, (page + 1) * pageSize),
      page,
      pageCount,
      totalItems: entries.length,
    };
  }

  function parseIcyTrackTitle(value) {
    if (typeof value !== "string") return null;
    const title = value.replace(/\0/g, "").replace(/\s+/g, " ").trim();
    if (!title) return null;

    let splitIndex = -1;
    let separatorLength = 0;
    for (const separator of [" - ", " – ", " — "]) {
      const index = title.lastIndexOf(separator);
      if (index > splitIndex) {
        splitIndex = index;
        separatorLength = separator.length;
      }
    }
    if (splitIndex < 0) return { track: title, artist: "" };

    const track = title.slice(0, splitIndex).trim();
    const artist = title.slice(splitIndex + separatorLength).trim();
    return track && artist ? { track, artist } : { track: title, artist: "" };
  }

  function normalizeTrackLabel(value) {
    return typeof value === "string"
      ? value
          .normalize("NFKD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/\s+/g, " ")
          .trim()
          .toLocaleLowerCase("fi-FI")
      : "";
  }

  function sameTrack(left, right) {
    const leftTrack = normalizeTrackLabel(left?.track);
    const rightTrack = normalizeTrackLabel(right?.track);
    if (!leftTrack || leftTrack !== rightTrack) return false;

    const leftArtist = normalizeTrackLabel(left?.artist);
    const rightArtist = normalizeTrackLabel(right?.artist);
    return !leftArtist || !rightArtist || leftArtist === rightArtist;
  }

  window.RadioPlayerUtils = Object.freeze({
    getTrackTiming,
    paginateHistory,
    parseIcyTrackTitle,
    sameTrack,
  });
})();
