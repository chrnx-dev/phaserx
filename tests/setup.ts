/**
 * Shim minimo de Canvas/WebGL para jsdom.
 *
 * `phaser` corre deteccion de features del navegador (blend modes, alpha
 * invertido, WebGL) en el top-level de su modulo: apenas se hace
 * `import Phaser from 'phaser'` bajo jsdom, sin este shim revienta porque
 * `HTMLCanvasElement.prototype.getContext` no esta implementado ahi.
 *
 * Este archivo es deliberadamente el subconjunto minimo que Phaser necesita
 * para completar esa deteccion sin lanzar: no simula pixeles reales (ver
 * getImageData/putImageData mas abajo), asi que los resultados de la
 * deteccion (soporte de blend modes, alpha invertido) quedan indefinidos.
 * No importa para estos tests: no renderizan nada, solo ejercitan
 * @Scene/getSceneMeta/runSystems, que son codigo puro.
 *
 * Version reducida del setup que el propio paquete `phaser` usa para su
 * suite (node_modules/phaser/tests/setup.js).
 */

if (typeof globalThis.self === 'undefined') {
  ;(globalThis as unknown as { self: typeof globalThis }).self = globalThis
}

if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string) {
    if (type === '2d' || type === '2D') {
      return {
        canvas: this,
        fillStyle: '#000000',
        strokeStyle: '#000000',
        globalCompositeOperation: 'source-over',
        globalAlpha: 1,
        fillRect() {},
        clearRect() {},
        drawImage() {},
        getImageData(_x: number, _y: number, w: number, h: number) {
          return { data: new Uint8ClampedArray(w * h * 4) }
        },
        putImageData() {},
        createImageData(w: number, h: number) {
          return { data: new Uint8ClampedArray(w * h * 4) }
        },
        save() {},
        restore() {},
        setTransform() {},
        resetTransform() {},
        scale() {},
        translate() {},
        rotate() {},
      } as unknown as CanvasRenderingContext2D
    }

    if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
      return null
    }

    return null
  } as typeof HTMLCanvasElement.prototype.getContext
}
