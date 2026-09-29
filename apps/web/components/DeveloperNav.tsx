import Link from "next/link";

export type DeveloperNavKey = "earnings" | "rewards" | "sponsorships";

const ITEMS: Array<{ key: DeveloperNavKey; href: string; label: string }> = [
  { key: "earnings", href: "/dashboard", label: "Ad earnings" },
  { key: "rewards", href: "/rewards", label: "Developer Rewards" },
  { key: "sponsorships", href: "/sponsorships", label: "Sponsorships" },
];

/** Links between the signed-in developer pages. */
export function DeveloperNav({ current }: { current: DeveloperNavKey }) {
  return (
    <nav aria-label="Developer pages" className="flex flex-wrap gap-1 text-sm mb-8">
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
