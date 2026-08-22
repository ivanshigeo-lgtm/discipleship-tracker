import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @ffmpeg-installer does dynamic platform requires the bundler can't follow —
  // load it at runtime from node_modules instead of bundling it.
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg"],
  // …and make sure the binary + its platform packages ship with the function.
  outputFileTracingIncludes: {
    "/api/video/transcode": ["./node_modules/@ffmpeg-installer/**/*"],
  },
  // WikiChurch brochure is a self-contained public/site/index.html.
  // beforeFiles so /site and /site/ win before any app or catch-all route.
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/site", destination: "/site/index.html" },
        { source: "/site/", destination: "/site/index.html" },
      ],
    };
  },
};

export default nextConfig;
