import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "X — Something big is on its way",
  description: "Register before the city finds out.",
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
