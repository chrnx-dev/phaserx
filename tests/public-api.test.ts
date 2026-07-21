import { expect, test } from 'vitest'
import * as phaserx from '../src/index'

test('exporta la superficie publica completa', () => {
  const esperado = [
    'VERSION',
    'component', 'DEFAULT_CAPACITY',
    'f32', 'f64', 'i8', 'i16', 'i32', 'u8', 'u16', 'u32', 'ref',
    'World', 'set',
    'System', 'Query', 'bindWorld',
    'Token', 'provide', 'resolve', 'clearProviders', 'Inject',
    'defineAssets', 'Asset',
    'Scene', 'GameScene', 'getSceneMeta', 'runSystems',
    'Position', 'Velocity', 'Sprite', 'sprite', 'attachSprites', 'preSync', 'postSync',
  ]
  for (const nombre of esperado) {
    expect(phaserx, `falta el export '${nombre}'`).toHaveProperty(nombre)
  }
})
