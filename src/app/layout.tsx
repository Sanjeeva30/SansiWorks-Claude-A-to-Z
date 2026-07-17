import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SansiWorks — Sansico Group",
  description: "Sansico Group's project management workspace",
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
