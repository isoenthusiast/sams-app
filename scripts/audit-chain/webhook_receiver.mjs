// Local webhook receiver for the SAMS-015 outbound digest test.
// Records every { path, headers, body } request to /tmp/ac-webhook.jsonl.
import http from "node:http";
import fs from "node:fs";

const PORT = Number(process.env.PORT || 3999);
const LOG = "/tmp/ac-webhook.jsonl";

const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const rec = { method: req.method, path: req.url, body: raw, at: new Date().toISOString() };
    fs.appendFileSync(LOG, JSON.stringify(rec) + "\n");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
});

server.listen(PORT, () => console.log(`webhook receiver on :${PORT} → ${LOG}`));
