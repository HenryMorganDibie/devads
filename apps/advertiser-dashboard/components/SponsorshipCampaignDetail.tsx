import {
  activeOfferCount,
  canSubmit,
  formatClientTypes,
  formatDate,
  formatMoneyCents,
  formatUnits,
  objectiveLabel,
  rewardTypeLabel,
  summarizeSpend,
  type FormErrors,
  type OfferFormValues,
  type SponsorshipCampaign,
} from "../lib/sponsorships";
import { SponsoredOfferFields } from "./SponsoredOfferFields";
import { ErrorWithRetry, SessionExpired, StatusText } from "./SponsorshipCampaignsView";

export type CampaignDetailState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "error"; message: string }
  | { status: "not_found" }
  | { status: "ok"; campaign: SponsorshipCampaign };

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-muted mb-1">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}

function limit(n: number | null, unit: string): string {
  return n === null ? "No limit" : `${formatUnits(n)} ${unit}`;
}

function SpendSection({ c }: { c: SponsorshipCampaign }) {
  if (!c.stats) {
    return <p className="text-sm text-muted">Performance isn&apos;t available for this campaign.</p>;
  }
  const s = summarizeSpend({ ...c, stats: c.stats });
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <Stat label="Displays" value={formatUnits(c.stats.displays)} />
        <Stat label="Completions" value={formatUnits(c.stats.completions)} />
        <Stat label="Rewards granted" value={formatUnits(c.stats.rewardsGranted)} />
        <Stat label="Spend" value={formatMoneyCents(s.spendCents, c.currency)} />
      </div>
      <dl className="grid grid-cols-2 gap-4">
        <Detail
          label="Rewarded completions at your charge"
          value={`${formatUnits(c.stats.rewardsGranted)} x ${formatMoneyCents(c.sponsorChargeCents, c.currency)} = ${formatMoneyCents(s.listPriceCents, c.currency)}`}
        />
        <Detail
          label="Total budget remaining"
          value={s.remainingBudgetCents === null ? "No total budget" : formatMoneyCents(s.remainingBudgetCents, c.currency)}
        />
      </dl>
      {s.unbilledCents > 0 && (
        <p className="text-xs text-muted mt-3" data-testid="unbilled-note">
          {formatMoneyCents(s.unbilledCents, c.currency)} of rewarded completions weren&apos;t charged. Developers
          are still rewarded after your budget is used up, but you aren&apos;t charged for those completions.
        </p>
      )}
      <p className="text-xs text-muted mt-3">
        Totals are for the whole campaign. A per-day breakdown and daily budget usage aren&apos;t available yet.
      </p>
    </>
  );
}

function OffersSection({
  c,
  offerForm,
  offerErrors,
  offerSubmitting,
  offerError,
  onOfferChange,
  onAddOffer,
}: {
  c: SponsorshipCampaign;
  offerForm: OfferFormValues;
  offerErrors: FormErrors;
  offerSubmitting: boolean;
  offerError?: string | null;
  onOfferChange: (v: OfferFormValues) => void;
  onAddOffer: () => void;
}) {
  const active = activeOfferCount(c);
  return (
    <section className="card p-6 mb-6">
      <h2 className="font-medium mb-4">Sponsored offers</h2>
      {c.offers.length === 0 ? (
        <p className="text-sm text-muted mb-4">No offers yet. Add one below before submitting for review.</p>
      ) : (
        <ul className="space-y-4 mb-4">
          {c.offers.map((o) => (
            <li key={o.id} className="border-t border-white/5 pt-4" data-offer-id={o.id}>
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-medium">{o.title}</h3>
                <span className="text-xs text-muted">{o.status === "ACTIVE" ? "Active" : "Inactive"}</span>
              </div>
              <p className="text-sm text-muted">{o.description}</p>
              <p className="text-xs text-muted mt-1 break-all">Link: {o.ctaUrl}</p>
              <p className="text-xs text-muted">
                Required action: {o.requiredAction ?? "None (opening the link is the offer)"} &middot; Ends:{" "}
                {o.expiresAt ? `${formatDate(o.expiresAt)} (UTC)` : "No end date"}
              </p>
            </li>
          ))}
        </ul>
      )}
      {active > 1 && (
        <p className="text-xs text-muted mb-4">
          Developers are shown one offer per campaign at a time: the oldest active offer that hasn&apos;t
          ended. Later offers are served once the earlier ones end.
        </p>
      )}
      {c.status === "DRAFT" ? (
        <form
          noValidate
          className="border-t border-white/5 pt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onAddOffer();
          }}
        >
          <h3 className="text-sm font-medium">Add an offer</h3>
          <SponsoredOfferFields values={offerForm} errors={offerErrors} onChange={onOfferChange} requiredFields />
          {offerError && (
            <p className="text-sm text-red-400" role="alert">
              {offerError}
            </p>
          )}
          <button className="btn-primary text-sm" type="submit" disabled={offerSubmitting}>
            {offerSubmitting ? "Adding..." : "Add offer"}
          </button>
        </form>
      ) : (
        <p className="text-xs text-muted">
          Offers can only be added while the campaign is a draft. Editing or deactivating an existing offer
          isn&apos;t available yet.
        </p>
      )}
    </section>
  );
}

