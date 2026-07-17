import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@personal-os/config',
    '@personal-os/database-contracts',
    '@personal-os/domain',
    '@personal-os/sync-contracts',
    '@personal-os/utils',
    '@personal-os/validation',
  ],
};

export default nextConfig;
