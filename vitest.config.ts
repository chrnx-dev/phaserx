import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    // jsdom para toda la suite, no solo tests/scene: `phaser` corre
    // deteccion de features del navegador (window, document, canvas) en el
    // top-level de su modulo, asi que cualquier test que importe
    // src/scene/index.ts (directo o via el barrel publico, ver Task 10)
    // revienta bajo 'node' aunque nunca instancie GameScene. Centralizar el
    // entorno y el shim de canvas aca evita que cada archivo nuevo tenga que
    // redescubrir el pragma y el import por su cuenta.
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
  },
})
