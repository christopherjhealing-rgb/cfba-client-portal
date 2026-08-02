import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CF Building Approvals — Client Portal",
  description: "Track your applications and download your certificates.",
  robots: { index: false, follow: false },
  // "Add to Home Screen" installs an app-like icon and standalone window.
  // Deliberately no service worker — job status must never be stale cache.
  manifest: "/manifest.json",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
  appleWebApp: { title: "CFBA Portal" },
};

export const viewport: Viewport = {
  themeColor: "#12332A",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU">
      <body className="min-h-screen font-body antialiased">{children}</body>
    </html>
  );
}
