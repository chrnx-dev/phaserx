import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      // 'capacity' es una entrada aparte y no un chunk compartido a
      // proposito: necesita ser importable sin arrastrar el grafo de modulos
      // del barrel (que reexporta el bridge, y el bridge define sus propios
      // componentes al evaluarse). Ver el JSDoc de src/capacity.ts.
      entry: { index: 'src/index.ts', capacity: 'src/capacity.ts' },
      formats: ['es'],
    },
    rollupOptions: {
      external: ['phaser', 'bitecs'],
    },
  },
})
