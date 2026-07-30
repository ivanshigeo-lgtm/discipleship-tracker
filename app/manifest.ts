import type { MetadataRoute } from "next";

// Web app manifest — lets phones "Add to Home Screen" and launch Constellation
// full-screen (no browser chrome), with the GBM flame icon. Colors match the
// cosmic app background (--space #0B1027) so the launch/splash feels native.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Constellation — Grace Bible Maui",
    short_name: "Constellation",
    description: "Helping people grow through the 4E process",
    start_url: "/",
    display: "standalone",
    background_color: "#0B1027",
    theme_color: "#0B1027",
    orientation: "portrait",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
