import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/* No secret is ever read here. An APK is a public file — this one is
   published from a public repository — so anything baked into the bundle at
   build time is published with it, and Google cancels keys it finds there.
   The AI key is typed into the app's Settings and kept on the phone. */
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', assetsDir: 'assets', target: 'es2020', sourcemap: false },
})
