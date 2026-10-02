declare module '*.css'

interface ImportMetaEnv {
  readonly VITE_SYNC_ENDPOINT?: string
  readonly VITE_SYNC_TOKEN?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*?raw' { const text: string; export default text }
declare module '*?url' { const url: string; export default url }
declare module 'sql.js' {
  interface Statement { bind(v: unknown[]): boolean; step(): boolean; getAsObject(): Record<string, unknown>; free(): void }
  interface Database { exec(sql: string): unknown; run(sql: string, params?: unknown[]): Database; prepare(sql: string): Statement; close(): void }
  export interface SqlJsStatic { Database: new () => Database }
  export default function initSqlJs(config?: { locateFile?: (file: string) => string }): Promise<SqlJsStatic>
}
