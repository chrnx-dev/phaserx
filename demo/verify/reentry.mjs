/**
 * Diagnostico de re-entrada a una escena de PhaserX.
 *
 * NO es parte del demo: el demo no ofrece "reiniciar" justamente por lo que
 * este script mide. Vuelve a arrancar la escena "juego" despues de haberla
 * abandonado y cuenta cuantos listeners de PRE_UPDATE quedan registrados.
 *
 * `GameScene#create()` hace `this.events.on(PRE_UPDATE, ...)` en cada create y
 * nunca lo da de baja, y `Systems#shutdown()` de Phaser solo remueve los
 * eventos de transicion, no los de frame. Volver a entrar deberia dejar el
 * mismo numero de listeners que la primera vez.
 *
 *   node demo/verify/reentry.mjs
 */
import { abrirDemo, crearReporte, fmt, levantarServidor, snapshot } from './harness.mjs'

const servidor = await levantarServidor()
const { browser, page, errores } = await abrirDemo(servidor.url)
const r = crearReporte('PhaserX demo - re-entrada a una escena (diagnostico)')

const contarListeners = key =>
  page.evaluate(k => {
    const { game } = window.__phaserx
    const s = game.scene.getScene(k)
    return {
      preupdate: s.events.listenerCount('preupdate'),
      postupdate: s.events.listenerCount('postupdate'),
      shutdown: s.events.listenerCount('shutdown'),
      entidades: [...s.world.query(window.__phaserx.components.Position)].length,
      gameObjects: s.children.list.length,
    }
  }, key)

try {
  const primera = await contarListeners('juego')
  r.dato('primera entrada a "juego"', fmt(primera))

  // Salir y volver a entrar, sin pasar por la muerte del jugador.
  await page.evaluate(() => window.__phaserx.game.scene.stop('juego'))
  await new Promise(res => setTimeout(res, 200))
  const apagada = await contarListeners('juego')
  r.dato('con la escena apagada', fmt(apagada))

  r.check(
    'al apagar la escena su world queda vacio (lo limpia el SHUTDOWN del demo)',
    apagada.entidades === 0 && apagada.gameObjects === 0,
    fmt(apagada),
  )

  await page.evaluate(() => window.__phaserx.game.scene.start('juego'))
  await new Promise(res => setTimeout(res, 500))
  const segunda = await contarListeners('juego')
  r.dato('segunda entrada a "juego"', fmt(segunda))

  r.check(
    'volver a entrar a la escena no duplica los listeners de frame de GameScene',
    segunda.preupdate === primera.preupdate && segunda.postupdate === primera.postupdate,
    `preupdate ${primera.preupdate} -> ${segunda.preupdate}, ` +
      `postupdate ${primera.postupdate} -> ${segunda.postupdate}`,
  )

  r.check(
    'volver a entrar deja el mismo numero de entidades y GameObjects',
    segunda.entidades === primera.entidades && segunda.gameObjects === primera.gameObjects,
    `entidades ${primera.entidades} -> ${segunda.entidades}, ` +
      `gameObjects ${primera.gameObjects} -> ${segunda.gameObjects}`,
  )

  // El leak es lineal: cada entrada agrega un listener mas, y con el un pase
  // completo de runSystems + preSync (y de postSync) por frame.
  const serie = [primera.preupdate, segunda.preupdate]
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => window.__phaserx.game.scene.stop('juego'))
    await new Promise(res => setTimeout(res, 150))
    await page.evaluate(() => window.__phaserx.game.scene.start('juego'))
    await new Promise(res => setTimeout(res, 350))
    serie.push((await contarListeners('juego')).preupdate)
  }
  r.dato('listeners de PRE_UPDATE por numero de entrada a la escena', fmt(serie))
  r.check(
    'el numero de listeners de frame no crece con las entradas sucesivas',
    new Set(serie).size === 1,
    `serie = ${fmt(serie)} (crece +1 por entrada: cada uno es un pase entero de ` +
      `runSystems + preSync por frame)`,
  )

  const snap = await snapshot(page)
  r.dato('snapshot final', fmt(snap.escenas.map(e => ({ key: e.key, pre: e.preUpdateListeners }))))
  r.check('la consola no reporta errores', errores.length === 0, fmt(errores))

  const ok = r.cerrar()
  if (!ok) {
    console.log(
      '\nLas fallas de este script son el hallazgo 13 documentado en\n' +
        'docs/superpowers/notes/2026-07-21-demo-findings.md, no una regresion del demo:\n' +
        'GameScene no da de baja sus listeners de frame al SHUTDOWN.',
    )
  }
  await browser.close()
  servidor.cerrar()
  process.exit(ok ? 0 : 1)
} catch (e) {
  console.error(e)
  await browser.close()
  servidor.cerrar()
  process.exit(1)
}
