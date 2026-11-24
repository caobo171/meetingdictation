/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@md/core'],
  serverExternalPackages: ['@prisma/client', 'bcryptjs'],
};
export default nextConfig;
