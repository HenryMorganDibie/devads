import type { FormErrors, OfferFormValues } from "../lib/sponsorships";

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs text-muted block mb-1">{label}</span>
      {children}
      {hint && !error && <span className="text-xs text-muted block mt-1">{hint}</span>}
      {error && (
        <span className="text-xs text-red-400 block mt-1" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}

/**
 * The SponsoredOfferInputSchema fields: title, description, ctaUrl, and the
 * optional requiredAction and expiresAt. Error keys are looked up as
 * `${errorPrefix}title` etc.
 */
export function SponsoredOfferFields({
  values,
  errors,
  errorPrefix = "",
  onChange,
  requiredFields,
}: {
  values: OfferFormValues;
  errors: FormErrors;
  errorPrefix?: string;
  onChange: (values: OfferFormValues) => void;
  /** When false (the optional first offer on the create form), fields aren't marked required. */
  requiredFields: boolean;
}) {
  const set = (key: keyof OfferFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...values, [key]: e.target.value });
  return (
    <div className="space-y-4">
      <Field label="Offer title" error={errors[`${errorPrefix}title`]}>
        <input
          className="input"
          name="offerTitle"
          value={values.title}
          onChange={set("title")}
          maxLength={200}
          required={requiredFields}
        />
      </Field>
      <Field label="Description" error={errors[`${errorPrefix}description`]}>
        <textarea
          className="input"
          name="offerDescription"
          rows={3}
          value={values.description}
          onChange={set("description")}
          maxLength={1000}
          required={requiredFields}
        />
      </Field>
      <Field label="Link (https://...)" error={errors[`${errorPrefix}ctaUrl`]}>
        <input
          className="input"
          name="offerCtaUrl"
          type="url"
          placeholder="https://yourproduct.com/start"
          value={values.ctaUrl}
          onChange={set("ctaUrl")}
          required={requiredFields}
        />
      </Field>
      <Field
        label="Required action (optional)"
        hint={'What the developer does to earn the reward, e.g. "Create a project". Leave blank if opening the link is the whole offer.'}
        error={errors[`${errorPrefix}requiredAction`]}
      >
        <input
          className="input"
          name="offerRequiredAction"
          value={values.requiredAction}
          onChange={set("requiredAction")}
          maxLength={500}
        />
      </Field>
      <Field label="Offer ends (optional, UTC)" error={errors[`${errorPrefix}expiresAt`]}>
        <input className="input" name="offerExpiresAt" type="date" value={values.expiresAt} onChange={set("expiresAt")} />
      </Field>
    </div>
  );
}
