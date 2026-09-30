import test from "node:test";
import assert from "node:assert/strict";
import health from "../api/health.js";

test("health endpoint returns a no-store liveness response", async () => {
  const headers = {};
  const res = {
    statusCode: 0,
    setHeader(name, value) {
      headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  await health({}, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, "ok");
  assert.equal(headers["Cache-Control"], "no-store");
  assert.equal(typeof res.body.timestamp, "string");
});
