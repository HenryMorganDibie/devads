/**
 * Public marketing-site configuration.
 *
 * Destinations that are not published yet (docs, a public repository, legal
 * pages, a contact channel) are read from the environment and stay undefined
 * until they exist. The footer renders an undefined link as "Soon" rather
 * than pointing at a page that 404s or inventing one.
 */

function env(value: string | undefined): string | undefined {
  const v = value?.trim();
  return v ? v : undefined;
}

export const SITE = {
  title: "DevAds | The Sponsorship Infrastructure for AI-Powered Development",
  description:
    "DevAds connects organizations that want to reach developers with developers who want more value from the tools they use to build.",
  /** Canonical production origin. Only set once a real domain exists. */
  url: env(process.env.NEXT_PUBLIC_SITE_URL),
} as const;

export const LINKS = {
  /** Developer sign-up: GitHub/Google sign-in into the developer beta. */
  signUp: "/join",
  signIn: "/login",
  sponsor: "/advertise",
  betaTerms: "/beta/terms",
  docs: env(process.env.NEXT_PUBLIC_DOCS_URL),
  github: env(process.env.NEXT_PUBLIC_GITHUB_URL),
  privacy: env(process.env.NEXT_PUBLIC_PRIVACY_URL),
  terms: env(process.env.NEXT_PUBLIC_TERMS_URL),
  contact: env(process.env.NEXT_PUBLIC_CONTACT_URL),
} as const;
