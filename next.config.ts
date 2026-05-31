import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
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
};

export default nextConfig;
