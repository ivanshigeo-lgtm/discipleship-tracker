import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @ffmpeg-installer does dynamic platform requires the bundler can't follow —
  // load it at runtime from node_modules instead of bundling it.
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg"],
  // …and make sure the binary + its platform packages ship with the function.
  outputFileTracingIncludes: {
    "/api/video/transcode": ["./node_modules/@ffmpeg-installer/**/*"],
  },
};

export default nextConfig;
