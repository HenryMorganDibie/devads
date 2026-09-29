// Renders the README product demo (docs/demo/): 25 s, 1280x720, 30 fps.
//
//   node render-demo.mjs            # devads-demo.mp4, devads-demo.gif, devads-demo.jpg
//   node render-demo.mjs --stills   # a few PNGs for review
//
// demo.html draws each frame as a pure function of t; the video inside the
// VS Code frame is the real Schema-Watch 15 s creative (stage.html) and the
// browser steps are real screenshots of the web app (demo-assets/).
import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";
import { chromium } from "playwright-core";
import { PRODUCTS } from "./storyboards.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, "../../docs/demo");
const FPS = 30;
const DURATION = 25;
const stills = process.argv.includes("--stills");
const product = PRODUCTS.find((p) => p.slug === "schema-watch");

function run(args) {
  return new Promise((resolve, reject) => {
    const ff = spawn(ffmpegPath, ["-y", "-loglevel", "error", ...args], { stdio: ["ignore", "inherit", "inherit"] });
    ff.on("close", (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg exited ${c}`))));
  });
}

await mkdir(OUT, { recursive: true });
// The demo embeds stage.html in an iframe; serve this directory over
// localhost so the two pages share an origin (file:// iframes do not).
const TYPES = { ".html": "text/html", ".mjs": "text/javascript", ".jpg": "image/jpeg", ".png": "image/png", ".woff2": "font/woff2" };
const server = createServer(async (req, res) => {
  const rel = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "");
  const file = path.resolve(HERE, rel);
  if (!file.startsWith(HERE)) return res.writeHead(403).end();
  let body;
  try {
    body = await readFile(file);
  } catch {
    return res.writeHead(404).end();
  }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" }).end(body);
}).listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`${ORIGIN}/demo.html`);
await page.waitForFunction(() => document.getElementById("creative").contentWindow?.renderFrame);
await page.evaluate(async () => {
  await document.fonts.ready;
  const inner = document.getElementById("creative").contentWindow.document;
  await inner.fonts.ready;
  await Promise.all([...document.images].map((i) => i.decode?.().catch(() => {})));
});
// Warm the screenshot images so no frame shows them half-loaded.
await page.evaluate(async () => {
  for (const f of ["product_countdown", "product_ready", "product_verified", "wallet"]) {
    const img = new Image();
    img.src = `demo-assets/${f}.jpg`;
    await img.decode();
  }
});

if (stills) {
  await mkdir(path.join(HERE, "stills"), { recursive: true });
  for (const t of [2.5, 4.4, 7.5, 10.9, 13.5, 16.0, 18.2, 21.5, 24.5]) {
    await page.evaluate(([tt, p]) => window.renderDemo(tt, p), [t, product]);
    await page.waitForTimeout(60);
    await page.screenshot({ path: path.join(HERE, "stills", `demo-${String(t).replace(".", "_")}.png`) });
  }
  await browser.close();
  server.close();
  process.exit(0);
}

const mp4 = path.join(OUT, "devads-demo.mp4");
const ff = spawn(
  ffmpegPath,
  ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
   "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-profile:v", "high", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", mp4],
  { stdio: ["pipe", "inherit", "inherit"] }
);
const done = new Promise((resolve, reject) => ff.on("close", (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg exited ${c}`)))));
for (let f = 0; f < DURATION * FPS; f++) {
  await page.evaluate(([t, p]) => window.renderDemo(t, p), [f / FPS, product]);
  const png = await page.screenshot({ type: "png" });
  if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r));
}
ff.stdin.end();
await done;

// Poster (step 2: the offer playing in VS Code) and a README preview GIF.
await page.evaluate(([t, p]) => window.renderDemo(t, p), [7.5, product]);
await page.screenshot({ path: path.join(OUT, "devads-demo.jpg"), type: "jpeg", quality: 88 });
await browser.close();
server.close();
const palette = path.join(OUT, ".palette.png");
await run(["-i", mp4, "-vf", "fps=12,scale=800:-1:flags=lanczos,palettegen=stats_mode=diff", palette]);
await run(["-i", mp4, "-i", palette, "-lavfi", "fps=12,scale=800:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle", path.join(OUT, "devads-demo.gif")]);
const { rm } = await import("node:fs/promises");
await rm(palette);
console.log("rendered docs/demo/devads-demo.{mp4,gif,jpg}");
