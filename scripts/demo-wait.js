#!/usr/bin/env node
// A deliberately slow "command" to run in a VS Code terminal to trigger
// DevAds -- simulates the kind of long build/install/test wait DevAds is
// designed to monetize, with progress output so it's obvious something
// is actually happening (not a hang).
const SECONDS = Number(process.argv[2] ?? 30);

console.log(`Simulating a ${SECONDS}s build... (this is scripts/demo-wait.js, not a real build)`);

let elapsed = 0;
const interval = setInterval(() => {
  elapsed += 1;
  process.stdout.write(`\r  building... ${elapsed}/${SECONDS}s`);
  if (elapsed >= SECONDS) {
    clearInterval(interval);
    process.stdout.write("\n");
    console.log("Build complete.");
    process.exit(0);
  }
}, 1000);
