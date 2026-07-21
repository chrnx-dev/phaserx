# Hallazgos de ergonomia al escribir el demo (Task 11)

Escrito mientras se escribia `demo/`, que es la primera vez que alguien usa la API
completa desde afuera. Ordenado por costo real: primero lo que rompio el demo,
despues lo que solo incomodo.

## 1. `defineAssets` no carga nada, y el manifest se declara dos veces

El codigo del brief hacia `sprite(A.player)` sin declarar ningun `@Asset`. Eso
compila, corre, y falla en el navegador con una textura inexistente: `defineAssets`
es puramente declarativo y el **unico** disparador de carga es un campo `@Asset` en
la escena (`GameScene#preload` recorre `meta.assets`, y `meta.assets` sale de
`drainAssets()`). Tuve que volver a `src/scene/index.ts` para entenderlo.

El resultado es que la escena tiene dos campos que nunca se leen:

```ts
@Asset(A.player) playerTex!: Phaser.Textures.Texture
@Asset(A.enemy) enemyTex!: Phaser.Textures.Texture
```

Existen solo por su efecto secundario en el registro. Un campo muerto obligatorio es
la clase de cosa que un usuario borra "limpiando codigo" y despues pasa media hora
buscando por que la textura no carga. Ademas hay dos formas de nombrar el mismo
asset: `A.player` (el spec, lo que consume `sprite()`) y `this.playerTex` (el
recurso cargado, que el demo no necesita nunca).

Alternativas: `@Scene({ key, assets: [A.player, A.enemy] })`, o que `sprite(spec)`
registre la necesidad de carga por si mismo, o que `@Asset` acepte declararse a
nivel modulo.

## 2. Los decoradores stage-3 no llegan al navegador con la config default de Vite

Primer intento de correr el demo: canvas ausente y un unico `Invalid or unexpected
token` en consola, sin archivo ni linea utiles. Causa: el target por defecto de Vite
en dev es `esnext`, con lo cual esbuild deja los decoradores tal cual en el modulo
servido, y ningun navegador los implementa todavia. Hay que forzar
`esbuild: { target: 'es2022' }` (y el equivalente en `optimizeDeps` y `build`).

Es un requisito de instalacion del framework entero, no del demo, y hoy no esta
escrito en ningun lado. Deberia estar en el README junto al `tsconfig` minimo, o
directamente exportarse un preset de Vite. Un usuario nuevo choca con esto en su
primer `npm run dev` y el mensaje no apunta a nada.

## 3. Un system con dependencias sale del modelo declarativo y no vuelve

`@Scene({ systems })` acepta solo `new () => SystemInstance`. `PlayerInputSystem`
(recibe el teclado) y `DeathSystem` (recibe un callback) no entran, asi que hay que
hacer esto en `onCreate()`:

```ts
this.systems = [new PlayerInputSystem(keys), new ChaseSystem(), new DeathSystem(...)]
```

Tres problemas concretos:

- Es una **asignacion a una propiedad `protected`**, no una API. No hay
  `addSystem()` ni `useSystems()`. Hay que saber que el campo se llama `systems` y
  que asignarlo es lo esperado.
- **Pisa en silencio** lo que `GameScene#create()` acaba de construir a partir de
  `meta.systems`. Si alguien declara systems en el decorador *y* asigna en
  `onCreate()`, los primeros desaparecen sin aviso. Lo confirme leyendo el orden de
  `create()`; desde afuera es invisible.
- Por lo tanto, en cuanto **un solo** system necesita una dependencia, conviene
  bajar todos a mano: si no, el orden de ejecucion queda partido entre el decorador
  y el cuerpo de `onCreate()`, y el orden importa.

`@Scene({ systems })` acepta constructores; `runSystems` acepta instancias. Que
`systems` aceptara tambien instancias (`systems: [ChaseSystem, new DeathSystem(...)]`)
cerraria el agujero, aunque el caso "la dependencia es `this`" seguiria necesitando
una fabrica (`systems: scene => [...]`) o el DI por tokens que ya existe.

## 4. El teclado no tiene lugar en el modelo, y el que hay depende de un orden no documentado

No hay concepto de input. Lo que termine escribiendo es un objeto module-level
mutable refrescado en un listener de `PRE_UPDATE` registrado dentro de `onCreate()`:

```ts
const keys = { left: false, right: false, up: false, down: false }
this.events.on(Phaser.Scenes.Events.PRE_UPDATE, () => { keys.left = cursors.left.isDown; ... })
```

Funciona **solo porque** `GameScene#create()` registra su propio listener de
`PRE_UPDATE` despues de llamar a `onCreate()`, asi que el mio corre primero y los
systems ven el teclado del frame actual. Ese detalle no esta en la API publica: lo
verifique leyendo `src/scene/index.ts`. Si algun dia `GameScene` engancha su hook en
`init()` o en el constructor, el demo empieza a leer input con un frame de retraso y
nada falla ruidosamente.

