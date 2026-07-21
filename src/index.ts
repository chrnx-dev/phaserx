export const VERSION = '0.1.0'

export { f32, f64, i8, i16, i32, ref, u8, u16, u32 } from './core/column'
export type { Column } from './core/column'
export { component, DEFAULT_CAPACITY } from './core/component'
export type { SoA } from './core/component'
export { set, World } from './core/world'
export type { Entity, Setter, Values } from './core/world'
export { bindWorld, Query, System } from './core/system'
export type { QueryResult, SystemInstance } from './core/system'
export { clearProviders, Inject, provide, resolve, Token } from './di/index'
export { Asset, defineAssets } from './assets/index'
export type { AssetSpec, LoadedAsset } from './assets/index'
export { GameScene, getSceneMeta, runSystems, Scene } from './scene/index'
export type { SceneConfig, SceneMeta } from './scene/index'
export {
  attachSprites,
  Position,
  postSync,
  preSync,
  Sprite,
  sprite,
  Velocity,
} from './bridge/index'
export type { SpriteFactory, SpriteLike } from './bridge/index'
