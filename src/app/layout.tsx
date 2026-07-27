import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegister } from "./sw-register";
import { RecoveryRedirect } from "@/components/recovery-redirect";

export const metadata: Metadata = {
  title: "SansiWorks — Sansico Group",
  description: "Sansico Group's project management workspace",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "SansiWorks" },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#7A0D20",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {/* A password-recovery link can land on any route (Supabase falls back
            to the Site URL, and the proxy may bounce to /login) — the fragment
            survives those redirects, so handle it app-wide. */}
        <RecoveryRedirect />
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
