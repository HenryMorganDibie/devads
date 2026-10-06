import { describe, expect, it, vi } from "vitest";

// Minimal vscode stand-in: records what goes into the tooltip as raw Markdown
// versus escaped text, which is the whole point of these tests.
vi.mock("vscode", () => {
  class MarkdownString {
    isTrusted: unknown = false;
    markdown: string[] = [];
    text: string[] = [];
    appendMarkdown(s: string) {
      this.markdown.push(s);
      return this;
    }
    appendText(s: string) {
      this.text.push(s);
      return this;
    }
  }
  const item = { text: "", tooltip: undefined as unknown, command: "", show: vi.fn(), hide: vi.fn(), dispose: vi.fn() };
  return {
    MarkdownString,
    StatusBarAlignment: { Right: 2 },
    window: { createStatusBarItem: () => item },
    __item: item,
  };
});

import * as vscode from "vscode";
import { escapeLinkText, StatusBarAd } from "../statusBarAd";
import type { AdCandidate } from "../adClient";

const item = (vscode as unknown as { __item: { text: string; tooltip: any } }).__item;

function ad(overrides: Partial<AdCandidate> = {}): AdCandidate {
  return {
    impressionId: "imp_1",
    campaignId: "camp_1",
    creativeId: "cr_1",
    type: "IMAGE",
    headline: "Ship faster",
    body: "Preview deploys in one click.",
    ctaLabel: "Learn more",
    ctaUrl: "https://sponsor.example",
    eventId: "e_1",
    ...overrides,
  };
}

describe("StatusBarAd tooltip trust", () => {
  it("trusts only the ad's own commands, never every command", () => {
    new StatusBarAd(vi.fn(), vi.fn()).show(ad());
    expect(item.tooltip.isTrusted).toEqual({ enabledCommands: ["devads.adClicked", "devads.adDismissed"] });
  });

  it("escapes sponsor headline and body instead of rendering them as Markdown", () => {
    const evil = "[Click](command:workbench.action.terminal.sendSequence?%7B%22text%22%3A%22rm%22%7D)";
    new StatusBarAd(vi.fn(), vi.fn()).show(ad({ headline: evil, body: evil }));
    expect(item.tooltip.text).toEqual([evil, evil]);
    expect(item.tooltip.markdown.join("")).not.toContain("workbench.action");
  });

  it("cannot let a CTA label close its link and add another", () => {
    const label = "x](command:workbench.action.reloadWindow) [y";
    new StatusBarAd(vi.fn(), vi.fn()).show(ad({ ctaLabel: label }));
    const md = item.tooltip.markdown.join("");
    expect(md).not.toContain("](command:workbench");
    expect(md).toContain("(command:devads.adClicked)");
    expect(escapeLinkText("a]b")).toBe("a\\]b");
  });

  it("strips codicon syntax and truncates the status bar headline", () => {
    new StatusBarAd(vi.fn(), vi.fn()).show(ad({ headline: "$(alert) " + "x".repeat(100) }));
    expect(item.text.startsWith("$(megaphone) (alert)")).toBe(true);
    expect(item.text.length).toBeLessThanOrEqual("$(megaphone) ".length + 60);
  });
});
