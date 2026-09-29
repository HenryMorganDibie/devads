import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DevClientTypeSchema } from "@devads/shared";

/**
 * The sponsorship core must stay client- and provider-agnostic: adding an
 * adapter for a new tool must never require server, targeting or accounting
 * changes. Client types may appear only as values of the shared enum
 * (defined once in packages/shared/src/sponsorship.ts); no core code may
 * branch on a specific one or name an AI vendor.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const ROOTS = ["services/ad-server/src", "packages/targeting/src", "packages/shared/src"];
const ENUM_DEFINITION = join("packages", "shared", "src", "sponsorship.ts");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" ? [] : sourceFiles(path);
    return path.endsWith(".ts") ? [path] : [];
  });
}

/** Removes the one place client types are allowed to be spelled out: the shared enum definition. */
function withoutEnumDefinition(file: string, text: string): string {
  if (relative(REPO, file) !== ENUM_DEFINITION) return text;
  return text.replace(/export const DevClientTypeSchema = z\.enum\(\[[\s\S]*?\]\);/, "");
}

describe("sponsorship core provider independence", () => {
  const files = ROOTS.flatMap((root) => sourceFiles(join(REPO, root)));
  // "OTHER" is excluded: it is also a value of the objective and reward-type enums, not a named client.
  const NAMED_CLIENTS = DevClientTypeSchema.options.filter((t) => t !== "OTHER");
  const CLIENT_LITERAL = new RegExp(`["'\`](${NAMED_CLIENTS.join("|")})["'\`]`);
  const VENDORS = /\b(anthropic|openai|google|mistral|claude|gemini|codex)\b/i;

  it("scans the server, targeting and shared sources", () => {
    expect(files.some((f) => f.endsWith(join("routes", "sponsorships.ts")))).toBe(true);
    expect(files.some((f) => relative(REPO, f) === ENUM_DEFINITION)).toBe(true);
  });

  it("no core code hard-codes or branches on a specific client type", () => {
    for (const file of files) {
      expect(withoutEnumDefinition(file, readFileSync(file, "utf8")), relative(REPO, file)).not.toMatch(CLIENT_LITERAL);
    }
  });

  it("no core code names an AI vendor", () => {
    for (const file of files) {
      expect(withoutEnumDefinition(file, readFileSync(file, "utf8")), relative(REPO, file)).not.toMatch(VENDORS);
    }
  });
});
