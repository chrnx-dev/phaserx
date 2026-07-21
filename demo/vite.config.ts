import { defineConfig } from 'vite'

// Este archivo lo ejecuta Node, no el navegador. El proyecto no depende de
// @types/node (cero dependencias de runtime, y ninguna de tipos que no haga
// falta), asi que se declara lo unico que se usa.
declare const process: { env: Record<string, string | undefined> }

/**
 * `target: 'es2022'` no es cosmetico: con el default de Vite (`esnext`)
 * esbuild deja los decoradores stage-3 tal cual en el modulo servido, y
 * Chromium (verificado en 141, el que trae Playwright 1.61) no los parsea.
 * La pagina muere con un "Invalid or unexpected token" antes de ejecutar una
 * sola linea. Bajar el target hace que esbuild los transpile.
 */
export default defineConfig({
  root: 'demo',
  publicDir: 'public',
  // Los scripts de demo/verify/ levantan el server con PHASERX_VERIFY=1 para
  // que no intente abrir un navegador de escritorio.
  server: { open: !process.env.PHASERX_VERIFY },
  esbuild: { target: 'es2022' },
  optimizeDeps: { esbuildOptions: { target: 'es2022' } },
  build: { target: 'es2022' },
})
