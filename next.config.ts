import type { NextConfig } from 'next'
import path from 'path'

const envOrigins =
  process.env.NEXT_DEV_ALLOWED_ORIGINS?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean) ?? []

const localNetworkOrigins = ['192.168.1.118']

const allowedDevOrigins = Array.from(new Set([...localNetworkOrigins, ...envOrigins]))

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  reactCompiler: true,
  allowedDevOrigins,
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'speedroller.vercel.app' }],
        destination: 'https://speedroller.threenix.io/:path*',
        permanent: true,
      },
    ]
  },
  experimental: {
    cssChunking: true,
    turbopackFileSystemCacheForDev: false,
  },
  turbopack: {
    root: path.join(__dirname),
  },
}

export default nextConfig
