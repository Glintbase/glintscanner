/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    // Local fallback storage proxy — only in development
    if (process.env.NODE_ENV === 'production' && process.env.ENABLE_FALLBACK_STORAGE !== 'true') {
      return [];
    }
    if (process.env.DISABLE_FALLBACK_STORAGE === 'true') {
      return [];
    }
    return [
      {
        source: '/api/fallback-storage/:path*',
        destination: 'http://127.0.0.1:8000/api/fallback-storage/:path*',
      },
    ];
  },
};

export default nextConfig;
