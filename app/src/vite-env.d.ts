declare module '*.css'

interface ImportMetaEnv {
  readonly VITE_SYNC_ENDPOINT?: string
  readonly VITE_SYNC_TOKEN?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
