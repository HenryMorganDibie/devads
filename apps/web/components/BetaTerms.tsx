import { BETA_TERMS_VERSION } from "@devads/shared";

/** The developer beta terms a developer accepts in onboarding (versioned server-side). */
export function BetaTerms() {
  return (
    <div className="text-sm text-muted space-y-3">
      <p className="text-xs font-mono">Version {BETA_TERMS_VERSION}</p>
      <ul className="list-disc pl-5 space-y-2">
        <li>
          DevAds is in developer beta. There are no external sponsors in the beta. Every beta opportunity is created
          and funded by DevAds and is labelled &ldquo;DevAds Beta Opportunity&rdquo;.
        </li>
        <li>
          Beta Credits record verified participation in the beta. They are not cash, have no monetary value, cannot
          be redeemed or transferred, and are kept separate from sponsor rewards.
        </li>
        <li>
          Rewards are granted only after DevAds verifies the qualifying interaction on its servers. Caps limit how
          many Beta Credits can be earned, and DevAds may reverse credits earned through abuse or error.
        </li>
        <li>
          DevAds stores your account identifier, email and display name from your sign-in provider, your sponsorship
          preference, and coarse interaction events (which opportunity was shown, opened or completed, and when). It
          never collects source code, prompts, model responses or secrets.
        </li>
        <li>Sponsorships are off until you opt in. You can opt out at any time, which stops all new opportunities.</li>
        <li>The beta may change or end. Features, caps and these terms may be updated, and you will be asked to accept a new version.</li>
      </ul>
    </div>
  );
}
