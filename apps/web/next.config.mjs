/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@md/core'],
  serverExternalPackages: ['@prisma/client', 'bcryptjs'],
  // The blog admin first lived inside the learner app.
  async redirects() {
    return [{ source: '/app/admin/:path*', destination: '/admin/:path*', permanent: true }];
  },
};
export default nextConfig;
