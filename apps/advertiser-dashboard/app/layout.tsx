import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DevAds Advertiser Dashboard",
  description: "Create and manage DevAds campaigns.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans min-h-screen">{children}</body>
    </html>
  );
}
