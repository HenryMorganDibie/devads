"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { loadSession } from "../../../lib/api";
import {
  addSponsoredOffer,
  emptyOfferForm,
  fetchSponsorshipCampaign,
  submitSponsorshipCampaign,
  validateOffer,
  type FormErrors,
  type OfferFormValues,
} from "../../../lib/sponsorships";
import { AdvertiserNav } from "../../../components/AdvertiserNav";
import { SponsorshipCampaignDetail, type CampaignDetailState } from "../../../components/SponsorshipCampaignDetail";

export default function SponsorshipDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";
  const [state, setState] = useState<CampaignDetailState>({ status: "loading" });
  const [offerForm, setOfferForm] = useState<OfferFormValues>(emptyOfferForm);
  const [offerErrors, setOfferErrors] = useState<FormErrors>({});
  const [offerSubmitting, setOfferSubmitting] = useState(false);
  const [offerError, setOfferError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = useCallback(() => {
    const session = loadSession();
    if (!session?.advertiserId) {
      router.push("/login");
      return;
    }
    setState({ status: "loading" });
    fetchSponsorshipCampaign(session.advertiserId, id).then(setState);
  }, [router, id]);

  useEffect(() => {
    load();
  }, [load]);

  async function onAddOffer() {
    setOfferError(null);
    const built = validateOffer(offerForm);
    if (!built.ok) {
      setOfferErrors(built.errors);
      return;
    }
    setOfferErrors({});
    setOfferSubmitting(true);
    const result = await addSponsoredOffer(id, built.payload);
    setOfferSubmitting(false);
    if (result.status === "unauthenticated") setState({ status: "unauthenticated" });
    else if (result.status === "error") setOfferError(result.message);
    else {
      setOfferForm(emptyOfferForm());
      // The add-offer response has no stats; reload so performance stays accurate.
      load();
    }
  }

  async function onSubmitCampaign() {
    setSubmitError(null);
    setSubmitting(true);
    const result = await submitSponsorshipCampaign(id);
    setSubmitting(false);
    if (result.status === "unauthenticated") setState({ status: "unauthenticated" });
    else if (result.status === "error") setSubmitError(result.message);
    else load();
  }

  return (
    <main className="max-w-4xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Sponsorship</h1>
        <Link href="/sponsorships" className="text-sm text-muted hover:text-white">
          All sponsorships
        </Link>
      </div>
      <AdvertiserNav current="sponsorships" />
      <SponsorshipCampaignDetail
        state={state}
        onRetry={load}
        offerForm={offerForm}
        offerErrors={offerErrors}
        offerSubmitting={offerSubmitting}
        offerError={offerError}
        onOfferChange={setOfferForm}
        onAddOffer={onAddOffer}
        submitting={submitting}
        submitError={submitError}
        onSubmitCampaign={onSubmitCampaign}
      />
    </main>
  );
}
