import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/suomirap.js";

function responseStub() {
  const headers = {};
  return {
    headers,
    statusCode: 0,
    body: "",
    setHeader(name, value) {
      headers[name] = value;
    },
    end(body = "") {
      this.body = body;
    },
  };
}

test("stream redirect selects the requested quality and is never cacheable", () => {
  const res = responseStub();
  handler({ query: { q: "128" } }, res);
  assert.equal(res.statusCode, 307);
  assert.match(res.headers.Location, /fi_suomirap_128\.mp3/);
  assert.equal(res.headers["Cache-Control"], "no-store");
});

test("unsupported quality values safely fall back to the default stream", () => {
  const res = responseStub();
  handler({ query: { q: "128junk" } }, res);
  assert.match(res.headers.Location, /fi_suomirap_64\.aac/);
});
