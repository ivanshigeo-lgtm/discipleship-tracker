import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Constellation — Grace Bible Maui",
  description: "Helping people grow through the 4E process",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
