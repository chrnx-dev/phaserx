export const VERSION = '26.7.0-alpha.0'

export { f32, f64, i8, i16, i32, ref, u8, u16, u32 } from './core/column'
export type { Column } from './core/column'
export { component, configureCapacity } from './core/component'
export type { SoA } from './core/component'
export { set, World } from './core/world'
export type { Entity, Setter, Values } from './core/world'
export { Query, System } from './core/system'
export type { QueryResult, SystemInstance } from './core/system'
export { clearProviders, Inject, provide, resolve, Token } from './di/index'
export { Asset, defineAssets } from './assets/index'
export type { AssetSpec, LoadedAsset } from './assets/index'
export { GameScene, Scene } from './scene/index'
export type { SceneConfig, SceneMeta } from './scene/index'
export { attachSprites, entityOf, Position, Sprite, sprite, Velocity } from './bridge/index'
export type { SpriteFactory, SpriteLike } from './bridge/index'

// Deliberadamente NO exportados, aunque sean `export` en su modulo:
//
//   preSync, postSync, runSystems  GameScene ya los corre en el orden exacto
//     (systems -> PreSync -> fisica -> PostSync). Llamarlos a mano duplica el
//     sync o el pase entero de systems, y son justo los nombres que mas suenan
//     a "lo que necesito" en el autocompletado.
//   bindWorld       lo hace runSystems en cada frame.
//   getSceneMeta    detalle de implementacion de @Scene / GameScene.
//   DEFAULT_CAPACITY  el techo se toca con configureCapacity(), no leyendo el
//     default.
//
// tests/public-api.test.ts congela esta ausencia.
