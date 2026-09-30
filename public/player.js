(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const player = $("player");
  const card = $("card");
  const playBtn = $("playBtn");
  const bitrateChips = $("bitrateChips");
  const volumeSlider = $("volume");
  const volValue = $("volValue");
  const muteBtn = $("muteBtn");
  const iconVolHigh = muteBtn.querySelector(".icon-vol-high");
  const iconVolLow = muteBtn.querySelector(".icon-vol-low");
  const iconVolMute = muteBtn.querySelector(".icon-vol-mute");
  const npTrack = $("npTrack");
  const npArtist = $("npArtist");
  const npFresh = $("npFresh");
  const metadataStatus = $("metadataStatus");
  const npCover = $("npCover");
  const npActions = $("npActions");
  const onair = $("onair");
  const onairTitle = $("onairTitle");
  const onairNext = $("onairNext");
  const playbackStatus = $("playbackStatus");
  const streamBadge = $("streamBadge");
  const historySection = $("historySection");
  const historyList = $("historyList");
  const historyPagination = $("historyPagination");
  const historyPrevious = $("historyPrevious");
  const historyNext = $("historyNext");
  const historyPageStatus = $("historyPageStatus");
  const shareTrackBtn = $("shareTrackBtn");
  const airplayBtn = $("airplayBtn");

  const STORAGE = {
    get(key) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        /* Storage can be disabled by browser policy. */
      }
    },
  };
  const FALLBACK_COVER = "/cover-fallback.svg";
  const PROXY_STREAM_URL = "https://5.61.90.42:8443/stream";
  const reduceMotion =
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || false;
  const { getTrackTiming, paginateHistory, parseIcyTrackTitle, sameTrack } =
    window.RadioPlayerUtils;
  const HISTORY_PAGE_SIZE = 5;

  let bitrate = Number.parseInt(STORAGE.get("bitrate"), 10);
  if (bitrate !== 64 && bitrate !== 128) bitrate = 64;
  let volumeLevel = Number.parseInt(STORAGE.get("volume"), 10);
  if (!Number.isFinite(volumeLevel) || volumeLevel < 0 || volumeLevel > 100)
    volumeLevel = 80;
  volumeLevel /= 100;
  let lastVolume = volumeLevel > 0 ? volumeLevel : 0.8;
  player.volume = volumeLevel;

  let playing = false;
  let userPaused = false;
  let userStarted = false;
  let autoRetry = false;
  let retryDelay = 1000;
  let retryTimer = null;
  let bufferTimer = null;
  let streamLoadId = 0;
  let streamChanging = false;
  let metadataPlayer = null;
  let streamSyncActive = false;
  let buffering = false;
  let stalledIntervals = 0;
  let lastTime = 0;
  let mutedAutoplayTimer = null;
  let sleepTimer = null;
  let pollTimer = null;
  let audioCtx = null;
  let mediaSource = null;
  let analyser = null;
  let gainNode = null;
  let freqData = null;
  let mediaGraphFailed = false;
  let rafId = null;
  let fallbackPhase = 0;
  let currentTrack = null;
  let currentTrackKey = "";
  let trackStartedAt = "";
  let latestNowPlayingData = null;
  let currentIcyTrack = null;
  let icyTrackStartedAt = "";
  let historyPage = 0;
  const canvas = $("viz");
  const ctx = canvas.getContext("2d");
  const BAR_COUNT = 40;

  function safeHttpsUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" &&
        url.hostname &&
        !url.username &&
        !url.password
        ? url.href
        : "";
    } catch {
      return "";
    }
  }

  function setStatus(message) {
    playbackStatus.textContent = message;
  }

  function updateVolumeUI() {
    const level = Math.max(0, Math.min(1, volumeLevel));
    const pct = Math.round(level * 100);
    const muted = player.muted || level === 0;
    volValue.textContent = `${pct}%`;
    volumeSlider.value = String(pct);
    volumeSlider.setAttribute("aria-valuetext", `${pct} prosenttia`);
    volumeSlider.style.setProperty("--vol", `${pct}%`);
    iconVolHigh.classList.toggle("icon-hidden", muted || level < 0.5);
    iconVolLow.classList.toggle(
      "icon-hidden",
      muted || level >= 0.5 || level === 0,
    );
    iconVolMute.classList.toggle("icon-hidden", !muted);
    muteBtn.setAttribute("aria-pressed", String(muted));
    muteBtn.setAttribute(
      "aria-label",
      muted ? "Poista mykistys" : "Mykistä ääni",
    );
  }

  function updatePlayControl() {
    const shouldShowPause = playing && !player.muted;
    playBtn.setAttribute(
      "aria-label",
      shouldShowPause
        ? "Keskeytä toisto"
        : playing
          ? "Ota ääni käyttöön"
          : "Toista Suomirap-radiota",
    );
    card.classList.toggle("playing", playing);
    streamBadge.textContent = playing ? "LIVE" : "RADIO";
  }

  function updateBitrateUI() {
    bitrateChips.querySelectorAll(".bit-chip").forEach((chip) => {
      const selected = Number.parseInt(chip.dataset.q, 10) === bitrate;
      chip.classList.toggle("active", selected);
      chip.setAttribute("aria-pressed", String(selected));
    });
  }

  function setVolume(value, persist = true) {
    volumeLevel = Math.max(0, Math.min(1, Number(value) || 0));
    if (gainNode && audioCtx) {
      gainNode.gain.setTargetAtTime(volumeLevel, audioCtx.currentTime, 0.015);
      player.volume = 1;
    } else {
      player.volume = volumeLevel;
    }
    if (volumeLevel > 0) lastVolume = volumeLevel;
    if (persist) STORAGE.set("volume", String(Math.round(volumeLevel * 100)));
    updateVolumeUI();
  }

  function initAudioGraph() {
    if (audioCtx || mediaGraphFailed) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      mediaGraphFailed = true;
      return;
    }
    try {
      audioCtx = new AudioContextClass();
      mediaSource = audioCtx.createMediaElementSource(player);
      analyser = audioCtx.createAnalyser();
      gainNode = audioCtx.createGain();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      gainNode.gain.value = volumeLevel;
      mediaSource.connect(analyser);
      analyser.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      freqData = new Uint8Array(analyser.frequencyBinCount);
      player.volume = 1;
    } catch {
      mediaGraphFailed = true;
      analyser = null;
      gainNode = null;
      freqData = null;
      try {
        mediaSource?.disconnect();
      } catch {
        /* Ignore partially built graph cleanup. */
      }
      try {
        mediaSource?.connect(audioCtx.destination);
      } catch {
        /* Native element volume remains available. */
      }
      player.volume = volumeLevel;
    }
  }

  function activateAudioGraphFromGesture() {
    initAudioGraph();
    if (audioCtx?.state === "suspended") audioCtx.resume().catch(() => {});
  }

  function streamUrl() {
    const url = new URL(PROXY_STREAM_URL);
    url.searchParams.set("q", String(bitrate));
    return url.href;
  }

  function stopMetadataPlayer() {
    const active = metadataPlayer;
    metadataPlayer = null;
    streamSyncActive = false;
    if (!active) return null;

    const stopped =
      active.state === "stopped"
        ? Promise.resolve()
        : new Promise((resolve) => {
            const onStopped = () => {
              active.removeEventListener("stopped", onStopped);
              resolve();
            };
            active.addEventListener("stopped", onStopped, { once: true });
            if (active.state === "stopped") onStopped();
          });
    const detached = active.detachAudioElement().catch(() => {});
    return Promise.all([detached, stopped]).then(() => {});
  }

  function releasePlayerAfterStop(loadId) {
    const stopped = stopMetadataPlayer();
    const release = () => {
      if (loadId !== streamLoadId || !userPaused) return;
      player.pause();
      player.removeAttribute("src");
      player.load();
    };
    if (stopped) void stopped.then(release, release);
    else release();
  }

  function startMetadataPlayer(loadId) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(
        () => fail(new Error("Timed out waiting for the stream to start.")),
        20000,
      );
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        callback(value);
      };
      const toError = (message, error) => {
        const result =
          error instanceof Error
            ? error
            : new Error(
                typeof error === "string"
                  ? error
                  : String(message || "ICY stream failed."),
              );
        if (error?.name) result.name = error.name;
        return result;
      };
      const fail = (error) => {
        if (loadId === streamLoadId) streamSyncActive = false;
        finish(reject, error);
      };
      const succeed = () => {
        if (loadId !== streamLoadId || userPaused) {
          fail(
            Object.assign(new Error("Stream start canceled."), {
              name: "AbortError",
            }),
          );
          return;
        }
        streamSyncActive = true;
        finish(resolve, true);
      };
      const reportError = (message, error) => {
        const failure = toError(message, error);
        if (!settled) fail(failure);
        else if (loadId === streamLoadId && !userPaused) {
          streamSyncActive = false;
          streamChanging = true;
          handlePlaybackFailure(failure);
        }
      };

      try {
        const instance = new IcecastMetadataPlayer(streamUrl(), {
          audioElement: player,
          bufferLength: 1,
          metadataTypes: ["icy"],
          retryTimeout: 0,
          onMetadata: (metadata) => {
            if (loadId === streamLoadId) handleIcyMetadata(metadata);
          },
          onPlay: succeed,
          onError: reportError,
          onStop: () => {
            if (loadId !== streamLoadId || userPaused) return;
            streamSyncActive = false;
            if (!settled) {
              fail(new Error("Stream stopped before playback started."));
              return;
            }
            streamChanging = true;
            setPlaying(false);
            setStatus("Striimiyhteys katkesi. Yhdistetään uudelleen…");
            scheduleReconnect();
          },
        });
        metadataPlayer = instance;
        streamSyncActive = true;
        instance
          .play()
          .then(succeed, (error) => fail(toError("Playback failed.", error)));
      } catch (error) {
        fail(toError("Could not create the ICY stream player.", error));
      }
    });
  }

  function connectStream({ userInitiated = false } = {}) {
    if (userInitiated) {
      userPaused = false;
      userStarted = true;
      clearReconnect();
    }
    if (userPaused) return Promise.resolve(false);

    if (
      metadataPlayer &&
      metadataPlayer.state !== "stopped" &&
      metadataPlayer.state !== "stopping"
    ) {
      streamChanging = true;
      buffering = false;
      streamSyncActive = true;
      setStatus("Vaihdetaan striimin laatua…");
      return metadataPlayer
        .switchEndpoint(streamUrl(), { retryTimeout: 0 })
        .then(() => {
          if (userPaused) return false;
          streamChanging = false;
          retryDelay = 1000;
          autoRetry = false;
          setPlaying(true);
          return true;
        })
        .catch((error) => {
          streamChanging = false;
          throw error;
        });
    }

    const loadId = ++streamLoadId;
    streamChanging = true;
    buffering = false;
    setStatus("Yhdistetään Suomirap-radioon…");
    const previous = stopMetadataPlayer();
    const start = () => {
      if (loadId !== streamLoadId || userPaused) return false;
      return startMetadataPlayer(loadId)
        .then(() => {
          if (loadId !== streamLoadId || userPaused) return false;
          streamChanging = false;
          retryDelay = 1000;
          autoRetry = false;
          setPlaying(true);
          return true;
        })
        .catch((error) => {
          if (loadId === streamLoadId) streamChanging = false;
          if (error?.name === "AbortError" || loadId !== streamLoadId)
            return false;
          throw error;
        });
    };
    return previous ? previous.then(start) : start();
  }

  function handleIcyMetadata(metadata) {
    const track = parseIcyTrackTitle(metadata?.StreamTitle);
    if (!track || sameTrack(track, currentIcyTrack)) return;

    currentIcyTrack = track;
    icyTrackStartedAt = new Date().toISOString();
    const apiData =
      latestNowPlayingData && sameTrack(latestNowPlayingData, track)
        ? latestNowPlayingData
        : {};
    renderNowPlaying({
      ...apiData,
      track: track.track,
      artist: track.artist || apiData.artist || "",
      trackStartedAt: icyTrackStartedAt,
    });
  }

  function clearReconnect() {
    if (retryTimer !== null) clearTimeout(retryTimer);
    retryTimer = null;
    autoRetry = false;
  }

  function stopMutedAutoplay(
    message = "Toisto odottaa kuuntelijan toimintaa.",
  ) {
    if (userStarted || !player.muted) return;
    if (mutedAutoplayTimer !== null) clearTimeout(mutedAutoplayTimer);
    mutedAutoplayTimer = null;
    userPaused = true;
    clearReconnect();
    const loadId = ++streamLoadId;
    releasePlayerAfterStop(loadId);
    player.muted = true;
    setPlaying(false);
    setStatus(message);
  }

  function pauseByUser(message = "Toisto keskeytetty.") {
    userPaused = true;
    clearReconnect();
    if (bufferTimer !== null) clearTimeout(bufferTimer);
    bufferTimer = null;
    const loadId = ++streamLoadId;
    streamChanging = false;
    releasePlayerAfterStop(loadId);
    setPlaying(false);
    setStatus(message);
    updateMediaSessionState();
  }

  function scheduleReconnect() {
    if (userPaused || autoRetry) return;
    autoRetry = true;
    retryDelay = Math.max(1000, retryDelay);
    reconnectLoop();
  }

  function reconnectLoop() {
    if (userPaused) {
      clearReconnect();
      return;
    }
    setStatus(
      `Yhteys katkesi — uusi yritys ${Math.ceil(retryDelay / 1000)} s kuluttua.`,
    );
    retryTimer = setTimeout(async () => {
      retryTimer = null;
      if (userPaused) {
        clearReconnect();
        return;
      }
      try {
        const started = await connectStream();
        if (started) {
          clearReconnect();
          return;
        }
      } catch {
        // The next retry uses exponential backoff while errors are visible in the player status.
      }
      if (userPaused) {
        clearReconnect();
        return;
      }
      retryDelay = Math.min(retryDelay * 2, 15000);
      reconnectLoop();
    }, retryDelay);
  }

  function setPlaying(on) {
    playing = on;
    updatePlayControl();
    if (on) {
      buffering = false;
      stalledIntervals = 0;
      lastTime = player.currentTime;
      setStatus("Toistetaan suorana.");
      if (bufferTimer !== null) clearTimeout(bufferTimer);
      bufferTimer = null;
      if (mutedAutoplayTimer !== null) clearTimeout(mutedAutoplayTimer);
      mutedAutoplayTimer = null;
      if (player.muted && !userStarted) {
        showUnmuteBanner();
        mutedAutoplayTimer = setTimeout(
          () =>
            stopMutedAutoplay(
              "Mykistetty automaattitoisto pysäytettiin. Napauta toistaaksesi.",
            ),
          60000,
        );
      }
      startDrawLoop();
    } else {
      stopDrawLoop();
      drawIdle();
    }
    updatePolling();
    updateMediaSessionState();
  }

  function handlePlaybackFailure(error) {
    if (error?.name === "AbortError") return;
    setStatus("Toisto ei käynnistynyt. Tarkista yhteys ja yritä uudelleen.");
    if (error?.name !== "NotAllowedError" && !userPaused) scheduleReconnect();
  }

  function showUnmuteBanner() {
    if (document.getElementById("tapBanner")) return;
    const button = document.createElement("button");
    button.id = "tapBanner";
    button.className = "tap-banner";
    button.type = "button";
    button.setAttribute("role", "status");
    button.setAttribute("aria-live", "polite");
    button.textContent = "Napauta kuullaksesi Suomirapin";
    button.addEventListener(
      "click",
      () => {
        userStarted = true;
        userPaused = false;
        activateAudioGraphFromGesture();
        if (volumeLevel === 0) setVolume(lastVolume || 0.8);
        player.muted = false;
        button.remove();
        updateVolumeUI();
        updatePlayControl();
        if (player.paused) {
          connectStream({ userInitiated: true }).catch(handlePlaybackFailure);
        } else {
          setStatus("Toistetaan suorana.");
        }
      },
      { once: true },
    );
    document.body.appendChild(button);
  }

  function formatClock(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("fi-FI", {
      timeZone: "Europe/Helsinki",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  function updateTrackAge() {
    const timing = getTrackTiming(trackStartedAt, currentTrack?.trackDuration);
    if (timing.state === "unknown") {
      npFresh.textContent = "";
      return;
    }
    const minutes = Math.floor(timing.elapsedSeconds / 60);
    const seconds = String(timing.elapsedSeconds % 60).padStart(2, "0");
    if (timing.state === "awaiting-next") {
      npFresh.textContent = `Keston mukaan valmis (${minutes}:${seconds}) · odotetaan seuraavaa kappaletta`;
      return;
    }
    npFresh.textContent = `Soitossa ${minutes}:${seconds}`;
  }

  setInterval(() => {
    if (!document.hidden) updateTrackAge();
  }, 1000);

  function renderHistory() {
    let items = [];
    try {
      const parsed = JSON.parse(STORAGE.get("trackHistory") || "[]");
      if (Array.isArray(parsed))
        items = parsed
          .filter(
            (item) =>
              item &&
              typeof item.track === "string" &&
              typeof item.artist === "string",
          )
          .slice(0, 8);
    } catch {
      items = [];
    }

    const page = paginateHistory(items, historyPage, HISTORY_PAGE_SIZE);
    historyPage = page.page;
    historyList.replaceChildren();
    historySection.hidden = items.length === 0;
    historyPagination.hidden = page.pageCount <= 1;
    historyPrevious.disabled = page.page === 0;
    historyNext.disabled = page.page >= page.pageCount - 1;
    historyPageStatus.textContent = `Sivu ${page.page + 1} / ${page.pageCount}`;
    historyList.setAttribute(
      "aria-label",
      `Viimeksi soitettujen kappaleiden sivu ${page.page + 1}`,
    );

    for (const item of page.items) {
      const li = document.createElement("li");
      li.className = "history-item";
      const text = document.createElement("span");
      text.textContent = `${item.artist ? `${item.artist} — ` : ""}${item.track}`;
      const link = document.createElement("a");
      link.href = `https://open.spotify.com/search/${encodeURIComponent(`${item.artist} ${item.track}`.trim())}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Hae";
      link.setAttribute(
        "aria-label",
        `Hae kappaletta ${item.track} Spotifyssa`,
      );
      li.append(text, link);
      historyList.append(li);
    }
  }

  historyPrevious.addEventListener("click", () => {
    historyPage--;
    renderHistory();
  });
  historyNext.addEventListener("click", () => {
    historyPage++;
    renderHistory();
  });

  function saveHistory(track, artist) {
    let items = [];
    try {
      const parsed = JSON.parse(STORAGE.get("trackHistory") || "[]");
      if (Array.isArray(parsed)) items = parsed;
    } catch {
      items = [];
    }
    items = items.filter(
      (item) => item.track !== track || item.artist !== artist,
    );
    items.unshift({ track, artist });
    STORAGE.set("trackHistory", JSON.stringify(items.slice(0, 8)));
    historyPage = 0;
    renderHistory();
  }

  function updateMediaSessionState() {
    const mediaSession = navigator.mediaSession;
    if (!mediaSession) return;
    try {
      mediaSession.playbackState =
        playing && !player.paused ? "playing" : "paused";
    } catch {
      /* Unsupported browser state. */
    }
    if (
      playing &&
      player.duration &&
      Number.isFinite(player.duration) &&
      mediaSession.setPositionState
    ) {
      try {
        mediaSession.setPositionState({
          duration: player.duration,
          playbackRate: player.playbackRate,
          position: Math.min(player.currentTime, player.duration),
        });
      } catch {
        /* Live streams may expose unstable duration values. */
      }
    }
  }

  function updateMediaSessionMetadata(data) {
    if (!navigator.mediaSession || !("MediaMetadata" in window)) return;
    const artwork = safeHttpsUrl(data.image);
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: data.track || "Suomirap Radio",
        artist: data.artist || "Suomirap",
        album: "Suomirap Radio",
        artwork: artwork ? [{ src: artwork, sizes: "160x160" }] : [],
      });
    } catch {
      /* Media Session metadata is optional. */
    }
  }

  function setupMediaSession() {
    const session = navigator.mediaSession;
    if (!session?.setActionHandler) return;
    try {
      session.setActionHandler("play", () => {
        userStarted = true;
        userPaused = false;
        activateAudioGraphFromGesture();
        player.muted = false;
        if (volumeLevel === 0) setVolume(lastVolume || 0.8);
        if (player.paused)
          connectStream({ userInitiated: true }).catch(handlePlaybackFailure);
        else updatePlayControl();
      });
      session.setActionHandler("pause", () =>
        pauseByUser("Pysäytetty mediapainikkeella."),
      );
      session.setActionHandler("stop", () => pauseByUser("Toisto pysäytetty."));
    } catch {
      /* Some browsers expose Media Session but support fewer actions. */
    }
  }

  npCover.addEventListener("load", () => npCover.classList.add("art-ready"));
  npCover.addEventListener("error", () => {
    if (npCover.getAttribute("src") !== FALLBACK_COVER) {
      npCover.classList.remove("art-ready");
      npCover.src = FALLBACK_COVER;
    }
  });

  function renderNowPlaying(data) {
    const track = data.track || "Tuntematon kappale";
    const artist = data.artist || "";
    const key = `${artist}\u0000${track}`;
    const changed =
      !currentTrack || !sameTrack(currentTrack, { track, artist });
    currentTrack = {
      track,
      artist,
      image: data.image || "",
      appleMusic: data.appleMusic || "",
      trackDuration:
        Number.isFinite(data.trackDuration) && data.trackDuration > 0
          ? data.trackDuration
          : null,
    };
    if (changed) {
      currentTrackKey = key;
      npTrack.textContent = track;
      npTrack.title = track;
      npArtist.textContent = artist;
      document.title = `${track}${artist ? ` — ${artist}` : ""} | Suomirap Radio`;
      saveHistory(track, artist);
    }
    const cover = safeHttpsUrl(data.image) || FALLBACK_COVER;
    npCover.alt = artist
      ? `Kansikuva: ${track} — ${artist}`
      : `Kansikuva: ${track}`;
    if (npCover.getAttribute("src") !== cover) {
      npCover.classList.remove("art-ready");
      npCover.src = cover;
    }
    trackStartedAt =
      typeof data.trackStartedAt === "string" ? data.trackStartedAt : "";
    updateTrackAge();
    const query = encodeURIComponent(
      `${artist ? `${artist} ` : ""}${track}`.trim(),
    );
    $("lnkSpotify").href = `https://open.spotify.com/search/${query}`;
    $("lnkYoutube").href =
      `https://www.youtube.com/results?search_query=${query}`;
    $("lnkApple").href =
      safeHttpsUrl(data.appleMusic) ||
      `https://music.apple.com/fi/search?term=${query}`;
    npActions.hidden = false;
    updateMediaSessionMetadata(data);
    npFresh.textContent = trackStartedAt ? npFresh.textContent : "";
  }

  function updateNowPlaying(data) {
    latestNowPlayingData = data;
    if (!streamSyncActive) {
      renderNowPlaying(data);
      return;
    }
    if (!currentIcyTrack || !sameTrack(data, currentIcyTrack)) return;
    renderNowPlaying({
      ...data,
      track: currentIcyTrack.track,
      artist: currentIcyTrack.artist || data.artist || "",
      trackStartedAt: icyTrackStartedAt,
    });
  }

  function updateShow(show) {
    const current = show?.title || "";
    const next = show?.next;
    onairTitle.textContent = current;
    onairNext.textContent = next?.title
      ? `Seuraavaksi klo ${formatClock(next.startedAt)}: ${next.title}`
      : "";
    onair.hidden = !current && !next?.title;
  }

  async function fetchNowPlaying() {
    try {
      const response = await fetch("/api/nowplaying", {
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if ((!data.track && !data.artist) || data.error)
        throw new Error("Track metadata missing");
      updateNowPlaying(data);
      updateShow(data.show);
      metadataStatus.textContent = data.stale
        ? "Kappaletiedot näyttävät viimeisimmän onnistuneen päivityksen."
        : "";
    } catch {
      if (!currentTrack) {
        npTrack.textContent = "Kappaletietoa ei saatavilla";
        npTrack.title = npTrack.textContent;
        npArtist.textContent = "";
        npCover.src = FALLBACK_COVER;
        metadataStatus.textContent =
          "Kappaletiedon haku epäonnistui. Yritetään pian uudelleen.";
      } else {
        metadataStatus.textContent =
          "Edellinen kappaletieto näytetään; päivitysyritys jatkuu.";
      }
    }
  }

  function updatePolling() {
    if (pollTimer !== null) clearTimeout(pollTimer);
    pollTimer = null;
    if (document.hidden && !playing) return;
    pollTimer = setTimeout(
      async () => {
        pollTimer = null;
        await fetchNowPlaying();
        updatePolling();
      },
      playing ? 15000 : 60000,
    );
  }

  function drawBars(values) {
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    const gap = 3 * dpr;
    const barWidth = (width - gap * (BAR_COUNT - 1)) / BAR_COUNT;
    let energy = 0;
    for (const value of values) energy += value;
    energy /= BAR_COUNT;
    for (let i = 0; i < BAR_COUNT; i++) {
      const value = Math.min(1, values[i] * 1.3);
      const barHeight = Math.max(3 * dpr, value * height);
      const x = i * (barWidth + gap);
      const gradient = ctx.createLinearGradient(
        0,
        height - barHeight,
        0,
        height,
      );
      gradient.addColorStop(
        0,
        `hsl(${72 + energy * 12}, 78%, ${62 + value * 14}%)`,
      );
      gradient.addColorStop(1, "rgba(215, 243, 106, 0.22)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      const radius = Math.min(barWidth / 2, 3 * dpr);
      if (ctx.roundRect)
        ctx.roundRect(x, height - barHeight, barWidth, barHeight, [
          radius,
          radius,
          0,
          0,
        ]);
      else ctx.rect(x, height - barHeight, barWidth, barHeight);
      ctx.fill();
    }
  }

  function idleBars() {
    return Array.from(
      { length: BAR_COUNT },
      (_, i) => 0.08 + Math.abs(Math.sin(i * 0.38)) * 0.08,
    );
  }

  function readSpectrum() {
    if (!analyser || !freqData) return null;
    analyser.getByteFrequencyData(freqData);
    const values = new Array(BAR_COUNT).fill(0);
    const usable = Math.floor(freqData.length * 0.75);
    for (let i = 0; i < BAR_COUNT; i++) {
      const low = Math.floor(Math.pow(i / BAR_COUNT, 1.6) * usable);
      const high = Math.max(
        low + 1,
        Math.floor(Math.pow((i + 1) / BAR_COUNT, 1.6) * usable),
      );
      let sum = 0;
      for (let j = low; j < high; j++) sum += freqData[j];
      values[i] = sum / (high - low) / 255;
    }
    return values;
  }

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
  }

  function renderFrame() {
    if (!playing || document.hidden) {
      rafId = null;
      return;
    }
    fallbackPhase += 0.05;
    const values =
      readSpectrum() ||
      Array.from(
        { length: BAR_COUNT },
        (_, i) => 0.12 + 0.18 * Math.abs(Math.sin(fallbackPhase + i * 0.4)),
      );
    drawBars(values);
    if (!reduceMotion) rafId = requestAnimationFrame(renderFrame);
    else rafId = null;
  }

  function drawIdle() {
    resizeCanvas();
    drawBars(idleBars());
  }

  function startDrawLoop() {
    if (document.hidden) return;
    if (reduceMotion) {
      renderFrame();
      return;
    }
    if (rafId === null) {
      resizeCanvas();
      rafId = requestAnimationFrame(renderFrame);
    }
  }

  function stopDrawLoop() {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
  }

  bitrateChips.addEventListener("click", (event) => {
    const button = event.target.closest(".bit-chip");
    if (!button) return;
    const next = Number.parseInt(button.dataset.q, 10);
    if (next !== 64 && next !== 128) return;
    if (next === bitrate) return;
    bitrate = next;
    STORAGE.set("bitrate", String(bitrate));
    updateBitrateUI();
    if (!player.paused && !userPaused) {
      userStarted = true;
      clearReconnect();
      activateAudioGraphFromGesture();
      connectStream({ userInitiated: true }).catch(handlePlaybackFailure);
    }
  });

  volumeSlider.addEventListener("input", () => {
    userStarted = true;
    activateAudioGraphFromGesture();
    setVolume(Number(volumeSlider.value) / 100);
    player.muted = volumeLevel === 0;
    updateVolumeUI();
    updatePlayControl();
  });

  muteBtn.addEventListener("click", () => {
    userStarted = true;
    activateAudioGraphFromGesture();
    if (player.muted || volumeLevel === 0) {
      player.muted = false;
      if (volumeLevel === 0) setVolume(lastVolume || 0.8);
    } else player.muted = true;
    updateVolumeUI();
    updatePlayControl();
  });

  playBtn.addEventListener("click", () => {
    userStarted = true;
    activateAudioGraphFromGesture();
    if (player.paused) {
      userPaused = false;
      player.muted = false;
      if (volumeLevel === 0) setVolume(lastVolume || 0.8);
      document.getElementById("tapBanner")?.remove();
      connectStream({ userInitiated: true }).catch(handlePlaybackFailure);
    } else if (player.muted) {
      player.muted = false;
      if (volumeLevel === 0) setVolume(lastVolume || 0.8);
      document.getElementById("tapBanner")?.remove();
      setStatus("Ääni käytössä.");
      updatePlayControl();
    } else {
      pauseByUser();
    }
    updateVolumeUI();
  });

  player.addEventListener("playing", () => {
    streamChanging = false;
    autoRetry = false;
    retryDelay = 1000;
    setPlaying(true);
  });
  player.addEventListener("pause", () => {
    if (!player.hasAttribute("src") || userPaused || streamChanging || !playing)
      return;
    if (player.ended) {
      setPlaying(false);
      setStatus("Striimi päättyi — yhdistetään uudelleen…");
      scheduleReconnect();
      return;
    }
    userPaused = true;
    ++streamLoadId;
    streamSyncActive = false;
    clearReconnect();
    setPlaying(false);
    setStatus("Toisto pysäytetty mediapainikkeella.");
  });
  player.addEventListener("waiting", () => {
    if (!playing || userPaused) return;
    buffering = true;
    setStatus("Puskuroi striimiä…");
    if (bufferTimer !== null) clearTimeout(bufferTimer);
    bufferTimer = setTimeout(() => {
      if (buffering && !userPaused) scheduleReconnect();
    }, 20000);
  });
  player.addEventListener("stalled", () => {
    if (!playing || userPaused) return;
    buffering = true;
    setStatus("Yhteys on hidas — odotetaan striimin jatkumista…");
    if (bufferTimer !== null) clearTimeout(bufferTimer);
    bufferTimer = setTimeout(() => {
      if (buffering && !userPaused) scheduleReconnect();
    }, 20000);
  });
  player.addEventListener("error", () => {
    if (userPaused) return;
    setPlaying(false);
    setStatus("Striimiyhteys katkesi. Yhdistetään uudelleen…");
    scheduleReconnect();
  });
  player.addEventListener("ended", () => {
    if (!userPaused) scheduleReconnect();
  });
  player.addEventListener("timeupdate", updateMediaSessionState);

  setInterval(() => {
    if (!playing || userPaused || buffering || streamChanging || player.paused)
      return;
    if (player.currentTime <= lastTime) stalledIntervals++;
    else stalledIntervals = 0;
    lastTime = player.currentTime;
    if (stalledIntervals >= 2) {
      stalledIntervals = 0;
      setStatus("Äänivirta ei etene — yhdistetään uudelleen…");
      scheduleReconnect();
    }
  }, 5000);

  function attemptAutoplay() {
    connectStream()
      .then((started) => {
        if (started || userPaused) return;
        if (player.paused) return;
      })
      .catch((error) => {
        if (userPaused) return;
        if (error?.name !== "NotAllowedError") {
          scheduleReconnect();
          return;
        }
        player.muted = true;
        updateVolumeUI();
        connectStream()
          .then((started) => {
            if (started) showUnmuteBanner();
          })
          .catch(() => scheduleReconnect());
      });
  }

  $("copyTrackBtn").addEventListener("click", async () => {
    if (!currentTrack) return;
    const text = `${currentTrack.artist ? `${currentTrack.artist} — ` : ""}${currentTrack.track}`;
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Kappaleen nimi kopioitu.");
    } catch {
      setStatus("Leikepöydälle kopiointi ei onnistunut tässä selaimessa.");
    }
  });

  if (navigator.share) {
    shareTrackBtn.hidden = false;
    shareTrackBtn.addEventListener("click", async () => {
      if (!currentTrack) return;
      try {
        await navigator.share({
          title: currentTrack.track,
          text: `${currentTrack.artist} — ${currentTrack.track}`,
          url: location.href,
        });
      } catch (error) {
        if (error?.name !== "AbortError")
          setStatus("Kappaleen jakaminen ei onnistunut.");
      }
    });
  }

  const sleepTimerSelect = $("sleepTimer");
  sleepTimerSelect.addEventListener("change", () => {
    if (sleepTimer !== null) clearTimeout(sleepTimer);
    sleepTimer = null;
    const minutes = Number.parseInt(sleepTimerSelect.value, 10);
    if (minutes > 0) {
      setStatus(`Uniajastin pysäyttää toiston ${minutes} minuutin kuluttua.`);
      sleepTimer = setTimeout(
        () => {
          sleepTimer = null;
          sleepTimerSelect.value = "0";
          pauseByUser("Uniajastin pysäytti toiston.");
        },
        minutes * 60 * 1000,
      );
    }
  });

  if (typeof player.webkitShowPlaybackTargetPicker === "function") {
    airplayBtn.hidden = false;
    airplayBtn.addEventListener("click", () =>
      player.webkitShowPlaybackTargetPicker(),
    );
  }

  window.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
    const target = event.target;
    const editing =
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(target.tagName));
    if (editing) return;
    if (event.code === "Space") {
      event.preventDefault();
      playBtn.click();
    } else if (event.key.toLowerCase() === "m") {
      event.preventDefault();
      muteBtn.click();
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const delta = event.key === "ArrowUp" ? 5 : -5;
      volumeSlider.value = String(
        Math.max(0, Math.min(100, Number(volumeSlider.value) + delta)),
      );
      volumeSlider.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && player.muted && !userStarted) {
      stopMutedAutoplay(
        "Mykistetty taustatoisto pysäytettiin. Palaa sivulle ja käynnistä kuuntelu.",
      );
    }
    if (document.hidden) {
      stopDrawLoop();
      if (!playing && pollTimer !== null) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
    } else {
      if (playing) startDrawLoop();
      fetchNowPlaying();
      updatePolling();
    }
  });
  window.addEventListener("resize", () => {
    resizeCanvas();
    if (!playing) drawIdle();
  });

  updateBitrateUI();
  updateVolumeUI();
  updatePlayControl();
  renderHistory();
  setupMediaSession();
  drawIdle();
  fetchNowPlaying();
  updatePolling();
  attemptAutoplay();
})();
