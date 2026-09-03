import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DevAds Admin",
  description: "Campaign approval and platform analytics.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans min-h-screen">{children}</body>
    </html>
  );
}
