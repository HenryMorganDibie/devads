// Renders the DevAds first-party beta video creatives.
//
//   npm install && npm run render            # all products, all variants
//   node render.mjs --only schema-watch      # one product
//   node render.mjs --stills                 # one PNG per scene, for review
//
// Each frame is drawn deterministically by stage.html at t = frame / FPS,
// captured by headless Chromium and piped to ffmpeg (libx264, yuv420p,
// faststart, no audio track). Output goes to apps/web/public/beta-creatives,
// which the web app serves and the beta seed references by URL.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ffmpegPath from "ffmpeg-static";
import { chromium } from "playwright-core";
import { PRODUCTS, SOURCES, VARIANTS } from "./storyboards.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, "../../apps/web/public/beta-creatives");
const FPS = 30;
const WIDTH = 1280;
const HEIGHT = 720;

const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const stills = args.includes("--stills");
// Re-derive the WebM files (and their manifest entries) from existing MP4s without re-rendering frames.
const transcodeOnly = args.includes("--transcode-only");
const executablePath = process.env.CHROMIUM_PATH ?? (process.env.PLAYWRIGHT_BROWSERS_PATH ? undefined : undefined);

function checkStoryboards() {
  for (const p of PRODUCTS) {
    for (const v of VARIANTS) {
      const total = p.scenes.reduce((sum, s) => sum + (s.d[v] ?? 0), 0);
      if (Math.abs(total - v) > 1e-9) throw new Error(`${p.slug} ${v}s variant scenes sum to ${total}s`);
    }
  }
}

function encoder(file) {
  const ff = spawn(
    ffmpegPath,
    [
      "-y", "-loglevel", "error",
      "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
      "-c:v", "libx264", "-preset", "slow", "-crf", "22", "-profile:v", "high", "-pix_fmt", "yuv420p",
      "-movflags", "+faststart", "-an", file,
    ],
    { stdio: ["pipe", "inherit", "inherit"] }
  );
  const done = new Promise((resolve, reject) => ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)))));
  return { ff, done };
}

async function sha256(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

// WebM/VP9 alongside the H.264 MP4: VS Code webviews (Electron) and other
// Chromium builds without proprietary codecs cannot decode H.264, while
// Safari and older players may lack VP9. Clients list WebM first, MP4 second.
function toWebm(mp4, webm) {
  return new Promise((resolve, reject) => {
    const ff = spawn(
      ffmpegPath,
      ["-y", "-loglevel", "error", "-i", mp4, "-c:v", "libvpx-vp9", "-crf", "32", "-b:v", "0", "-row-mt", "1", "-deadline", "good", "-cpu-used", "2", "-pix_fmt", "yuv420p", "-an", webm],
      { stdio: ["ignore", "inherit", "inherit"] }
    );
    ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg (webm) exited ${code}`))));
  });
}

async function withWebm(entry) {
  const webmFile = entry.file.replace(/\.mp4$/, ".webm");
  await toWebm(path.join(OUT, entry.file), path.join(OUT, webmFile));
  const { size } = await stat(path.join(OUT, webmFile));
  return { ...entry, webm: { file: webmFile, mimeType: "video/webm", bytes: size, sha256: await sha256(path.join(OUT, webmFile)) } };
}

if (transcodeOnly) {
  const manifestPath = path.join(OUT, "manifest.json");
  const m = JSON.parse(await readFile(manifestPath, "utf8"));
  m.creatives = await Promise.all(m.creatives.filter((c) => !only || c.product === only).map(withWebm)).then((done) => [
    ...m.creatives.filter((c) => !done.some((d) => d.file === c.file)),
    ...done,
  ]);
  m.creatives.sort((a, b) => a.file.localeCompare(b.file));
  await writeFile(manifestPath, JSON.stringify(m, null, 2) + "\n");
  console.log(`transcoded ${m.creatives.length} creatives to WebM`);
  process.exit(0);
}

checkStoryboards();
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: executablePath ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(path.join(HERE, "stage.html")).href);
await page.evaluate(() => document.fonts.ready);
// Make sure every font face is actually loaded before the first frame.
await page.evaluate(async () => {
  await Promise.all(["400 20px Inter", "700 20px Inter", "500 20px JBM", "400 20px JBM", "700 20px Serif", "600 20px Serif"].map((f) => document.fonts.load(f)));
});

const manifest = { generatedBy: "tools/beta-creatives", fps: FPS, width: WIDTH, height: HEIGHT, sources: SOURCES, creatives: [] };

for (const product of PRODUCTS.filter((p) => !only || p.slug === only)) {
  for (const variant of VARIANTS) {
    const base = `${product.slug}-${variant}s`;
    if (stills) {
      let start = 0;
      for (const [i, s] of product.scenes.filter((x) => x.d[variant]).entries()) {
        const t = start + s.d[variant] * 0.85;
        await page.evaluate(([p, v, tt]) => window.renderFrame(p, v, tt), [product, variant, t]);
        await page.screenshot({ path: path.join(HERE, "stills", `${base}-${i}.png`) });
        start += s.d[variant];
      }
      continue;
    }
    const file = path.join(OUT, `${base}.mp4`);
    const { ff, done } = encoder(file);
    const frames = variant * FPS;
    for (let f = 0; f < frames; f++) {
      await page.evaluate(([p, v, t]) => window.renderFrame(p, v, t), [product, variant, f / FPS]);
      const png = await page.screenshot({ type: "png" });
      if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r));
    }
    ff.stdin.end();
    await done;

    // Poster: the CTA frame, so a paused or blocked video still says what it is.
    const poster = path.join(OUT, `${base}.jpg`);
    await page.evaluate(([p, v, t]) => window.renderFrame(p, v, t), [product, variant, variant - 0.6]);
    await page.screenshot({ path: poster, type: "jpeg", quality: 85 });

    const { size } = await stat(file);
    const entry = {
      product: product.slug,
      durationSeconds: variant,
      file: `${base}.mp4`,
      poster: `${base}.jpg`,
      mimeType: "video/mp4",
      width: WIDTH,
      height: HEIGHT,
      bytes: size,
      sha256: await sha256(file),
    };
    manifest.creatives.push(await withWebm(entry));
    console.log(`rendered ${base}.mp4 + .webm (${(size / 1024).toFixed(0)} KiB mp4)`);
  }
}

await browser.close();
if (!stills) {
  const manifestPath = path.join(OUT, "manifest.json");
  let previous = { creatives: [] };
  try {
    previous = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {}
  const kept = previous.creatives.filter((c) => !manifest.creatives.some((m) => m.file === c.file));
  manifest.creatives = [...kept, ...manifest.creatives].sort((a, b) => a.file.localeCompare(b.file));
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}
