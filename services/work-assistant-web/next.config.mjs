/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  experimental: {
    appDir: true,
  },
  // Disable static generation to prevent SSR timeout during build
  generateBuildId: async () => {
    return 'build-' + Date.now()
  },
};

export default nextConfig;
