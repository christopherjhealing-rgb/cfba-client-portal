import type { Metadata, Viewport } from "next";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/archivo/500.css";
import "@fontsource/archivo/600.css";
import "@fontsource/archivo/700.css";
import "@fontsource/ibm-plex-mono/500.css";
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
      <head>
        {/* First-landing-only entrance cascade (DESIGN.md §17). Runs before
            paint; delete this script to revert to always-animate. */}
        <script dangerouslySetInnerHTML={{ __html:
          "try{if(sessionStorage.cfbaSeen)document.documentElement.classList.add('no-cascade');sessionStorage.cfbaSeen='1'}catch(e){}",
        }} />
      </head>
      <body className="min-h-screen font-body antialiased">{children}</body>
    </html>
  );
}
