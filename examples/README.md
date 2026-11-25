# Examples

Scripts behind an article about this server's edge cases. Node.js 22 or later, no dependencies; run them from a clone.

```sh
node examples/b1_stdio_edge_cases.mjs     # awkward input over stdio
node examples/b2_network_limits.mjs       # redirect, size and time limits (local server and a stub fetch)
node --test examples/b3_test_example.mjs  # a small test file in the same style
node examples/b4_more_edges.mjs           # null ids, prototype keys, bad origins
```
