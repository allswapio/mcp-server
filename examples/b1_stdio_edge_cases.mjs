// Start the real allswap-mcp command and send one JSON-RPC message per line.
// Prints each request line and the reply (or "(no reply)"). No network is used by these cases.
// Node.js 22. Usage: node b1_stdio_edge_cases.mjs [path-to-allswap-mcp.mjs]
import { spawn } from "node:child_process";

const bin = process.argv[2] ?? new URL("../bin/allswap-mcp.mjs", import.meta.url).pathname;

const cases = [
  ["initialize, client asks 2025-06-18", '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}'],
  ["initialize, unknown revision", '{"jsonrpc":"2.0","id":2,"method":"initialize","params":{"protocolVersion":"2099-01-01"}}'],
  ["initialize, no version", '{"jsonrpc":"2.0","id":3,"method":"initialize","params":{}}'],
  ["notification", '{"jsonrpc":"2.0","method":"notifications/initialized"}'],
  ["ping without id is a notification", '{"jsonrpc":"2.0","method":"ping"}'],
  ["ping with id", '{"jsonrpc":"2.0","id":"abc","method":"ping"}'],
  ["unknown method", '{"jsonrpc":"2.0","id":7,"method":"server/discover"}'],
  ["wrong jsonrpc value, usable id", '{"jsonrpc":"1.0","id":5,"method":"ping"}'],
  ["no method, usable id", '{"jsonrpc":"2.0","id":9}'],
  ["id is an object", '{"jsonrpc":"2.0","id":{"a":1},"method":"ping"}'],
  ["id is a boolean", '{"jsonrpc":"2.0","id":true,"method":"ping"}'],
  ["batch (array)", '[{"jsonrpc":"2.0","id":1,"method":"ping"},{"jsonrpc":"2.0","id":2,"method":"ping"}]'],
  ["not JSON", "{this is not json"],
  ["JSON but a bare number", "42"],
  ["unknown tool", '{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"send_funds"}}'],
  ["tool name not a string", '{"jsonrpc":"2.0","id":11,"method":"tools/call","params":{"name":["x"]}}'],
  ["tool: hash in the wrong format", '{"jsonrpc":"2.0","id":12,"method":"tools/call","params":{"name":"get_tx_explorer_url","arguments":{"network":"btc","txHash":"nope"}}}'],
  ["tool: good hash", '{"jsonrpc":"2.0","id":13,"method":"tools/call","params":{"name":"get_tx_explorer_url","arguments":{"network":"BTC","txHash":"4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b"}}}'],
];

// One process per line, so each reply can be matched to its request without relying on order.
function ask(line) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [bin], { stdio: ["pipe", "pipe", "inherit"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("close", () => resolve(out.trim() === "" ? null : out.trim().split("\n").map((l) => JSON.parse(l))));
    child.stdin.end(line + "\n");
  });
}

for (const [label, line] of cases) {
  const replies = await ask(line);
  const shown = replies === null ? "(no reply)" : replies.map((r) => JSON.stringify(r).slice(0, 200)).join("\n< ");
  console.log(`# ${label}\n> ${line.length > 110 ? line.slice(0, 107) + "..." : line}\n< ${shown}\n`);
}

// Replies are written as each line finishes, not in request order: a parse error is written at once,
// while a valid line is answered after an await. Match replies to requests by id.
const both = await new Promise((resolve) => {
  const child = spawn(process.execPath, [bin], { stdio: ["pipe", "pipe", "inherit"] });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.on("close", () => resolve(out.trim().split("\n")));
  child.stdin.end('{"jsonrpc":"2.0","id":1,"method":"ping"}\n{broken\n');
});
console.log("# two lines sent: a valid ping (id 1), then broken JSON. Replies in arrival order:");
for (const l of both) console.log("< " + l);
