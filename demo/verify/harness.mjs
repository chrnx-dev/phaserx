/**
 * Arnes comun de los scripts de verificacion del demo.
 *
 * Levanta el dev server de Vite sobre `demo/`, abre Chromium con Playwright y
 * expone helpers para medir el estado del juego desde adentro de la pagina.
 *
 * Playwright NO es dependencia del proyecto (PhaserX no agrega dependencias
 * para esto). Se resuelve del proyecto si esta instalado y, si no, del cache
 * de npx, que es donde queda tras un `npx playwright ...`. Para forzar una
 * ubicacion: PLAYWRIGHT_ROOT=/ruta/a/node_modules
 *
 * Uso:
 *   node demo/verify/lifecycle.mjs
 *   node demo/verify/reentry.mjs
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
export const REPO = resolve(fileURLToPath(new URL('../..', import.meta.url)))

function ubicacionesPlaywright() {
  const dirs = []
  if (process.env.PLAYWRIGHT_ROOT) dirs.push(process.env.PLAYWRIGHT_ROOT)
  dirs.push(join(REPO, 'node_modules'))
  const npx = join(homedir(), '.npm', '_npx')
  if (existsSync(npx)) {
    for (const d of readdirSync(npx)) dirs.push(join(npx, d, 'node_modules'))
  }
  return dirs
}

export function cargarPlaywright() {
  for (const dir of ubicacionesPlaywright()) {
    const candidato = join(dir, 'playwright')
    if (!existsSync(candidato)) continue
    try {
      return require(candidato)
    } catch {
      /* seguir buscando */
    }
  }
  throw new Error(
    'No se encontro playwright. Instalalo (npx playwright install chromium) o ' +
      'apunta PLAYWRIGHT_ROOT a un node_modules que lo tenga.',
  )
}

const PUERTO = Number(process.env.PHASERX_PORT ?? 5199)

/** Levanta `vite` sobre demo/ y resuelve cuando responde. */
export async function levantarServidor() {
  const bin = join(REPO, 'node_modules', 'vite', 'bin', 'vite.js')
  const proc = spawn(
    process.execPath,
    [bin, '--config', 'demo/vite.config.ts', '--port', String(PUERTO), '--strictPort'],
    { cwd: REPO, env: { ...process.env, PHASERX_VERIFY: '1' }, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  let salida = ''
  proc.stdout.on('data', d => (salida += d))
  proc.stderr.on('data', d => (salida += d))

  const url = `http://localhost:${PUERTO}/`
  const limite = Date.now() + 30_000
  while (Date.now() < limite) {
    try {
      const r = await fetch(url)
      if (r.ok) return { url, cerrar: () => proc.kill('SIGTERM') }
    } catch {
      /* todavia no levanto */
    }
    await new Promise(r => setTimeout(r, 200))
  }
  proc.kill('SIGTERM')
  throw new Error(`El dev server no levanto en 30s. Salida:\n${salida}`)
}

/** Abre la pagina y devuelve la page mas el registro de errores de consola. */
export async function abrirDemo(url) {
  const { chromium } = cargarPlaywright()
  const browser = await chromium.launch()
  const page = await browser.newPage()
  const errores = []
  const avisos = []
  // Chromium headless emite warnings de performance del driver de WebGL
  // ("GPU stall due to ReadPixels") que no vienen del demo ni de Phaser.
  const RUIDO_DEL_DRIVER = /GL Driver Message|GPU stall/
  page.on('console', m => {
    if (m.type() === 'error') errores.push(`console.error: ${m.text()}`)
    if (m.type() === 'warning' && !RUIDO_DEL_DRIVER.test(m.text())) {
      avisos.push(`console.warn: ${m.text()}`)
    }
  })
  page.on('pageerror', e => errores.push(`pageerror: ${e.message}`))
  await page.goto(url)
  await page.waitForFunction(() => {
    const tb = window.__phaserx
    return tb !== undefined && tb.game.scene.getScenes(true).length > 0
  })
  return { browser, page, errores, avisos }
}

/**
 * Estado observable del juego: escenas activas, sus entidades (leidas del ECS)
 * y sus display lists (leidas de Phaser). La comparacion entre las dos mitades
 * es justamente lo que valida el bridge.
 */
export const SNAPSHOT = () => {
  const { game, components } = window.__phaserx
  const { Position, Velocity, Sprite, Health, Enemy, Player } = components
  return {
    t: performance.now(),
    escenas: game.scene.getScenes(true).map(s => ({
      key: s.scene.key,
      preUpdateListeners: s.events.listenerCount('preupdate'),
      // Dos formas de contar lo mismo: una query directa y un filtro por
      // has(). Si difieren, la query esta devolviendo entidades muertas.
      enemigosPorQuery: s.world.query(Enemy).length,
      enemigosPorHas: [...s.world.query(Position)].filter(e => s.world.has(e, Enemy)).length,
      entidades: [...s.world.query(Position)].map(e => ({
        e,
        x: Math.round(Position.x[e] * 100) / 100,
        y: Math.round(Position.y[e] * 100) / 100,
        vx: Math.round(Velocity.x[e]),
        vy: Math.round(Velocity.y[e]),
        hp: s.world.has(e, Health) ? Health.hp[e] : null,
        tex: Sprite.key[e] ?? null,
        rol: s.world.has(e, Player) ? 'jugador' : s.world.has(e, Enemy) ? 'enemigo' : 'otro',
      })),
      displayList: s.children.list.map(o =>
        o.type === 'Text' ? `Text:${o.text}` : `${o.type}:${o.texture ? o.texture.key : '?'}`,
      ),
    })),
  }
}

export const snapshot = page => page.evaluate(SNAPSHOT)

export function fmt(valor) {
  return JSON.stringify(valor)
}

/** Acumulador de chequeos con salida legible y exit code al final. */
export function crearReporte(titulo) {
  const filas = []
  console.log(`\n=== ${titulo} ===\n`)
  return {
    check(nombre, ok, medicion) {
      filas.push({ nombre, ok })
      console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}`)
      if (medicion !== undefined) console.log(`      medicion: ${medicion}`)
    },
    dato(nombre, medicion) {
      console.log(`DATO  ${nombre}`)
      console.log(`      ${medicion}`)
    },
    cerrar() {
      const fallas = filas.filter(f => !f.ok)
      console.log(`\n${filas.length - fallas.length}/${filas.length} chequeos OK`)
      return fallas.length === 0
    },
  }
}
