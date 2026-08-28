/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  typescript: {
    tsconfigPath: './tsconfig.json',
  },
  // Permitir API calls a localhost durante desarrollo
  env: {
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001',
  },
  async redirects() {
    return [
      { source: '/casos', destination: '/dashboard/casos', permanent: true },
      { source: '/casos/:id', destination: '/dashboard/casos/:id', permanent: true },
    ]
  },
}

module.exports = nextConfig
