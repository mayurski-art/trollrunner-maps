import type { Metadata, Viewport } from "next";
import { DM_Sans, DM_Mono } from "next/font/google";
import Script from "next/script";
import { SessionProvider } from "@/lib/accounts/session-context";
import "./globals.css";

const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"] });
const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const DESCRIPTION =
  "A living map of the troll diaspora. Drop a pin where you're from and see every other troll on the globe.";

export const metadata: Metadata = {
  metadataBase: new URL("https://maps.trollrunner.net"),
  title: "TrollRunner Maps",
  description: DESCRIPTION,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "TrollRunner Maps",
  },
  openGraph: {
    title: "TrollRunner Maps",
    description: DESCRIPTION,
    url: "https://maps.trollrunner.net",
    siteName: "TrollRunner Maps",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TrollRunner Maps",
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#05070c",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${dmSans.variable} ${dmMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        {/* Rewrites the "back to the Island" link to a same-origin path once
            this site is served through the front door, so that hop keeps
            the native page transition instead of hard-cutting cross-origin.
            Inert (and harmless) until then — see troll-frontdoor.js. */}
        <Script src="https://trollrunner.net/assets/js/troll-frontdoor.js" strategy="afterInteractive" />
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
