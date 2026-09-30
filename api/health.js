export default function handler(_req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(200).json({
    status: "ok",
    service: "suomirap-radio",
    timestamp: new Date().toISOString(),
  });
}
