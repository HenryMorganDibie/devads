import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DevAds — Turn developer wait time into value",
  description: "A developer advertising network that monetizes naturally occurring wait time.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans min-h-screen">{children}</body>
    </html>
  );
}
