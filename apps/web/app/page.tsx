import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="max-w-5xl mx-auto px-6 py-20">
      <nav className="flex items-center justify-between mb-24">
        <span className="font-semibold tracking-tight text-lg">DevAds</span>
        <div className="flex gap-3 text-sm">
          <Link href="/login" className="text-muted hover:text-white px-3 py-2">
            Sign in
          </Link>
          <Link href="/signup" className="btn-primary text-sm">
            Get the extension
          </Link>
        </div>
      </nav>

      <h1 className="text-5xl font-semibold tracking-tight leading-tight max-w-3xl">
        Turn developer wait time into value.
      </h1>
      <p className="mt-6 text-lg text-muted max-w-2xl">
        DevAds shows a small, tasteful sponsored card during builds, installs, and tests you were
        already waiting on &mdash; never before, never longer. Developers opt in, get paid a share of
        the revenue, and can turn it off in one click.
      </p>

      <div className="mt-10 flex gap-4">
        <Link href="/signup" className="btn-primary">
          Get the extension
        </Link>
        <Link href="/advertise" className="card px-4 py-2 text-sm hover:border-white/20">
          Advertise with DevAds
        </Link>
      </div>

      <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card p-6">
          <h3 className="font-medium mb-2">Never slower</h3>
          <p className="text-sm text-muted">
            If your command finishes before the minimum wait threshold, you never see an ad. DevAds
            never delays a build to sell an impression.
          </p>
        </div>
        <div className="card p-6">
          <h3 className="font-medium mb-2">Opt-in and transparent</h3>
          <p className="text-sm text-muted">
            Enable, disable, or filter by category any time. See exactly what data is collected on
            the privacy page &mdash; source code and secrets are never touched.
          </p>
        </div>
        <div className="card p-6">
          <h3 className="font-medium mb-2">Get paid</h3>
          <p className="text-sm text-muted">
            Developers earn a configurable share of ad revenue for qualified views, tracked in a
            transparent earnings ledger.
          </p>
        </div>
      </div>

      <p className="mt-16 text-xs text-muted">
        Demo campaigns in this environment are clearly labeled (DEMO) and use fictional advertisers.
      </p>
    </main>
  );
}
