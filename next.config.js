/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fully static, client-only app — trivial to host on Vercel (or anywhere).
  output: 'export',
  reactStrictMode: true,
  images: { unoptimized: true },
}

module.exports = nextConfig
