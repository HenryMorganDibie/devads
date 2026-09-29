import Link from "next/link";

export type AdvertiserNavKey = "campaigns" | "sponsorships";

const ITEMS: Array<{ key: AdvertiserNavKey; href: string; label: string }> = [
  { key: "campaigns", href: "/campaigns", label: "Ad Campaigns" },
  { key: "sponsorships", href: "/sponsorships", label: "Sponsorships" },
];

/** Links between the advertiser's two products: Ad Campaigns and Sponsorships (Developer Rewards). */
export function AdvertiserNav({ current }: { current: AdvertiserNavKey }) {
  return (
    <nav aria-label="Advertiser pages" className="flex flex-wrap gap-1 text-sm mb-8">
      {ITEMS.map((item) =>
        item.key === current ? (
          <span key={item.key} aria-current="page" className="px-3 py-1.5 rounded-md bg-white/10 text-white">
            {item.label}
          </span>
        ) : (
          <Link key={item.key} href={item.href} className="px-3 py-1.5 rounded-md text-muted hover:text-white">
            {item.label}
          </Link>
        )
      )}
    </nav>
  );
}
