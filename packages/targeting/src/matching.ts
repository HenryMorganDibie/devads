import type { CampaignCandidate, CommandContext, DeveloperPrefs } from "./types";

function emptyMeansMatchAll(list: string[]): boolean {
  return list.length === 0;
}

function matchesList(list: string[], value: string | undefined): boolean {
  if (emptyMeansMatchAll(list)) return true;
  if (!value) return false;
  return list.map((v) => v.toLowerCase()).includes(value.toLowerCase());
}

function matchesAnyList(list: string[], values: string[] | undefined): boolean {
  if (emptyMeansMatchAll(list)) return true;
  if (!values || values.length === 0) return false;
  const lowerList = list.map((v) => v.toLowerCase());
  return values.some((v) => lowerList.includes(v.toLowerCase()));
}

/**
 * Applies campaign targeting spec + developer category opt-outs against
 * the current command context. Returns only candidates that match on
 * every configured dimension (empty campaign dimension = wildcard).
 */
export function applyTargeting(
  candidates: CampaignCandidate[],
  context: CommandContext,
  prefs: DeveloperPrefs
): CampaignCandidate[] {
  const optOut = new Set((prefs.categoriesOptOut ?? []).map((c) => c.toLowerCase()));

  return candidates.filter((c) => {
    if (c.status !== "APPROVED") return false;

    const { target } = c;
    if (!matchesList(target.languages, context.language)) return false;
    if (!matchesAnyList(target.frameworks, context.frameworks)) return false;
    if (!matchesList(target.runtimes, context.runtime)) return false;
    if (!matchesList(target.platforms, context.platform)) return false;
    if (!matchesList(target.countries, context.country)) return false;

    if (target.categories.length > 0) {
      const hasCategoryMatch = target.categories.some(
        (cat) => (context.categories ?? []).map((x) => x.toLowerCase()).includes(cat.toLowerCase())
      );
      if (!hasCategoryMatch) return false;
      const allOptedOut = target.categories.every((cat) => optOut.has(cat.toLowerCase()));
      if (allOptedOut) return false;
    }

    return true;
  });
}
