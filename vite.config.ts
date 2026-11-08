import fs from 'node:fs';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {defineConfig, type Plugin} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

function resolveTsExtensionPlugin(): Plugin {
  return {
      name: 'resolve-ts-extension',
          enforce: 'pre',
              resolveId(source, importer) {
                    if (!importer || !source.endsWith('.js')) {
                            return null;
                                  }

                                        let candidate = '';
                                              if (source.startsWith('.')) {
                                                      candidate = path.resolve(path.dirname(importer), source);
                                                            } else if (source.startsWith('@/')) {
                                                                    candidate = path.resolve(__dirname, source.slice(2));
                                                                          } else {
                                                                                  return null;
                                                                                        }

                                                                                              if (fs.existsSync(candidate)) {
                                                                                                      return null;
                                                                                                            }

                                                                                                                  const basePath = candidate.slice(0, -3);
                                                                                                                        if (fs.existsSync(`${basePath}.ts`)) {
                                                                                                                                return `${basePath}.ts`;
                                                                                                                                      }
                                                                                                                                            if (fs.existsSync(`${basePath}.tsx`)) {
                                                                                                                                                    return `${basePath}.tsx`;
                                                                                                                                                          }
                                                                                                                                                                if (fs.existsSync(path.join(basePath, 'index.ts'))) {
                                                                                                                                                                        return path.join(basePath, 'index.ts');
                                                                                                                                                                              }
                                                                                                                                                                                    if (fs.existsSync(path.join(basePath, 'index.tsx'))) {
                                                                                                                                                                                            return path.join(basePath, 'index.tsx');
                                                                                                                                                                                                  }
                                                                                                                                                                                                        return null;
                                                                                                                                                                                                            },
                                                                                                                                                                                                              };
                                                                                                                                                                                                              }

                                                                                                                                                                                                              export default defineConfig(() => {
                                                                                                                                                                                                                return {
                                                                                                 plugins: [
        resolveTsExtensionPlugin(),
        react(),
        tailwindcss(),
        VitePWA({
          registerType: 'autoUpdate',
          manifest: false,
          workbox: {
            maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10MB
            globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,glb,gltf,bin}'],
            cleanupOutdatedCaches: true,
            clientsClaim: true,
            skipWaiting: true
          }
        })
      ],
                                                                                                                                                                                                                        define: {
                                                                                                                                                                                                                              'process.env': JSON.stringify({
                                                                                                                                                                                                                                      GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
                                                                                                                                                                                                                                            }),
                                                                                                                                                                                                                                                  global: 'globalThis',
                                                                                                                                                                                                                                                      },
                                                                                                                                                                                                                                                          resolve: {
                                                                                                                                                                                                                                                                alias: {
                                                                                                                                                                                                                                                                        '@': path.resolve(__dirname, '.'),
                                                                                                                                                                                                                                                                                'cross-fetch': path.resolve(__dirname, './src/utils/fetch-shim.ts'),
                                                                                                                                                                                                                                                                                      },
                                                                                                                                                                                                                                                                                          },
                                                                                                                                                                                                                                                                                              server: {
                                                                                                                                                                                                                                                                                                    port: 3000,
                                                                                                                                                                                                                                                                                                          host: '0.0.0.0',
                                                                                                                                                                                                                                                                                                                // HMR is disabled in AI Studio via DISABLE_HMR env var.
                                                                                                                                                                                                                                                                                                                      // Do not modify—file watching is disabled to prevent flickering during agent edits.
                                                                                                                                                                                                                                                                                                                            hmr: false,
                                                                                                                                                                                                                                                                                                                                  watch: null,
                                                                                                                                                                                                                                                                                                                                      },
                                                                                                                                                                                                                                                                                                                                        };
                                                                                                                                                                                                                                                                                                                                        });
                                                                                                                                                                                                                                                                                                                                        