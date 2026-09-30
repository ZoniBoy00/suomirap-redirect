// Redirects to the Suomirap live stream with a freshly generated skey.
// The stream server validates that skey is a recent unix timestamp, so a
// new one is generated on every request. The userConsentV2 string is a
// static IAB TCF consent encoding and does not expire.
// Note: streaming.radioplay.fi MP3 mount serves a "distribution ended"
// loop for some IPs, so we stick to this endpoint.

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

  res.statusCode = 307;
  res.setHeader("Location", url);
  res.setHeader("Cache-Control", "no-store");
  res.end();
}
