import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    tailwindcss(),
    reactRouter(),
    tsconfigPaths(),
    // The service worker is app/sw.ts. It runs after React Router has written build/client/index.html, so the app shell is in its
    // precache list. The manifest stays as public/manifest.webmanifest. config.json is written after the build and is never precached.
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'app',
      filename: 'sw.ts',
      injectRegister: false,
      manifest: false,
      outDir: 'build/client',
      injectManifest: {
        globDirectory: 'build/client',
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,woff2}'],
        globIgnores: ['config.json', 'index.js'],
      },
    }),
  ],
  server: {
    fs: {
      // Allow serving files from one level up to the project root
      allow: ['..']
    }
  },
});
