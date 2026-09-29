import type { Metadata } from "next";
import { AppShell } from "../../components/AppShell";

export const metadata: Metadata = { title: "DevAds Developer Beta", robots: { index: false } };

export default function DeveloperAppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
