import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '5mb',
    },
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
  webpack(config, { isServer }) {
    if (isServer) {
      // Rename SSR chunks to avoid brackets in filenames
      // which cause glob issues on Windows in opennextjs/cloudflare
      const original = config.output?.chunkFilename as string | undefined
      config.output = {
        ...config.output,
        chunkFilename: (pathData: { chunk?: { name?: string } }) => {
          const name = pathData.chunk?.name ?? ''
          const safe = name.replace(/[[\]]/g, '_')
          return `server/chunks/ssr/${safe}.[contenthash:8].js`
        },
      }
      void original
    }
    return config
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
    ]
  },
};

export default nextConfig;
