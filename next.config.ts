import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: "/tmp/symmetry-app",
  },
  // Enable React strict mode for better development experience
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'mkfiginpiesospsnktea.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

export default nextConfig;
