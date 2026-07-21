import { expect, test } from 'vitest'
import * as phaserx from '../src/index'

test('exporta la superficie publica completa', () => {
  const esperado = [
    'VERSION',
    'component', 'configureCapacity',
    'f32', 'f64', 'i8', 'i16', 'i32', 'u8', 'u16', 'u32', 'ref',
    'World', 'set',
    'System', 'Query',
    'Token', 'provide', 'resolve', 'clearProviders', 'Inject',
    'defineAssets', 'Asset',
    'Scene', 'GameScene',
    'Position', 'Velocity', 'Sprite', 'sprite', 'attachSprites', 'entityOf',
  ]
  for (const nombre of esperado) {
    expect(phaserx, `falta el export '${nombre}'`).toHaveProperty(nombre)
  }
})

/**
 * El barrel es la unica documentacion que un usuario lee con el autocompletado.
 * Estos nombres existen y son `export` en su modulo (los usan las capas de
 * arriba y los tests internos, que importan de '../src/...' directo), pero no
 * son API publica: exponerlos invita a llamarlos, y llamarlos rompe el frame.
 */
test('no filtra internos a la superficie publica', () => {
  const prohibidos = {
    // GameScene ya los corre en el orden exacto: systems -> PreSync ->
    // fisica -> PostSync. A mano duplican el sync o el pase de systems.
    preSync: 'lo corre GameScene en PRE_UPDATE',
    postSync: 'lo corre GameScene en POST_UPDATE',
    runSystems: 'lo corre GameScene en PRE_UPDATE',
    bindWorld: 'lo hace runSystems en cada frame',
    getSceneMeta: 'detalle de implementacion de @Scene',
    DEFAULT_CAPACITY: 'el techo se toca con configureCapacity()',
  }
  for (const [nombre, porque] of Object.entries(prohibidos)) {
    expect(phaserx, `'${nombre}' no va en el barrel: ${porque}`).not.toHaveProperty(nombre)
  }
})
