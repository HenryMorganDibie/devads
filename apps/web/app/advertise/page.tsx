export default function AdvertisePage() {
  const advertiserAppUrl = process.env.NEXT_PUBLIC_ADVERTISER_APP_URL ?? "http://localhost:3001";

  return (
    <main className="max-w-3xl mx-auto px-6 py-24">
      <h1 className="text-4xl font-semibold tracking-tight mb-6">Reach developers while they're already waiting.</h1>
      <p className="text-muted mb-8 max-w-xl">
        DevAds places a single, tasteful sponsored card during a build, install, or test run &mdash;
        never adding time to the wait. Target by language, framework, runtime, platform, and country.
      </p>
      <ul className="text-sm text-muted space-y-2 mb-10 list-disc pl-5">
        <li>Static, sponsored-card, and video creative formats</li>
        <li>Contextual targeting, no invasive behavioral tracking</li>
        <li>CPM pricing, self-serve campaign creation, admin-reviewed approval</li>
      </ul>
      <a href={advertiserAppUrl} className="btn-primary inline-block">
        Create an advertiser account
      </a>
    </main>
  );
}
