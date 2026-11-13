import type { Metadata, Viewport } from "next";
import { Bebas_Neue, DM_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { NavWrapper } from "@/components/setdrop/NavWrapper";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import { FeedbackWidget } from "@/components/setdrop/FeedbackWidget";
import { BRAND } from "@/lib/brand";

const bebasNeue = Bebas_Neue({
  weight: "400",
  variable: "--font-display",
  subsets: ["latin"],
});

const dmMono = DM_Mono({
  weight: ["300", "400", "500"],
  style: ["normal", "italic"],
  variable: "--font-mono",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  weight: ["300", "400", "500", "600"],
  variable: "--font-body",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: `${BRAND.name} — From library to setlist`,
  description: "AI DJ prep: build sets and crates from your own library, export to Serato or Rekordbox (XML or M3U), and move from Serato to Rekordbox free with your hot cues.",
  openGraph: {
    title: `${BRAND.name} — From library to setlist`,
    description: "AI DJ prep: build sets and crates from your own library, export to Serato or Rekordbox (XML or M3U), and move from Serato to Rekordbox free with your hot cues.",
    siteName: BRAND.name,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${bebasNeue.variable} ${dmMono.variable} ${spaceGrotesk.variable}`}>
      <body style={{ background: "#0A0A0A", margin: 0, padding: 0 }}>
        <GoogleAnalytics />
        <NavWrapper />
        {children}
        <FeedbackWidget />
      </body>
    </html>
  );
}
