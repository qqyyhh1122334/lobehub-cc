import { defineConfig } from './src/libs/next/config/define-config';

const nextConfig = defineConfig({
  experimental: { cpus: 2, webpackBuildWorker: true, webpackMemoryOptimizations: true },
});

export default nextConfig;
