/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@md/core'],
  experimental: { serverComponentsExternalPackages: ['@prisma/client', 'bcryptjs'] },
};
export default nextConfig;
