// This endpoint preserves the existing public stream integration. Its fixed TCF value
// is not generated from individual listeners' choices and must not be represented as
// user-specific consent. Review the integration with Bauer before changing its scope.
// Stream quality is allow-listed; redirects must not be cached because skey is time-based.

const QUALITIES = {
  64: { mount: "fi_suomirap_64.aac" },
  128: { mount: "fi_suomirap_128.mp3" },
};
const STREAM_BASE = "https://live-bauerfi.sharp-stream.com";
const CONSENT =
  "CQrTfsAQrTfsAAGABCENCyFsAP_gAEPAAApAJtQIgAAwAKAAyAB4AIAAVAAyAB4AEAALQAZAA0AByAEWAJgAmgBbADmAH4AQAAggBCACgAGiANkAdwA_QCEAERAMUAZwA_YCZAF5gMZAigBNoBFoA4ACgAHgCEAHcAQgAiIBFgCQkAsACoAHgAQQAyADQAJgAfgBsgDuAH6AYoBeYQACAEUdAMAAWABUAEEAMgA0ACYAH4AaIA2QB-gGKATIAvMeABAIiSgCgALACYANkAxQC8yEAQABYAfgB3AGKKQCwAFgAVABBADIANAAmAB-AGiANkAfoBigF5lQAIACi0AEAdwA.IJtQIwAAwAKAAyAB4AIAAVAAyAB4AEAALQAZAA0AByAEWAJgAmgBbADmAH4AQAAggBCACgAGiANkAdwA_QCEAERAIsAYoAzgB-wEyALzAYyBFACbQAAA.YAAAAAAAAAAA";

export default function handler(req, res) {
  const requestedQuality =
    req.query && typeof req.query.q === "string" ? req.query.q : "";
  const quality = Object.hasOwn(QUALITIES, requestedQuality)
    ? Number(requestedQuality)
    : 64;
  const skey = Math.floor(Date.now() / 1000);
  const url =
    `${STREAM_BASE}/${QUALITIES[quality].mount}?direct=true` +
    `&aw_0_1st.playerid=BMUK_inpage_html5` +
    `&aw_0_1st.skey=${skey}` +
    `&aw_0_1st.bauer_loggedin=false` +
    `&aw_0_req.userConsentV2=${CONSENT}`;

  // 307 keeps the request method (some players are picky about GET vs HEAD)
  res.statusCode = 307;
  res.setHeader("Location", url);
  res.setHeader("Cache-Control", "no-store");
  res.end();
}
