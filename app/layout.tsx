import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CF Building Approvals — Client Portal",
  description: "Track your applications and download your certificates.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU">
      <body className="min-h-screen font-body antialiased">{children}</body>
    </html>
  );
}
