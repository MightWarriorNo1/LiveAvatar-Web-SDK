/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@heygen/liveavatar-web-sdk'],
  experimental: {
    // Allow larger request bodies when proxy is used (e.g. for /api/analyze-image uploads)
    proxyClientMaxBodySize: '10mb',
  },
};

export default nextConfig;
