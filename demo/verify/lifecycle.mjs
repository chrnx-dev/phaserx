/**
 * Verificacion en navegador del demo de PhaserX.
 *
 * Mide, sobre Chromium real y con el demo corriendo de verdad:
 *  1. que la colision jugador <-> enemigo baja Health.hp,
 *  2. que una entidad muere y su GameObject desaparece del display list,
 *  3. que la muerte del jugador dispara la transicion de escena,
 *  4. que la escena nueva no arrastra sprites ni posiciones de la anterior,
 *  5. que la consola queda limpia.
 *
 *   node demo/verify/lifecycle.mjs
 */
import { abrirDemo, crearReporte, fmt, levantarServidor, snapshot } from './harness.mjs'

const TIMEOUT_MS = 30_000
const PERIODO_MS = 50

const servidor = await levantarServidor()
const { browser, page, errores, avisos } = await abrirDemo(servidor.url)
const r = crearReporte('PhaserX demo - ciclo de vida en Chromium')

try {
  const inicial = await snapshot(page)
  const juego0 = inicial.escenas.find(s => s.key === 'juego')

  r.check(
    'la escena inicial es "juego" con 6 entidades y 6 GameObjects',
    juego0 !== undefined && juego0.entidades.length === 6 && juego0.displayList.length === 6,
    `entidades=${juego0?.entidades.length} displayList=${fmt(juego0?.displayList)}`,
  )

  const jugador0 = juego0.entidades.find(e => e.rol === 'jugador')
  r.check(
    'el jugador arranca con hp=100 en (400,300)',
    jugador0 !== undefined && jugador0.hp === 100 && jugador0.x === 400 && jugador0.y === 300,
    fmt(jugador0),
  )

  // --- muestreo continuo hasta que la escena cambie -------------------------
  const linea = [inicial]
  const t0 = Date.now()
  let fin = null
  while (Date.now() - t0 < TIMEOUT_MS) {
    const s = await snapshot(page)
    linea.push(s)
    if (s.escenas.some(e => e.key === 'fin')) {
      fin = s
      break
    }
    await new Promise(res => setTimeout(res, PERIODO_MS))
  }

  const enJuego = s => s.escenas.find(e => e.key === 'juego')
  const jugadorDe = s => enJuego(s)?.entidades.find(e => e.rol === 'jugador')
  const enemigosDe = s => enJuego(s)?.entidades.filter(e => e.rol === 'enemigo') ?? []

  // --- 1. la colision baja hp ----------------------------------------------
  const primerGolpe = linea.find(s => (jugadorDe(s)?.hp ?? 100) < 100)
  r.check(
    'la colision con un enemigo baja Health.hp del jugador',
    primerGolpe !== undefined,
    primerGolpe
      ? `hp 100 -> ${jugadorDe(primerGolpe).hp} a los ${Math.round(primerGolpe.t - linea[0].t)} ms`
      : 'el hp nunca bajo',
  )

  const hpsJugador = [...new Set(linea.map(s => jugadorDe(s)?.hp).filter(h => h != null))]
  r.dato('serie de hp del jugador', fmt(hpsJugador))

  const conteos = linea
    .filter(s => enJuego(s))
    .map(s => `${enJuego(s).enemigosPorQuery}/${enJuego(s).enemigosPorHas}`)
  r.check(
    'query(Enemy) y has(e, Enemy) cuentan lo mismo en cada muestra',
    linea.every(s => !enJuego(s) || enJuego(s).enemigosPorQuery === enJuego(s).enemigosPorHas),
    `serie query/has = ${fmt([...new Set(conteos)])}`,
  )

  // --- 2. muere una entidad con Sprite y su GameObject se va ----------------
  const antesDeMorir = linea.filter(s => enemigosDe(s).length === 5).pop()
  const trasMorir = linea.find(s => enemigosDe(s).length < 5 && enJuego(s) !== undefined)
  const bajaEntidades =
    antesDeMorir && trasMorir
      ? enJuego(antesDeMorir).entidades.length - enJuego(trasMorir).entidades.length
      : null
  const bajaGameObjects =
    antesDeMorir && trasMorir
      ? enJuego(antesDeMorir).displayList.length - enJuego(trasMorir).displayList.length
      : null
  r.check(
    'al morir un enemigo desaparecen en el mismo paso su entidad y su GameObject',
    bajaEntidades !== null && bajaEntidades > 0 && bajaEntidades === bajaGameObjects,
    `entidades ${enJuego(antesDeMorir)?.entidades.length} -> ${enJuego(trasMorir)?.entidades.length}, ` +
      `displayList ${enJuego(antesDeMorir)?.displayList.length} -> ${enJuego(trasMorir)?.displayList.length}`,
  )

  const desalineado = linea.find(
    s => enJuego(s) && enJuego(s).entidades.length !== enJuego(s).displayList.length,
  )
  r.check(
    'en ningun momento del juego hay mas GameObjects que entidades (ni al reves)',
    desalineado === undefined,
    desalineado
      ? `desalineado en t=${Math.round(desalineado.t - linea[0].t)}ms: ` +
          `${enJuego(desalineado).entidades.length} entidades vs ${enJuego(desalineado).displayList.length} GameObjects`
      : `${linea.length} muestras alineadas`,
  )

  // --- 3. transicion de escena ---------------------------------------------
  const ultimoJuego = linea.filter(s => enJuego(s) !== undefined).pop()
  r.check(
    'la muerte del jugador dispara scene.start("fin")',
    fin !== null,
    fin
      ? `transicion a los ${Math.round(fin.t - linea[0].t)} ms; escenas activas = ${fmt(fin.escenas.map(s => s.key))}`
      : 'nunca se llego a la escena "fin"',
  )

  r.check(
    'la escena vieja deja de estar activa tras la transicion',
    fin !== null && !fin.escenas.some(s => s.key === 'juego'),
    fmt(fin?.escenas.map(s => s.key)),
  )

  // --- 4. la escena nueva no arrastra nada ---------------------------------
  const escenaFin = fin?.escenas.find(s => s.key === 'fin')
  const eidsViejos = new Set(ultimoJuego ? enJuego(ultimoJuego).entidades.map(e => e.e) : [])
  const posViejas = new Map(
    ultimoJuego ? enJuego(ultimoJuego).entidades.map(e => [e.e, `${e.x},${e.y}`]) : [],
  )

  r.check(
    'el world de la escena nueva tiene exactamente su unica entidad',
    escenaFin !== undefined && escenaFin.entidades.length === 1,
    fmt(escenaFin?.entidades),
  )

  const sonda = escenaFin?.entidades[0]
  r.check(
    'la entidad nueva esta en su spawn point (400,380), no en la posicion de un muerto',
    sonda !== undefined && sonda.x === 400 && sonda.y === 380,
    `${fmt(sonda)} / posiciones de la escena vieja: ${fmt([...posViejas.values()])}`,
  )

  r.check(
    'el entity id se reciclo de la escena anterior (prueba de que el world viejo se limpio)',
    sonda !== undefined && eidsViejos.has(sonda.e),
    `eid nuevo = ${sonda?.e}; eids vivos al final de "juego" = ${fmt([...eidsViejos])}`,
  )

  r.check(
    'no sobrevive ningun sprite de la escena vieja en el display list nuevo',
    escenaFin !== undefined &&
      !escenaFin.displayList.some(o => o.includes('player')) &&
      escenaFin.displayList.filter(o => o.startsWith('Sprite')).length === 1,
    fmt(escenaFin?.displayList),
  )

  // Los GameObjects de la escena vieja los destruye Phaser al hacer shutdown,
  // pero el `Sprite.go` del ECS solo se libera si alguien destruye la entidad:
  // esto mide que el detach/destroy manual del demo efectivamente corrio.
  const huerfanos = await page.evaluate(() => {
    const { game, components } = window.__phaserx
    const { Sprite } = components
    let vivos = 0
    for (const go of Object.values(Sprite.go)) if (go !== undefined) vivos++
    const enUso = game.scene
      .getScenes(true)
      .reduce((n, s) => n + s.children.list.filter(o => o.type === 'Sprite').length, 0)
    return { referenciasSpriteGo: vivos, spritesEnEscenasActivas: enUso }
  })
  r.check(
    'no quedan referencias Sprite.go de entidades muertas',
    huerfanos.referenciasSpriteGo === huerfanos.spritesEnEscenasActivas,
    fmt(huerfanos),
  )

  // --- 5. consola limpia ----------------------------------------------------
  r.check('la consola no reporta errores', errores.length === 0, fmt(errores))
  r.check(
    'la consola no reporta warnings propios (excluido el ruido del driver de WebGL)',
    avisos.length === 0,
    fmt(avisos),
  )

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
