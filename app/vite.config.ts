import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

/* The Gemini key never lives in this (public) repository. Unless it is already
   in the environment, it is read from %USERPROFILE%\.site-khata\gemini.env
   (GEMINI_API_KEY=...) and baked into the build as VITE_GEMINI_KEY. */
if (!process.env.VITE_GEMINI_KEY) {
  const f = join(homedir(), '.site-khata', 'gemini.env')
  const m = existsSync(f) ? readFileSync(f, 'utf8').match(/GEMINI_API_KEY=(\S+)/) : null
  if (m) process.env.VITE_GEMINI_KEY = m[1]
}

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', assetsDir: 'assets', target: 'es2020', sourcemap: false },
})
