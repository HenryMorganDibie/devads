import * as vscode from "vscode";
import * as os from "node:os";

/**
 * Strict allowlist of coarse, non-invasive contextual signals. Never
 * touches file contents, source code, environment variables, secrets, or
 * full command arguments -- only high-level language/framework/runtime
 * detected from the active editor's language id and the workspace's own
 * package manifest presence (not its contents beyond a dependency-name
 * allowlist check for a handful of well-known frameworks).
 */
export interface DetectedContext {
  language?: string;
  framework?: string;
  runtime?: string;
  platform: string;
}

const FRAMEWORK_LANGUAGE_HINTS: Record<string, string> = {
  typescript: "typescript",
  typescriptreact: "typescript",
  javascript: "javascript",
  javascriptreact: "javascript",
  python: "python",
  go: "go",
  rust: "rust",
  ruby: "ruby",
  java: "java",
};

export function detectLanguage(): string | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return undefined;
  return FRAMEWORK_LANGUAGE_HINTS[editor.document.languageId];
}

export function detectPlatform(): string {
  return os.platform();
}

export function detectRuntime(language: string | undefined): string | undefined {
  if (language === "typescript" || language === "javascript") return "node";
  return undefined;
}

export function buildContext(): DetectedContext {
  const language = detectLanguage();
  return {
    language,
    runtime: detectRuntime(language),
    platform: detectPlatform(),
  };
}

/** Coarse command name only (e.g. "npm", "cargo") -- never the full command line. */
export function coarseCommandName(commandLine: string): string {
  const first = commandLine.trim().split(/\s+/)[0] ?? "";
  return first.replace(/^\.\/|\.exe$/gi, "").slice(0, 32);
}
