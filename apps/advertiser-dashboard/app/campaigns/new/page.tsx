"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, apiUpload, loadSession } from "../../../lib/api";

function csv(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export default function NewCampaignPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [cpm, setCpm] = useState("15");
  const [dailyBudget, setDailyBudget] = useState("");
  const [totalBudget, setTotalBudget] = useState("");
  const [languages, setLanguages] = useState("");
  const [frameworks, setFrameworks] = useState("");
  const [countries, setCountries] = useState("");
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [ctaLabel, setCtaLabel] = useState("Learn more");
  const [ctaUrl, setCtaUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    setPreviewUrl(selected ? URL.createObjectURL(selected) : null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const session = loadSession();
    if (!session) return;
    setLoading(true);

    const createRes = await apiPost<{ id: string; error?: string }>("/api/v1/campaigns", {
      advertiserId: session.advertiserId,
      name,
      cpmCents: Math.round(parseFloat(cpm) * 100),
      currency: "USD",
      dailyBudgetCents: dailyBudget ? Math.round(parseFloat(dailyBudget) * 100) : undefined,
      totalBudgetCents: totalBudget ? Math.round(parseFloat(totalBudget) * 100) : undefined,
      targets: {
        languages: csv(languages),
        frameworks: csv(frameworks),
        countries: csv(countries),
      },
    });

    if (!createRes.ok) {
      setError("Could not create campaign.");
      setLoading(false);
      return;
    }
    const campaignId = createRes.data.id;

    let uploadFields: { imageKey?: string; mimeType?: string; sizeBytes?: number } = {};
    if (file) {
      const uploadRes = await apiUpload<{ key: string; mimeType: string; sizeBytes: number; error?: string }>(
        `/api/v1/campaigns/${campaignId}/upload?kind=IMAGE`,
        file
      );
      if (!uploadRes.ok) {
        setError(
          uploadRes.data.error === "unsupported_mime_type"
            ? "That file type isn't supported (use PNG, JPEG, WebP, or GIF)."
            : uploadRes.data.error === "file_too_large"
              ? "That file is too large (max 5MB)."
              : "Image upload failed."
        );
        setLoading(false);
        return;
      }
      uploadFields = {
        imageKey: uploadRes.data.key,
        mimeType: uploadRes.data.mimeType,
        sizeBytes: uploadRes.data.sizeBytes,
      };
    }

    const creativeRes = await apiPost(`/api/v1/campaigns/${campaignId}/creatives`, {
      type: "IMAGE",
      headline,
      body: body || undefined,
      ctaLabel,
      ctaUrl,
      ...uploadFields,
    });

    if (!creativeRes.ok) {
      setError("Campaign created, but the creative could not be saved. Edit it before submitting for review.");
      setLoading(false);
      return;
    }

    await apiPost(`/api/v1/campaigns/${campaignId}/submit`, {});

    setLoading(false);
    router.push("/campaigns");
  }

  return (
    <main className="max-w-2xl mx-auto px-6 py-12">
      <h1 className="text-2xl font-semibold mb-2">New campaign</h1>
      <p className="text-sm text-muted mb-8">
        Submitted campaigns go into the admin review queue before they start serving.
      </p>

      <form onSubmit={onSubmit} className="space-y-8">
        <fieldset className="card p-6 space-y-4">
          <legend className="font-medium px-1">Campaign</legend>
          <input className="input" placeholder="Campaign name" value={name} onChange={(e) => setName(e.target.value)} required />
          <div className="grid grid-cols-3 gap-4">
            <Field label="CPM (USD)">
              <input className="input" type="number" min="0.01" step="0.01" value={cpm} onChange={(e) => setCpm(e.target.value)} required />
            </Field>
            <Field label="Daily budget (USD, optional)">
              <input className="input" type="number" min="0" step="0.01" value={dailyBudget} onChange={(e) => setDailyBudget(e.target.value)} />
            </Field>
            <Field label="Total budget (USD, optional)">
              <input className="input" type="number" min="0" step="0.01" value={totalBudget} onChange={(e) => setTotalBudget(e.target.value)} />
            </Field>
          </div>
        </fieldset>

        <fieldset className="card p-6 space-y-4">
          <legend className="font-medium px-1">Targeting</legend>
          <Field label="Languages (comma-separated, blank = all)">
            <input className="input" placeholder="typescript, rust" value={languages} onChange={(e) => setLanguages(e.target.value)} />
          </Field>
          <Field label="Frameworks">
            <input className="input" placeholder="next.js, react" value={frameworks} onChange={(e) => setFrameworks(e.target.value)} />
          </Field>
          <Field label="Countries (ISO codes)">
            <input className="input" placeholder="US, GB, NG" value={countries} onChange={(e) => setCountries(e.target.value)} />
          </Field>
        </fieldset>

        <fieldset className="card p-6 space-y-4">
          <legend className="font-medium px-1">Creative</legend>
          <input className="input" placeholder="Headline" value={headline} onChange={(e) => setHeadline(e.target.value)} required maxLength={200} />
          <textarea className="input" placeholder="Body (optional)" value={body} onChange={(e) => setBody(e.target.value)} rows={2} maxLength={500} />
          <div className="grid grid-cols-2 gap-4">
            <input className="input" placeholder="CTA label" value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} required />
            <input className="input" type="url" placeholder="https://yourproduct.com" value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} required />
          </div>
          <div>
            <span className="text-xs text-muted block mb-1">Image (optional, PNG/JPEG/WebP/GIF, max 5MB)</span>
            <input
              className="input"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={onFileChange}
            />
          </div>
          {previewUrl && (
            <div className="pt-2">
              <p className="text-xs text-muted mb-2">Creative preview</p>
              <div className="card p-3 max-w-xs">
                <p className="text-[10px] uppercase tracking-wide text-muted mb-1">Sponsored</p>
                <img src={previewUrl} alt="Creative preview" className="rounded mb-2 max-h-24 object-cover" />
                <p className="text-sm font-medium">{headline || "Your headline here"}</p>
                {body && <p className="text-xs text-muted mt-1">{body}</p>}
                <p className="text-xs text-accent mt-2">{ctaLabel || "Learn more"}</p>
              </div>
            </div>
          )}
        </fieldset>

        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? "Submitting..." : "Create & submit for review"}
        </button>
      </form>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-muted block mb-1">{label}</span>
      {children}
    </label>
  );
}
