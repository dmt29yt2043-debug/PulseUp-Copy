import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pulse \u2014 events",
  description: "Discover the best events and activities near you",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossOrigin=""
        />
      </head>
      <body className="min-h-screen flex flex-col bg-[#f5f5f5]">
        {children}
      </body>
    </html>
  );
}
