import type { Metadata } from "next";
import { Geist_Mono, Nunito } from "next/font/google";

import "./globals.css";

const nunito = Nunito({
  variable: "--font-cartoon",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800", "900"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "StarOps — Star Champs Indonesia",
    template: "%s | StarOps",
  },
  description:
    "Sistem Operasional Internal, Inventaris Alat Terapi, Barcode Studio, Subscription Vault, Arsip Hibrida, Pengiriman & Backup Bulanan Star Champs Indonesia.",
  icons: {
    icon: [{ url: "/favicon.ico", sizes: "any" }],
    shortcut: "/favicon.ico",
    apple: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className={`${nunito.variable} ${geistMono.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
