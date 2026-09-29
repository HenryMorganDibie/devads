import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { BETA_PRODUCTS } from "../lib/betaProducts";
import { BETA_VIDEO_PRODUCTS } from "../../../packages/database/seed/betaVideo";

const DIR = path.resolve(__dirname, "../public/beta-creatives");
const manifest = JSON.parse(readFileSync(path.join(DIR, "manifest.json"), "utf8")) as {
  width: number;
  height: number;
  creatives: Array<{
    product: string;
    durationSeconds: number;
    file: string;
    poster: string;
    mimeType: string;
    bytes: number;
    sha256: string;
    webm: { file: string; mimeType: string; bytes: number; sha256: string };
  }>;
};

describe("first-party beta video creatives", () => {
  it("covers exactly the products the beta seed creates campaigns for", () => {
    const seeded = BETA_VIDEO_PRODUCTS.map((p) => p.slug).sort();
    expect(BETA_PRODUCTS.map((p) => p.slug).sort()).toEqual(seeded);
    expect([...new Set(manifest.creatives.map((c) => c.product))].sort()).toEqual(seeded);
  });

  it("has a 10s, 15s and 20s H.264 creative plus a poster for every product", () => {
    for (const p of BETA_PRODUCTS) {
      const lengths = manifest.creatives.filter((c) => c.product === p.slug).map((c) => c.durationSeconds).sort((a, b) => a - b);
      expect(lengths).toEqual([10, 15, 20]);
    }
    for (const c of manifest.creatives) {
      expect(c.mimeType).toBe("video/mp4");
      expect(existsSync(path.join(DIR, c.file))).toBe(true);
      expect(existsSync(path.join(DIR, c.poster))).toBe(true);
    }
  });

  it("ships exactly the files the manifest describes (size and SHA-256)", () => {
    for (const c of manifest.creatives) {
      const bytes = readFileSync(path.join(DIR, c.file));
      expect(bytes.length).toBe(c.bytes);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(c.sha256);
      // An MP4 starts with an ftyp box: real video files, not placeholders.
      expect(bytes.subarray(4, 8).toString("latin1")).toBe("ftyp");

      // Every cut also has a VP9 WebM rendition (VS Code webviews cannot decode H.264).
      expect(c.webm.mimeType).toBe("video/webm");
      const webm = readFileSync(path.join(DIR, c.webm.file));
      expect(webm.length).toBe(c.webm.bytes);
      expect(createHash("sha256").update(webm).digest("hex")).toBe(c.webm.sha256);
      expect(webm.subarray(0, 4).toString("hex")).toBe("1a45dfa3"); // EBML header
    }
  });

  it("labels every first-party offer as a DevAds Beta Opportunity", () => {
    for (const p of BETA_VIDEO_PRODUCTS) expect(p.title.startsWith("DevAds Beta Opportunity:")).toBe(true);
  });
});