`onUpdate(dt)` no sirve para esto porque corre **despues** de `runSystems`. Falta un
hook explicito antes de los systems (`onBeforeSystems()`), o una forma bendecida de
meter input en el world.

## 5. El orden dentro de `spawn` es un contrato posicional en una lista que parece un set

```ts
this.world.spawn(
  set(Position, { x, y }),   // <- obligatorio, y obligatoriamente antes
  set(Velocity, { x: 0, y: 0 }),
  Player,
  set(Health, { hp: 100 }),
  sprite(A.player),          // <- su observer lee Position
)
```

El error cuando falta `Position` es bueno (dice exactamente que hacer). El que
`Position` este *antes* no lo verifica nadie: si va despues, el observer lee la celda
de la entidad anterior que ocupo ese eid y el sprite nace en un lugar arbitrario. Es
un `spawn(...)` variadico, que se lee como un conjunto sin orden, con dos reglas de
orden implicitas. Lo mismo aplica a `Velocity`: si no esta en el spawn, `preSync`
nunca toca el body.

## 6. `QueryResult` es iterable y nada mas

Para tomar al jugador: `const target = [...this.players][0]`. Aloca un array por
frame para leer un elemento. `QueryResult` tiene `length` pero no indexacion, ni
`first()`, ni `at()`. Tener `length` y no `[i]` es ademas contraintuitivo: parece un
array hasta que lo indexas.

Tampoco hay relacion de tipos entre los componentes que pide la query y las columnas
que uno lee adentro del loop: nada impide leer `Health.hp[e]` en una query que no
incluye `Health`, y el resultado es basura silenciosa.

## 7. Repeticion en la declaracion de queries

```ts
@Query(Enemy, Position, Velocity) enemies!: QueryResult
```

El nombre del campo, el `!`, y el tipo `QueryResult` se repiten en cada query y no se
pueden inferir del decorador. Son tres queries en el demo y ya se siente ceremonial.

## 8. El inicializador del componente ya no es decoracion, y eso cambia decisiones

El brief declaraba `@i16 hp = 0`. Con los defaults reales, y con `DeathSystem` en la
escena, eso significa "toda entidad que reciba `Health` sin nombrar `hp` en el
`set()` muere en el primer frame". Lo cambie a `hp = 100`.

El comportamiento es correcto y esta bien documentado en `component.ts`, pero
`= 0` se lee como "campo vacio" y significa "valor de reseteo". El costo cae entero
sobre quien escribe el componente, y solo se nota cuando algo muere sin motivo.

## 9. Mutar el world mientras se itera una query

`DeathSystem` llama a `this.world.destroy(e)` dentro del `for` de su propia query.
El JSDoc de `World.query` advierte que bitECS devuelve "la referencia viva que muta
in-place", pero no dice si destruir durante la iteracion es legal. Escribi el system
sin saberlo. Deberia estar respondido explicitamente en el JSDoc de `destroy`, en un
sentido o en el otro.

## 10. El barrel exporta cosas que el usuario no debe llamar

`preSync`, `postSync` y `runSystems` estan en `src/index.ts`, y las tres las corre
`GameScene` sola. Un usuario que lea el autocompletado ve tres funciones con nombres
que suenan exactamente a lo que necesita y las llama, con lo cual duplica el sync.
El brief original de esta tarea, de hecho, describia una version donde habia que
llamarlas. O se mueven a un subpath (`phaserx/internal`) o el JSDoc tiene que
empezar con "no llamar a mano".

## 11. `attachSprites` devuelve un `detach()` que no tiene donde ir

La escena lo ignora porque no hay hook de shutdown en `GameScene`. O `GameScene` lo
engancha sola al `SHUTDOWN`, o hay que exponer un `onShutdown()` para que el usuario
tenga donde poner la limpieza. Tal como esta, el valor de retorno se descarta y el
usuario ni se entera de que habia algo que limpiar.

## Lo que si funciono bien

- El error de `Sprite` sin `Position` dice literalmente que hacer y donde. Es el
  mejor mensaje del framework.
- No haber tenido que pensar nunca en el orden systems -> preSync -> fisica ->
  postSync. Se escribio el demo sin tocarlo y salio bien a la primera.
- `set(Position, { x, y })` tipa las columnas correctamente: un `{ z: 0 }` o un
  `{ x: 'a' }` los agarra `tsc`.
- `component(class { @f32 x = 0 })` como funcion y no como decorador de clase: el
  store queda con tipos utiles (`Position.x[e]` es `number`) sin ningun cast.
