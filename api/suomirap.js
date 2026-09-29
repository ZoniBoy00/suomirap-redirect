// Redirects to the Suomirap live stream.
// Uses Bauer's own streaming host (streaming.radioplay.fi) which serves the
// raw stream with no AdsWizz pre-roll ads and no token parameters.

const STREAM_URL = "https://streaming.radioplay.fi/fi_suomirap_128.mp3";

export default function handler(req, res) {
  res.statusCode = 307;
  res.setHeader("Location", STREAM_URL);
  res.setHeader("Cache-Control", "no-store");
  res.end();
}
