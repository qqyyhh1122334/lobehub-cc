import path from 'node:path';

import { DevTools } from '@vitejs/devtools';
import type { PluginOption } from 'vite';
import { defineConfig, loadEnv } from 'vite';

import { INTRANET_CSP } from './src/security/intranet/browserPolicy';
import { viteEnvRestartKeys } from './plugins/vite/envRestartKeys';
import {
  createSharedRolldownOutput,
  sharedModulePreload,
  sharedOptimizeDeps,
  sharedRendererDefine,
  sharedRendererPlugins,
} from './plugins/vite/sharedRendererConfig';

const isMobile = process.env.MOBILE === 'true';
const mode = process.env.NODE_ENV === 'production' ? 'production' : 'development';

Object.assign(process.env, loadEnv(mode, process.cwd(), ''));

const isDev = process.env.NODE_ENV !== 'production';
const platform = isMobile ? 'mobile' : 'web';
const enableViteDevTools = process.env.LOBE_VITE_DEVTOOLS === 'true';
const browserSecurityHeaders = {
  'Content-Security-Policy': INTRANET_CSP,
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-DNS-Prefetch-Control': 'off',
};

export default defineConfig({
  base: isDev ? '/' : '/_spa/',
  build: {
    modulePreload: sharedModulePreload,
    outDir: isMobile ? 'dist/mobile' : 'dist/desktop',
    reportCompressedSize: false,
    rolldownOptions: {
      ...(enableViteDevTools && { devtools: {} }),
      input: path.resolve(__dirname, isMobile ? 'index.mobile.html' : 'index.html'),
      output: createSharedRolldownOutput({ strictExecutionOrder: true }),
    },
  },
  define: sharedRendererDefine({ isMobile, isElectron: false }),
  experimental: {
    bundledDev: false,
  },
  resolve: {
    tsconfigPaths: true,
  },
  optimizeDeps: sharedOptimizeDeps,
  plugins: [
    viteEnvRestartKeys(['APP_URL']),
    enableViteDevTools &&
      DevTools({
        build: {
          withApp: true,
        },
      }),
    ...sharedRendererPlugins({ platform }),
  ].filter(Boolean) as PluginOption[],

  preview: { headers: browserSecurityHeaders },

  server: {
    cors: true,
    headers: browserSecurityHeaders,
    host: true,
    port: 9876,
    proxy: {
      '/api': `http://localhost:${process.env.PORT || 3010}`,
      '/oidc': `http://localhost:${process.env.PORT || 3010}`,
      '/trpc': `http://localhost:${process.env.PORT || 3010}`,
      '/webapi': `http://localhost:${process.env.PORT || 3010}`,
    },
    warmup: {
      clientFiles: [
        // src/ business code
        './src/initialize.ts',
        './src/spa/**/*.tsx',
        './src/business/**/*.{ts,tsx}',
        './src/components/**/*.{ts,tsx}',
        './src/config/**/*.ts',
        './src/const/**/*.ts',
        './src/envs/**/*.ts',
        './src/features/**/*.{ts,tsx}',
        './src/helpers/**/*.ts',
        './src/hooks/**/*.{ts,tsx}',
        './src/layout/**/*.{ts,tsx}',
        './src/libs/**/*.{ts,tsx}',
        './src/locales/**/*.ts',
        './src/routes/**/*.{ts,tsx}',
        './src/services/**/*.ts',
        './src/store/**/*.{ts,tsx}',
        './src/styles/**/*.ts',
        './src/utils/**/*.{ts,tsx}',

        // monorepo packages
        './packages/types/src/**/*.ts',
        './packages/const/src/**/*.ts',
        './packages/utils/src/**/*.ts',
        './packages/context-engine/src/**/*.ts',
        './packages/prompts/src/**/*.ts',
        './packages/model-bank/src/**/*.ts',
        './packages/model-runtime/src/**/*.ts',
        './packages/agent-runtime/src/**/*.ts',
        './packages/conversation-flow/src/**/*.ts',
        './packages/electron-client-ipc/src/**/*.ts',
        './packages/builtin-agents/src/**/*.ts',
        './packages/builtin-skills/src/**/*.ts',
        './packages/builtin-tool-*/src/**/*.ts',
        './packages/builtin-tools/src/**/*.ts',
        './packages/business/*/src/**/*.ts',
        './packages/config/src/**/*.ts',
        './packages/edge-config/src/**/*.ts',
        './packages/editor-runtime/src/**/*.ts',
        './packages/fetch-sse/src/**/*.ts',
        './packages/desktop-bridge/src/**/*.ts',
        './packages/python-interpreter/src/**/*.ts',
        './packages/agent-manager-runtime/src/**/*.ts',
      ],
    },
  },
});
