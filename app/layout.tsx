import type { Metadata, Viewport } from "next";
import "./globals.css";

/**
 * Where relative metadata URLs resolve from. Without it the Open Graph image
 * is advertised as living on localhost, which is exactly the link preview a
 * teaser cannot afford — set NEXT_PUBLIC_SITE_URL to override, otherwise
 * Vercel's production domain, otherwise the dev server.
 */
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  /* What a shared link says about itself. Both lines carried the teaser, and
     the teaser is over — the countdown has run and the run is announced, so
     the preview names the thing rather than hinting at it. */
  title: "NYX Turns X (Ten) · 4th–13th Sept",
  description: "Five nights, one decade — Guwahati’s wildest celebration.",
};

export const viewport: Viewport = {
  themeColor: "#000000",
  // Lets the layout reach under the notch and home indicator — without this
  // the env(safe-area-inset-*) padding in globals.css all resolves to 0.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
