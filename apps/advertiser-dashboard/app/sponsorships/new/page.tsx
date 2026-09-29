"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadSession } from "../../../lib/api";
import {
  buildCreateCampaignPayload,
  createSponsorshipCampaign,
  emptyCampaignForm,
  type CampaignFormValues,
  type FormErrors,
} from "../../../lib/sponsorships";
import { AdvertiserNav } from "../../../components/AdvertiserNav";
import { SponsorshipCampaignForm } from "../../../components/SponsorshipCampaignForm";

export default function NewSponsorshipPage() {
  const router = useRouter();
  const [values, setValues] = useState<CampaignFormValues>(emptyCampaignForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!loadSession()?.advertiserId) router.push("/login");
  }, [router]);

  async function onSubmit() {
    const session = loadSession();
    if (!session?.advertiserId) {
      router.push("/login");
      return;
    }
    setSubmitError(null);
    const built = buildCreateCampaignPayload(values, session.advertiserId);
    if (!built.ok) {
      setErrors(built.errors);
      setSubmitError("Fix the highlighted fields and try again.");
      return;
    }
    setErrors({});
    setSubmitting(true);
    const result = await createSponsorshipCampaign(built.payload);
    setSubmitting(false);
    if (result.status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (result.status === "error") {
      setSubmitError(result.message);
      return;
    }
    router.push(`/sponsorships/${encodeURIComponent(result.campaign.id)}`);
  }

  return (
    <main className="max-w-2xl mx-auto px-6 py-12">
      <h1 className="text-2xl font-semibold mb-6">New sponsorship</h1>
      <AdvertiserNav current="sponsorships" />
      <p className="text-sm text-muted mb-8">
        A sponsorship funds Developer Rewards for developers who complete your offer. It&apos;s saved as a
        draft; submit it for DevAds review from the campaign page once it has an offer.
      </p>
      <SponsorshipCampaignForm
        values={values}
        errors={errors}
        submitting={submitting}
        submitError={submitError}
        onChange={setValues}
        onSubmit={onSubmit}
      />
    </main>
  );
}