/** Presentational: one Sponsorship campaign, its offers, performance and the draft actions. */
export function SponsorshipCampaignDetail({
  state,
  onRetry,
  offerForm,
  offerErrors,
  offerSubmitting,
  offerError,
  onOfferChange,
  onAddOffer,
  submitting,
  submitError,
  onSubmitCampaign,
}: {
  state: CampaignDetailState;
  onRetry?: () => void;
  offerForm: OfferFormValues;
  offerErrors: FormErrors;
  offerSubmitting: boolean;
  offerError?: string | null;
  onOfferChange: (v: OfferFormValues) => void;
  onAddOffer: () => void;
  submitting: boolean;
  submitError?: string | null;
  onSubmitCampaign: () => void;
}) {
  if (state.status === "loading") return <p className="text-sm text-muted">Loading the sponsorship campaign...</p>;
  if (state.status === "unauthenticated") return <SessionExpired what="this sponsorship campaign" />;
  if (state.status === "error") return <ErrorWithRetry message={state.message} onRetry={onRetry} />;
  if (state.status === "not_found") {
    return <p className="text-sm">This sponsorship campaign wasn&apos;t found in your account.</p>;
  }
  const c = state.campaign;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-semibold">{c.name}</h2>
          <p className="text-sm">
            <StatusText status={c.status} />
          </p>
        </div>
        {c.status === "DRAFT" && (
          <div className="text-right">
            <button className="btn-primary text-sm" disabled={!canSubmit(c) || submitting} onClick={onSubmitCampaign}>
              {submitting ? "Submitting..." : "Submit for review"}
            </button>
            {!canSubmit(c) && <p className="text-xs text-muted mt-1">Add at least one offer first.</p>}
          </div>
        )}
      </div>
      {submitError && (
        <p className="text-sm text-red-400 mb-4" role="alert">
          {submitError}
        </p>
      )}
      {c.status === "REJECTED" && c.rejectionReason && (
        <p className="text-sm text-red-400 mb-4">Rejected: {c.rejectionReason}</p>
      )}
      {c.status === "SUBMITTED" && (
        <p className="text-sm text-muted mb-4">Waiting for DevAds review. It starts serving once approved.</p>
      )}

      <section className="card p-6 mb-6">
        <h2 className="font-medium mb-4">Campaign details</h2>
        <dl className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Detail label="Sponsor category" value={c.sponsorCategory ?? "Not specified"} />
          <Detail label="Objective" value={objectiveLabel(c.objective)} />
          <Detail label="Developer Reward" value={`${formatUnits(c.rewardAmountUnits)} ${rewardTypeLabel(c.rewardType)}`} />
          <Detail label="Charge per rewarded completion" value={formatMoneyCents(c.sponsorChargeCents, c.currency)} />
          <Detail
            label="Total budget"
            value={c.totalBudgetCents === null ? "No limit" : formatMoneyCents(c.totalBudgetCents, c.currency)}
          />
          <Detail
            label="Daily budget"
            value={c.dailyBudgetCents === null ? "No limit" : formatMoneyCents(c.dailyBudgetCents, c.currency)}
          />
          <Detail label="Rewards per developer per day" value={limit(c.developerDailyCap, "max")} />
          <Detail label="Rewards per developer ever" value={limit(c.developerLifetimeCap, "max")} />
          <Detail
            label="Displays per developer per day"
            value={c.frequencyCapPerDay === null ? "Platform default" : `${formatUnits(c.frequencyCapPerDay)} max`}
          />
          <Detail label="Developer tools" value={formatClientTypes(c.eligibleClientTypes)} />
          <Detail label="Starts (UTC)" value={formatDate(c.startDate)} />
          <Detail label="Ends (UTC)" value={c.endDate ? formatDate(c.endDate) : "No end date"} />
        </dl>
      </section>

      <section className="card p-6 mb-6">
        <h2 className="font-medium mb-4">Performance and spend</h2>
        <SpendSection c={c} />
      </section>

      <OffersSection
        c={c}
        offerForm={offerForm}
        offerErrors={offerErrors}
        offerSubmitting={offerSubmitting}
        offerError={offerError}
        onOfferChange={onOfferChange}
        onAddOffer={onAddOffer}
      />
    </>
  );
}
