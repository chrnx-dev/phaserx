import { defineConfig } from 'vite'

/**
 * `target: 'es2022'` no es cosmetico: con el default de Vite (`esnext`)
 * esbuild deja los decoradores stage-3 tal cual en el modulo servido, y
 * ningun navegador los soporta todavia. La pagina muere con un
 * "Invalid or unexpected token" antes de ejecutar una sola linea. Bajar el
 * target hace que esbuild los transpile.
 */
export default defineConfig({
  root: 'demo',
  publicDir: 'public',
  server: { open: true },
  esbuild: { target: 'es2022' },
  optimizeDeps: { esbuildOptions: { target: 'es2022' } },
  build: { target: 'es2022' },
})
