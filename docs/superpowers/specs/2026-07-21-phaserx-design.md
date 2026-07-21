# PhaserX — Framework de decoradores sobre Phaser 3

Fecha: 2026-07-21
Estado: aprobado, pendiente de plan de implementación

## Problema

Phaser 3 está escrito en JavaScript con tipos de TypeScript agregados encima. El
resultado deja huecos que el usuario de TS paga a diario:

- Strings mágicas para keys de assets, escenas y eventos. Un typo compila y falla
  en runtime.
- Boilerplate de `preload` / `create` / `update` en cada escena.
- Sin modelo de composición: la lógica termina en jerarquías de GameObjects o en
  escenas de mil líneas.

PhaserX es una capa encima de Phaser que cierra esos huecos con decoradores
estándar de ECMAScript y un ECS.

## Decisiones tomadas

| Decisión | Elección | Razón |
|---|---|---|
| ECS | Envolver **bitECS** | SoA/TypedArray, ~5kb, el más rápido de JS. Escribir uno propio son meses y bugs de rendimiento ajenos ya resueltos. |
| Decoradores | **Stage-3 estándar** (TS 5.x) | Nativo en Vite/esbuild/swc, sin `reflect-metadata`, `addInitializer` para auto-registro. |
| DI | **Service locator mínimo**, `@Inject(Token)` en propiedad | Los param decorators solo aportan inyección por tipo inferido, que falla con interfaces e imports circulares y exige plugin de bundler. Un juego necesita 3-4 servicios. |
| ECS ↔ Phaser | **Híbrido**: la entidad posee un GameObject | Conserva física Arcade/Matter, tweens, animaciones, input y plugins de Phaser. El ECS puro obligaría a reimplementarlos. |
| Assets | **Manifest `as const` + `@Asset`** | El manifest da keys tipadas y vista global; el decorador da colocación, tipo del recurso y preload automático. |
| Validación de assets contra disco | **No** | Requeriría acoplarse a Vite y un build step. La ruta rota falla en runtime con un error claro del loader. |
| Empaquetado | **Un solo paquete** | Se parte en monorepo cuando duela, no antes. |
| v0.1 | **Framework + juego demo** | El demo es el test de integración de la ergonomía de la API. |

## Arquitectura

```
src/
  core/      Component, System, World (wrapper bitECS)
  scene/     @Scene, ciclo de vida, registro de systems
  assets/    manifest + @Asset
  bridge/    Sprite component + sync ECS ↔ GameObject
  di/        service locator
demo/        juego real que consume el paquete
```

Tooling: Vite, TypeScript 5.x con `experimentalDecorators: false`, Vitest.
El `webpack/` y `src/game.ts` actuales se eliminan.

### El bridge

Es la pieza crítica. El orden por frame es fijo:

1. Systems de lógica corren sobre bitECS y escriben **intención** (velocidad
   deseada, flags de estado).
2. `PreSync`: ECS → GameObject (velocity, escala, rotación).
3. Phaser corre su `update`: física, tweens, animaciones.
4. `PostSync`: GameObject → ECS (posición resuelta, resultados de colisión).

Regla: **Phaser es la autoridad de transform después de física; el ECS es la
autoridad de decisión antes.** Un solo lugar copia, en dos momentos definidos.
Sin esta regla ECS y Arcade se pisan la posición mutuamente.

### Componentes

`@Component` sobre una clase; los field decorators de tipo (`@f32`, `@i16`,
`@u8`, …) construyen el schema de bitECS vía `addInitializer`.

```ts
@Component class Position { @f32 x = 0; @f32 y = 0 }
```

Los datos que no entran en un TypedArray (strings, refs a objetos) usan `@ref`,
que guarda en un array lateral paralelo indexado por entidad, no en bitECS.
`Sprite` usa `@ref` desde el día uno, así que el mecanismo se valida temprano.

### Systems

`@System()` sobre una clase con `update(dt)`. Las entidades llegan por `@Query`.

```ts
@System()
class MovementSystem {
  @Query(Position, Velocity) entities!: QueryResult
  update(dt: number) {
    for (const e of this.entities) Position.x[e] += Velocity.x[e] * dt
  }
}
```

Los systems se declaran **en la escena**, no globalmente. Cambiar de escena
descarta su world y sus systems: cero fugas de estado entre niveles.

### Escenas y assets

```ts
export const A = {
  player: { type: 'image', url: 'player.png' },
} as const

@Scene({ key: 'game', systems: [MovementSystem] })
class GameScene {
  @Asset(A.player) playerTex!: Phaser.Textures.Texture
  @Inject(AudioService) audio!: AudioService

  create() {
    this.world.spawn(
      Position, { x: 400, y: 300 },
      Sprite,   { texture: A.player },
    )
  }
}
```

- El manifest **solo describe**; nunca carga. `@Asset` es el único disparador de
  carga. Dos caminos de carga producirían bugs de orden indepurables.
- No hay `preload()`: lo generan los `@Asset` de la clase.
- `create()` se conserva con su nombre. Un decorador que renombra un método que
  ya tiene nombre obvio es magia sin beneficio.
- `update()` de escena es opcional: los systems son el update.
- Las escenas sin entidades son escenas Phaser normales. El ECS es opt-in por
  construcción, sin diseñar nada extra.

## Testing

Vitest headless, sin navegador.

- `World`, componentes y systems son objetos puros sobre TypedArrays: se testean
  sin instanciar Phaser.
- El bridge se testea con un GameObject falso (objeto con `x`, `y`, `body`). No
  hace falta canvas.
- Solo el demo ejercita Phaser real.

Test obligatorio: destruir una entidad con `Sprite` destruye su GameObject. Es la
fuga clásica de todo bridge ECS.

## Demo

Top-down chico: jugador con input, enemigos que persiguen, colisiones Arcade,
daño, cambio de escena. Ejercita las cuatro áreas riesgosas a la vez — sync
bidireccional, física sobre datos de ECS, ciclo de vida de escena, y assets.

Si el demo revela que una API incomoda, se cambia la API antes de publicar.

## Riesgos

| Riesgo | Salida |
|---|---|
| El schema por field decorators no cubre strings ni refs | `@ref` con array lateral; validado temprano vía `Sprite` |
| Fuga de GameObjects al destruir entidades | Test dedicado en el bridge |
| La API de bitECS cambió entre majors | Verificar versión y API al arrancar la implementación |
| El demo revela API incómoda | Es el propósito del demo; cambiar antes de publicar |

## Fuera de alcance en v0.1

Serialización y save, networking, editor, sitio de documentación, soporte de
decoradores legacy, y cualquier system prefabricado (pathfinding, spawners,
máquinas de estado).
