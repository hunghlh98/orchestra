// hooks/lib/stdin-bounded.js
// Bounded stdin reader for hook scripts. Caps payload at 1 MiB to prevent a
// hostile transcript from exhausting memory in any of the 8 hook handlers.
//
// All hooks honor a defense-in-depth fail-open contract: on overflow the
// reader returns `null` and the hook's outer try/catch exits 0. The blocked
// payload is logged to stderr so a reviewer can spot the cap in incident
// triage. Hooks that need a different decision on overflow (e.g. pre-write
// check emitting `permissionDecision: "ask"`) inspect the `overflow` flag.

const DEFAULT_CAP_BYTES = 1 << 20; // 1 MiB

export async function readBoundedStdin(maxBytes = DEFAULT_CAP_BYTES) {
  process.stdin.setEncoding("utf8");
  let buf = "";
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += Buffer.byteLength(chunk, "utf8");
    if (bytes > maxBytes) {
      return { text: null, overflow: true, bytes };
    }
    buf += chunk;
  }
  return { text: buf, overflow: false, bytes };
}
