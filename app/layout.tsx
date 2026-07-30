import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "../components/Providers";

export const metadata: Metadata = {
  title: "Constellation — Grace Bible Maui",
  description: "Helping people grow through the 4E process",
  // Make "Add to Home Screen" launch full-screen and app-like on iOS.
  appleWebApp: {
    capable: true,
    title: "Constellation",
    statusBarStyle: "black",
  },
};

// themeColor / viewport must live in the viewport export (not metadata).
export const viewport: Viewport = {
  themeColor: "#0B1027",
  width: "device-width",
  initialScale: 1,
};

// Prevent Vercel's edge from caching stale HTML that references an old JS
// bundle after a deploy — same fix already applied to app/my-journey/layout.tsx.
// Without this, deployed UI changes don't appear until the cache expires.
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        {/* Every page's data comes from Supabase — start the TLS handshake
            before the JS bundle even finishes parsing. */}
        <link rel="preconnect" href="https://yddjlhdptsundeimugba.supabase.co" crossOrigin="anonymous" />
      </head>
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
