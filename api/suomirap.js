// Redirects to the Suomirap live stream with a freshly generated skey.
//
// All Bauer stream mounts (sharp-stream.com and streaming.radioplay.fi)
// validate that the aw_0_1st.skey query parameter is a recent unix timestamp.
// Without a fresh skey and the userConsentV2 consent string the server
// serves a "distribution ended" announcement loop instead of the program.
// The skey is generated client-side by the radioplay.fi player on every page
// load, so we replicate that here on every request. The userConsentV2 string
// is a static IAB TCF consent encoding and does not expire.

const STREAM_BASE = "https://live-bauerfi.sharp-stream.com/fi_suomirap_64.aac";
const CONSENT =
  "CQrTfsAQrTfsAAGABCENCyFsAP_gAEPAAApAJtQIgAAwAKAAyAB4AIAAVAAyAB4AEAALQAZAA0AByAEWAJgAmgBbADmAH4AQAAggBCACgAGiANkAdwA_QCEAERAMUAZwA_YCZAF5gMZAigBNoBFoA4ACgAHgCEAHcAQgAiIBFgCQkAsACoAHgAQQAyADQAJgAfgBsgDuAH6AYoBeYQACAEUdAMAAWABUAEEAMgA0ACYAH4AaIA2QB-gGKATIAvMeABAIiSgCgALACYANkAxQC8yEAQABYAfgB3AGKKQCwAFgAVABBADIANAAmAB-AGiANkAfoBigF5lQAIACi0AEAdwA.IJtQIwAAwAKAAyAB4AIAAVAAyAB4AEAALQAZAA0AByAEWAJgAmgBbADmAH4AQAAggBCACgAGiANkAdwA_QCEAERAIsAYoAzgB-wEyALzAYyBFACbQAAA.YAAAAAAAAAAA";

export default function handler(req, res) {
  const skey = Math.floor(Date.now() / 1000);
  const url =
    `${STREAM_BASE}?direct=true` +
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
