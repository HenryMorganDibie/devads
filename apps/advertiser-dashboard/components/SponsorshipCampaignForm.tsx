import {
  DEV_CLIENT_TYPES,
  REWARD_TYPES,
  SPONSORSHIP_OBJECTIVES,
  clientTypeLabel,
  objectiveLabel,
  rewardTypeLabel,
  type CampaignFormValues,
  type DevClientType,
  type FormErrors,
  type RewardType,
  type SponsorshipObjective,
} from "../lib/sponsorships";
import { Field, SponsoredOfferFields } from "./SponsoredOfferFields";

/**
 * Presentational create form for a Sponsorship campaign. Fields match
 * CreateSponsorshipCampaignSchema exactly; nothing here exists only in the UI.
 * The sponsor category is optional (never `required`): campaigns are
 * sponsor-agnostic and core logic never depends on a category.
 */
export function SponsorshipCampaignForm({
  values,
  errors,
  submitting,
  submitError,
  onChange,
  onSubmit,
}: {
  values: CampaignFormValues;
  errors: FormErrors;
  submitting: boolean;
  submitError?: string | null;
  onChange: (values: CampaignFormValues) => void;
  onSubmit: () => void;
}) {
  const set =
    (key: keyof CampaignFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      onChange({ ...values, [key]: e.target.value });

  function toggleClient(type: DevClientType) {
    const has = values.eligibleClientTypes.includes(type);
    onChange({
      ...values,
      eligibleClientTypes: has
        ? values.eligibleClientTypes.filter((t) => t !== type)
        : [...values.eligibleClientTypes, type],
    });
  }

  return (
    <form
      noValidate
      className="space-y-8"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <fieldset className="card p-6 space-y-4">
        <legend className="font-medium px-1">Sponsorship campaign</legend>
        <Field label="Campaign name" error={errors.name}>
          <input className="input" name="name" value={values.name} onChange={set("name")} maxLength={200} required />
        </Field>
        <Field
          label="Sponsor category (optional)"
          hint="A free-form label for your own reference, e.g. your product area. Leave blank if it doesn't apply."
          error={errors.sponsorCategory}
        >
          <input
            className="input"
            name="sponsorCategory"
            value={values.sponsorCategory}
            onChange={set("sponsorCategory")}
            maxLength={64}
          />
        </Field>
        <Field label="Objective" error={errors.objective}>
          <select
            className="input"
            name="objective"
            value={values.objective}
            onChange={(e) => onChange({ ...values, objective: e.target.value as SponsorshipObjective })}
          >
            {SPONSORSHIP_OBJECTIVES.map((o) => (
              <option key={o} value={o}>
                {objectiveLabel(o)}
              </option>
            ))}
          </select>
        </Field>
      </fieldset>

      <fieldset className="card p-6 space-y-4">
        <legend className="font-medium px-1">Developer Reward and pricing</legend>
        <p className="text-xs text-muted">
          Each time a developer completes your offer, they earn the reward below and you&apos;re charged
          the per-completion amount. The two are set independently.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Reward type" error={errors.rewardType}>
            <select
              className="input"
              name="rewardType"
              value={values.rewardType}
              onChange={(e) => onChange({ ...values, rewardType: e.target.value as RewardType })}
            >
              {REWARD_TYPES.map((r) => (
                <option key={r} value={r}>
                  {rewardTypeLabel(r)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Reward per completion (whole units)" error={errors.rewardAmountUnits}>
            <input
              className="input"
              name="rewardAmountUnits"
              inputMode="numeric"
              placeholder="500"
              value={values.rewardAmountUnits}
              onChange={set("rewardAmountUnits")}
              required
            />
          </Field>
        </div>
        <Field label="Charge per rewarded completion (USD)" error={errors.sponsorCharge}>
          <input
            className="input"
            name="sponsorCharge"
            inputMode="decimal"
            placeholder="2.50"
            value={values.sponsorCharge}
            onChange={set("sponsorCharge")}
            required
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Total budget (USD, optional)" error={errors.totalBudget}>
            <input className="input" name="totalBudget" inputMode="decimal" value={values.totalBudget} onChange={set("totalBudget")} />
          </Field>
          <Field label="Daily budget (USD, optional)" error={errors.dailyBudget}>
            <input className="input" name="dailyBudget" inputMode="decimal" value={values.dailyBudget} onChange={set("dailyBudget")} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="card p-6 space-y-4">
        <legend className="font-medium px-1">Limits per developer</legend>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Rewards per day (optional)" error={errors.developerDailyCap}>
            <input
              className="input"
              name="developerDailyCap"
              inputMode="numeric"
              value={values.developerDailyCap}
              onChange={set("developerDailyCap")}
            />
          </Field>
          <Field label="Rewards ever (optional)" error={errors.developerLifetimeCap}>
            <input
              className="input"
              name="developerLifetimeCap"
              inputMode="numeric"
              value={values.developerLifetimeCap}
              onChange={set("developerLifetimeCap")}
            />
          </Field>
          <Field label="Displays per day (optional)" error={errors.frequencyCapPerDay}>
            <input
              className="input"
              name="frequencyCapPerDay"
              inputMode="numeric"
              value={values.frequencyCapPerDay}
              onChange={set("frequencyCapPerDay")}
            />
          </Field>
        </div>
        <p className="text-xs text-muted">Blank means no campaign-specific limit (displays fall back to the platform default).</p>
      </fieldset>

      <fieldset className="card p-6 space-y-4">
        <legend className="font-medium px-1">Where and when</legend>
        <div>
          <span className="text-xs text-muted block mb-2">Developer tools (none selected = all tools)</span>
          <div className="grid grid-cols-2 gap-2">
            {DEV_CLIENT_TYPES.map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="eligibleClientTypes"
                  value={t}
                  checked={values.eligibleClientTypes.includes(t)}
                  onChange={() => toggleClient(t)}
                />
                {clientTypeLabel(t)}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted mt-2">
            Today, developers can only receive sponsored offers in the VS Code extension.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Start date (optional, UTC)" hint="Blank starts as soon as it's approved." error={errors.startDate}>
            <input className="input" name="startDate" type="date" value={values.startDate} onChange={set("startDate")} />
          </Field>
          <Field label="End date (optional, UTC)" error={errors.endDate}>
            <input className="input" name="endDate" type="date" value={values.endDate} onChange={set("endDate")} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="card p-6 space-y-4">
        <legend className="font-medium px-1">First sponsored offer (optional)</legend>
        <p className="text-xs text-muted">
          You can add it now or from the campaign page. A campaign needs at least one offer before it can
          be submitted for review.
        </p>
        <SponsoredOfferFields
          values={values.offer}
          errors={errors}
          errorPrefix="offer."
          onChange={(offer) => onChange({ ...values, offer })}
          requiredFields={false}
        />
      </fieldset>

      {submitError && (
        <p className="text-sm text-red-400" role="alert">
          {submitError}
        </p>
      )}
      <button className="btn-primary" type="submit" disabled={submitting}>
        {submitting ? "Saving..." : "Save as draft"}
      </button>
    </form>
  );
}
