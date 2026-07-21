# PhaserX

ECS con decoradores stage-3 sobre [Phaser 4](https://phaser.io/).

Phaser trae GameObjects, fisica y escenas, pero nada para organizar la logica
del juego: la data termina colgada de los sprites, y a los pocos miles de
entidades el costo del GameObject se paga aunque la entidad no dibuje nada.
Un ECS puro, del otro lado, obliga a renunciar a la fisica, los tweens y el
input de Phaser.

PhaserX es el puente. Los datos viven en columnas SoA (TypedArrays indexados
por entity id, sobre [bitECS](https://github.com/NateTheGreatt/bitECS)), la
logica vive en systems, y los GameObjects de Phaser siguen siendo GameObjects
de Phaser: se crean solos cuando una entidad recibe `Sprite` y se destruyen
solos cuando muere. La posicion se sincroniza en los dos sentidos, una vez por
frame y en el orden correcto respecto del step de fisica.

Lo que aporta:

- **Componentes declarativos.** `component(class { @f32 x = 0 })` produce el
  store SoA, y los inicializadores son los valores de reseteo reales.
- **Systems con queries.** `@Query(Position, Velocity) moviles!: QueryResult`
  resuelve en cada acceso; el world se inyecta solo.
- **Escenas tipadas.** `@Scene({ key, systems })` sobre una clase que extiende
  `GameScene`: el framework corre los systems, resuelve los assets y apaga
  todo en el SHUTDOWN de Phaser.
- **Bridge hibrido.** El ECS manda cuando escribe `Position`; el resto del
  tiempo mandan la fisica, los tweens y las animaciones de Phaser.
- **Cero dependencias de runtime salvo bitECS.** Phaser es peer dependency y
  nunca se usa `reflect-metadata`.

## Instalacion

```bash
npm install phaserx phaser
```

`phaser` es **peer dependency**: PhaserX no lo trae, lo espera instalado
(`^4.0.0`).

## Configuracion obligatoria de Vite

```ts
// vite.config.ts
import { defineConfig } from 'vite'

export default defineConfig({
  esbuild: { target: 'es2022' },
  optimizeDeps: { esbuildOptions: { target: 'es2022' } },
  build: { target: 'es2022' },
})
```

**Esto no es opcional y no es cosmetico.** Con el target por defecto de Vite
(`esnext`), esbuild deja los decoradores stage-3 tal cual en el modulo que
sirve al navegador, y ningun navegador los parsea todavia (verificado en
Chromium 141). La pagina muere antes de ejecutar una sola linea con:

```
Uncaught SyntaxError: Invalid or unexpected token
```

sin archivo, sin linea y sin stack, asi que no hay forma de adivinar la causa
desde el mensaje. Bajar el target a `es2022` hace que esbuild transpile los
decoradores y todo funciona.

Del lado de TypeScript hacen falta decoradores stage-3, es decir el default
moderno:

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "experimentalDecorators": false, // stage-3, NO los legacy
    "useDefineForClassFields": true,
    "strict": true
  }
}
```

## Ejemplo end-to-end

Es el demo de este repo (`demo/`), recortado. Un jugador que se mueve con las
flechas y enemigos que lo persiguen.

### 1. Manifest de assets

La key de cada asset sale del nombre del campo: `defineAssets` la escribe.

```ts
// assets.ts
import { defineAssets } from 'phaserx'

export const A = defineAssets({
  player: { type: 'image', url: 'player.png' },
  enemy: { type: 'image', url: 'enemy.png' },
})
```

### 2. Componentes

Los inicializadores son los defaults de reseteo reales, no decoracion: los
entity ids se reciclan y las columnas son buffers compartidos, asi que una
entidad que reciba `Health` sin nombrar `hp` en su `set()` arranca en 100 y no
en la vida del muerto anterior.

```ts
// components.ts
import { component, f32, i16, u8 } from 'phaserx'

export const Health = component(class { @i16 hp = 100 })
export const Enemy = component(class { @u8 chaseSpeed = 60 })
export const Player = component(class {})
export const Damage = component(class { @f32 amount = 0 })
```

### 3. System

```ts
// systems.ts
import { Position, Query, type QueryResult, System, Velocity } from 'phaserx'
import { Enemy, Player } from './components'

@System()
export class ChaseSystem {
  @Query(Enemy, Position, Velocity) enemies!: QueryResult
  @Query(Player, Position) players!: QueryResult

  update(): void {
    const target = [...this.players][0]
    if (target === undefined) return
    for (const e of this.enemies) {
      const dx = Position.x[target] - Position.x[e]
      const dy = Position.y[target] - Position.y[e]
      const dist = Math.hypot(dx, dy) || 1
      const speed = Enemy.chaseSpeed[e]
      Velocity.x[e] = (dx / dist) * speed
      Velocity.y[e] = (dy / dist) * speed
    }
  }
}
```

`@Query` resuelve en cada acceso, no al construir el system: las entidades
cambian todos los frames. `update(dt)` recibe el delta **en segundos** (el que
no lo necesita lo declara sin parametros, como aca).

### 4. Escena

```ts
// game.scene.ts
import Phaser from 'phaser'
import {
  Asset, attachSprites, GameScene, Position, Scene, set, sprite, Velocity,
} from 'phaserx'
import { A } from './assets'
import { Enemy, Health, Player } from './components'
import { ChaseSystem } from './systems'

@Scene({ key: 'juego', systems: [ChaseSystem] })
export class JuegoScene extends GameScene {
  // Estos campos existen por su efecto secundario: son lo unico que dispara
  // la carga. Ver "Reglas que no son obvias".
  @Asset(A.player) playerTex!: Phaser.Textures.Texture
  @Asset(A.enemy) enemyTex!: Phaser.Textures.Texture

  protected onCreate(): void {
    // La factory decide COMO nace el GameObject. Su cuarto parametro es el
    // entity id, asi que desde aca se puede consultar el world
    // (`this.world.has(e, Player)`) o meter el GameObject en el grupo que le
    // toque, sin mapear nada a mano.
    attachSprites(this.world, (key, x, y) => this.physics.add.sprite(x, y, key))

    this.world.spawn(
      set(Position, { x: 400, y: 300 }), // Position primero: sprite() la lee
      set(Velocity, { x: 0, y: 0 }),
      Player, // un componente sin valores es un tag
      set(Health, { hp: 100 }),
      sprite(A.player),
    )

    for (let i = 0; i < 5; i++) {
      this.world.spawn(
        set(Position, { x: 100 + i * 120, y: 80 }),
        set(Velocity, { x: 0, y: 0 }),
        set(Enemy, { chaseSpeed: 120 }),
        set(Health, { hp: 10 }),
        sprite(A.enemy),
      )
    }
  }
}
```

`onCreate()` en vez de `create()`, y `onUpdate(dt)` en vez de `update()`: son
los hooks de la subclase, y no hay que llamar a `super`. `onShutdown()` es el
espejo de `onCreate()`.

### 5. Arranque

```ts
// main.ts
import Phaser from 'phaser'
import { JuegoScene } from './game.scene'

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: 800,
  height: 600,
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 } } },
  scene: [JuegoScene],
})
```

No hay una sola linea de limpieza: `GameScene` destruye las entidades, suelta
el bridge y da de baja sus listeners en el SHUTDOWN de Phaser.

## Reglas que no son obvias

### `Position` es obligatoria antes de `sprite()`

No es una recomendacion de estilo, son dos requisitos:

```ts
world.spawn(set(Position, { x, y }), sprite({ key: 'hero' })) // bien
world.spawn(sprite({ key: 'hero' }), set(Position, { x, y })) // lanza
world.spawn(sprite({ key: 'hero' }))                          // lanza
```

Los componentes se aplican de izquierda a derecha y el observer que crea el
GameObject corre al agregarse `Sprite`, asi que necesita `Position` ya puesta
para saber donde nacer. Sin `Position` la entidad heredaria la posicion del
ocupante anterior de su entity id (que puede ser de otra escena) y `postSync`
jamas la corregiria, porque su query pide `Position`. Por eso el bridge lanza
en vez de dejarlo pasar.

### `provide()` va antes de `new Phaser.Game`

`@Inject(token)` resuelve el token **al construirse la instancia**, no al
usarse el campo. Phaser construye las escenas al crear el `Game`, asi que
cualquier `provide()` posterior llega tarde:

```ts
provide(CONFIG, { dificultad: 'alta' }) // primero
new Phaser.Game({ scene: [JuegoScene] }) // despues
```

Al reves, la escena falla con `DI: no hay provider para el token '...'`.

### Los campos `@Asset` no estan sin usar

```ts
@Asset(A.player) playerTex!: Phaser.Textures.Texture
```

Aunque nunca leas `this.playerTex`, **no borres el campo**. El decorador es el
unico disparador de carga del framework: `@Scene` junta estos bindings, los
emite al loader en `preload` y asigna el recurso ya cargado a la propiedad. Sin
el campo, el asset del manifest no llega nunca al loader y `sprite(A.player)`
pide una textura inexistente (Phaser dibuja el cuadro verde de "textura
faltante"). Un linter de campos sin uso los va a marcar: excluilos.

Corolario: `@Asset` sin `@Scene` en la misma clase deja bindings huerfanos, y
la proxima escena que se defina se los lleva puestos. `GameScene` lo detecta y
lo dice con el nombre de la propiedad.

### El orden del frame es del framework, no tuyo

Cada frame corre, en este orden: **systems -> PreSync -> step de fisica de
Phaser -> PostSync**. Lo engancha `GameScene` en `PRE_UPDATE` y `POST_UPDATE`.
No llames al sync ni al pase de systems a mano: por eso `preSync`, `postSync`
y `runSystems` no estan en la API publica.

### El dirty-check de posicion

`preSync` copia `Position` al GameObject **solo si el ECS la cambio** desde el
frame anterior. El resto del tiempo manda el GameObject, que es lo que permite
que la fisica, los tweens y las animaciones de Phaser sigan funcionando.
Consecuencia: escribir en `Position` el mismo valor que ya tenia no mueve el
GameObject.

### La capacidad es global al proceso

Cada componente reserva columnas para `configureCapacity(n)` entity ids
(10.000 por defecto). El techo **no** es "cuantas entidades tienen este
componente": los entity ids salen de un unico index compartido por todas las
escenas vivas, asi que el techo es la cuenta global de entidades vivas del
proceso. Si necesitas mas (o menos), llamala **una vez, antes de definir el
primer componente**:

```ts
// main.ts, antes de importar los componentes
import { configureCapacity } from 'phaserx'
configureCapacity(50_000)
```

Un `@ref` con inicializador objeto comparte UNA sola instancia entre todas las
entidades. Si cada una necesita la suya, declara el campo sin inicializador
(`@ref cfg!: object`) y pasa la instancia en el `set()` del spawn.

## API

| Nombre | Que es |
| --- | --- |
| `component(cls)` | Materializa una clase de declaracion en un store SoA. |
| `configureCapacity(n)` | Entity ids direccionables por componente. Una vez, al principio. |
| `@f32 @f64 @i8 @i16 @i32 @u8 @u16 @u32` | Columna numerica. |
| `@ref` | Columna por referencia (objetos y strings). |
| `World`, `set()` | `spawn`, `destroy`, `query`, `has`, `onAdd`, `onRemove`, `clear`, `teardown`. |
| `@System()`, `@Query(...)` | Systems y sus consultas. |
| `@Scene({ key, systems })`, `GameScene` | Escena de PhaserX. |
| `@Asset(spec)`, `defineAssets()` | Manifest y carga de assets. |
| `Position`, `Velocity`, `Sprite` | Componentes del bridge. |
| `attachSprites()`, `sprite()`, `entityOf()` | Ciclo de vida de los GameObjects. |
| `Token`, `provide`, `resolve`, `@Inject` | Service locator minimo. |

`World.spawn` es atomico: si algo lanza (capacidad, columna inexistente, un
observer que rechaza la entidad), la entidad se destruye antes de propagar el
error. `attachSprites` devuelve un `detach()` que destruye los GameObjects
vivos antes de soltarse; normalmente no hace falta llamarlo, porque `GameScene`
apaga el bridge sola.

## Demo

```bash
npm install
npm run demo
```

Flechas para moverse. Los enemigos persiguen, el contacto hace dano en ambas
direcciones y al morir se cambia de escena. `demo/verify/lifecycle.mjs` y
`demo/verify/reentry.mjs` miden con Playwright que no queden GameObjects
huerfanos ni listeners duplicados al cambiar y re-entrar a una escena.

## Licencia

MIT. Ver [LICENSE](./LICENSE).
