/**
 * Re-entrada a una escena de PhaserX: los listeners de frame no se acumulan.
 *
 * Vuelve a arrancar la escena "juego" despues de haberla abandonado, cuatro
 * veces, y cuenta cuantos listeners de PRE_UPDATE quedan registrados.
 *
 * `GameScene#create()` hace `this.events.on(PRE_UPDATE, ...)` en cada create, y
 * `Systems#shutdown()` de Phaser solo remueve los eventos de transicion, no los
 * de frame: la baja la hace GameScene por su cuenta en el SHUTDOWN (hallazgo
 * 13). Antes del arreglo la serie medida era [5, 6, 7, 8]; el chequeo de abajo
 * afirma que ahora es constante.
 *
 *   node demo/verify/reentry.mjs
 */
import { abrirDemo, crearReporte, fmt, levantarServidor, snapshot } from './harness.mjs'

const servidor = await levantarServidor()
const { browser, page, errores } = await abrirDemo(servidor.url)
const r = crearReporte('PhaserX demo - re-entrada a una escena')

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
    'al apagar la escena su world queda vacio (lo limpia GameScene en el SHUTDOWN)',
    apagada.entidades === 0 && apagada.gameObjects === 0,
    fmt(apagada),
  )

  r.check(
    'la escena apagada no deja ningun listener de frame',
    apagada.preupdate === 0 && apagada.postupdate === 0,
    fmt({ preupdate: apagada.preupdate, postupdate: apagada.postupdate }),
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

  // Antes del arreglo el leak era lineal: cada entrada agregaba un listener
  // mas, y con el un pase completo de runSystems + preSync (y de postSync) por
  // frame. La serie medida entonces fue [5, 6, 7, 8]; ahora tiene que ser
  // constante.
  const serie = [primera.preupdate, segunda.preupdate]
  const seriePost = [primera.postupdate, segunda.postupdate]
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => window.__phaserx.game.scene.stop('juego'))
    await new Promise(res => setTimeout(res, 150))
    await page.evaluate(() => window.__phaserx.game.scene.start('juego'))
    await new Promise(res => setTimeout(res, 350))
    const c = await contarListeners('juego')
    serie.push(c.preupdate)
    seriePost.push(c.postupdate)
  }
  r.dato('listeners de PRE_UPDATE por numero de entrada a la escena', fmt(serie))
  r.dato('listeners de POST_UPDATE por numero de entrada a la escena', fmt(seriePost))
  r.check(
    'el numero de listeners de PRE_UPDATE no crece con las entradas sucesivas',
    new Set(serie).size === 1,
    `serie = ${fmt(serie)} (antes del arreglo crecia +1 por entrada: cada uno era un ` +
      `pase entero de runSystems + preSync por frame)`,
  )
  r.check(
    'el numero de listeners de POST_UPDATE no crece con las entradas sucesivas',
    new Set(seriePost).size === 1,
    `serie = ${fmt(seriePost)}`,
  )

  // El contrafactual del hallazgo 12: sin limpieza manual en el demo, la
  // segunda entrada moria dentro de GameScene#create() con
  // "attachSprites: el world ya esta enganchado con otra factory". Que las
  // entradas sucesivas dejen el world con las 6 entidades de siempre es la
  // prueba de que el teardown del world lo hace ahora el framework.
  const ultima = await contarListeners('juego')
  r.check(
    'tras cuatro entradas la escena sigue naciendo con su world completo y sin sobras',
    ultima.entidades === primera.entidades && ultima.gameObjects === primera.gameObjects,
    `entidades ${primera.entidades} -> ${ultima.entidades}, ` +
      `gameObjects ${primera.gameObjects} -> ${ultima.gameObjects}`,
  )

  const snap = await snapshot(page)
  r.dato('snapshot final', fmt(snap.escenas.map(e => ({ key: e.key, pre: e.preUpdateListeners }))))
  r.check('la consola no reporta errores', errores.length === 0, fmt(errores))

  const ok = r.cerrar()
  await browser.close()
  servidor.cerrar()
  process.exit(ok ? 0 : 1)
} catch (e) {
  console.error(e)
  await browser.close()
  servidor.cerrar()
  process.exit(1)
}
