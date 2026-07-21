export type ImageSpec = { type: 'image'; url: string }
export type SpritesheetSpec = {
  type: 'spritesheet'
  url: string
  frameWidth: number
  frameHeight?: number
}
export type AudioSpec = { type: 'audio'; url: string }
export type AssetSpec = ImageSpec | SpritesheetSpec | AudioSpec

/** Spec ya registrado en un manifest, con su key resuelta. */
export type KeyedSpec<S extends AssetSpec = AssetSpec> = S & { key: string }

/** Recurso de Phaser que corresponde a cada tipo de spec. */
export type LoadedAsset<S extends AssetSpec> = S extends AudioSpec
  ? Phaser.Sound.BaseSound
  : Phaser.Textures.Texture

type Manifested<T extends Record<string, AssetSpec>> = {
  [K in keyof T]: T[K] & { key: K & string }
}

/**
 * Declara el manifest de assets. Solo describe: no carga nada.
 * La key de cada asset se toma del nombre del campo.
 */
export function defineAssets<T extends Record<string, AssetSpec>>(manifest: T): Manifested<T> {
  for (const key of Object.keys(manifest)) {
    ;(manifest[key] as KeyedSpec).key = key
  }
  return manifest as Manifested<T>
}

export type AssetBinding = { property: string; spec: KeyedSpec }

/**
 * Buffer module-level de bindings pendientes.
 *
 * Mismo patron que src/core/column.ts: los field decorators corren al
 * definirse la clase, antes de que el decorador de clase (@Scene, Task 8)
 * reciba la clase ya construida. Cada @Asset empuja su binding aca y
 * @Scene drena el buffer inmediatamente despues.
 */
let pending: AssetBinding[] = []

/** Vacia el buffer de bindings. Lo consume @Scene. */
export function drainAssets(): AssetBinding[] {
  const bindings = pending
  pending = []
  return bindings
}

/**
 * Declara que la escena depende de un asset.
 *
 * Es el unico disparador de carga del framework: @Scene junta estos bindings
 * y los emite al loader en preload, y asigna el recurso a la propiedad
 * despues de que termina la carga.
 */
export function Asset<S extends AssetSpec>(spec: S) {
  return function <T extends object>(
    _value: undefined,
    ctx: ClassFieldDecoratorContext<T, LoadedAsset<S>>,
  ) {
    const keyed = spec as KeyedSpec<S>
    if (keyed.key === undefined) {
      throw new Error('@Asset: el spec no viene de defineAssets(), le falta la key')
    }
    pending.push({ property: String(ctx.name), spec: keyed })
  }
}
