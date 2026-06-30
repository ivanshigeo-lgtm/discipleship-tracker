import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Bundle the ffmpeg binary into the transcode function so it can run on Vercel.
  outputFileTracingIncludes: {
    "/api/video/transcode": ["./node_modules/@ffmpeg-installer/**/*"],
  },
};

export default nextConfig;
