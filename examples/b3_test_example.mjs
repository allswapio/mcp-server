// A small node:test file in the style of the package's own tests: start the real command, send lines,
// compare whole replies. Node.js 22. Run: node --test b3_test_example.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const bin = new URL("../bin/allswap-mcp.mjs", import.meta.url).pathname;

function run(lines) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [bin], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ code, replies: out.trim() === "" ? [] : out.trim().split("\n").map((l) => JSON.parse(l)) }));
    child.stdin.end(lines.join("\n") + "\n");
  });
}
const INVALID = (id) => ({ jsonrpc: "2.0", id, error: { code: -32600, message: "Invalid JSON-RPC 2.0 request" } });

test("an invalid request echoes its id only when the id is a string, a number or null", async () => {
  const { replies } = await run([
    '{"jsonrpc":"1.0","id":5,"method":"ping"}',
    '{"jsonrpc":"2.0","id":"x","params":{}}',
    '{"jsonrpc":"2.0","id":[1],"method":"ping"}',
  ]);
  const byId = (id) => replies.filter((r) => r.id === id);
  assert.deepEqual(byId(5), [INVALID(5)]);
  assert.deepEqual(byId("x"), [INVALID("x")]);
  assert.equal(replies.length, 3);
  assert.deepEqual(byId(null), [INVALID(null)]);
});

test("notifications get no reply and the process exits 0 at end of input", async () => {
  const { code, replies } = await run(['{"jsonrpc":"2.0","method":"notifications/initialized"}']);
  assert.equal(code, 0);
  assert.deepEqual(replies, []);
});

test("a batch is refused as one invalid request", async () => {
  const { replies } = await run(['[{"jsonrpc":"2.0","id":1,"method":"ping"}]']);
  assert.deepEqual(replies, [INVALID(null)]);
});
