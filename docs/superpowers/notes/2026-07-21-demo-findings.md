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
en dev es `esnext`, con lo cual esbuild deja los decoradores stage-3 tal cual en el
modulo servido. Lo verificado es que **Chromium 141** (el que trae Playwright 1.61,
que es donde se corren los scripts de `demo/verify/`) no parsea ese modulo. No se
probo ningun otro navegador, asi que el alcance real del problema queda abierto; lo
que si es concreto es que con la config default de Vite el demo no arranca. Hay que
forzar `esbuild: { target: 'es2022' }` (y el equivalente en `optimizeDeps` y `build`).

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

---

Los tres que siguen salieron de la segunda vuelta, la que agrego colisiones, muerte y
cambio de escena al demo. Todos tienen medicion en navegador; los scripts que las
producen estan en `demo/verify/` y se corren con `node demo/verify/lifecycle.mjs` y
`node demo/verify/reentry.mjs`.

## 12. El ciclo de vida de escena no tiene dueno: la limpieza queda entera en el usuario

Es la continuacion del 11, pero medida, y es el hallazgo mas caro de los tres.
`GameScene` no engancha **nada** al `SHUTDOWN` de Phaser. Cuando una escena de
PhaserX termina, Phaser hace su parte (destruye el display list, y con el los
GameObjects) y el world queda intacto: las entidades siguen vivas, el bridge sigue
enganchado, y `Sprite.go` sigue apuntando a GameObjects que ya no existen.

Lo que hay que escribir a mano en cada escena, hoy, es esto, y el orden no es
negociable:

```ts
const detach = attachSprites(this.world, (key, x, y) => this.physics.add.sprite(x, y, key))
this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
  for (const e of [...this.world.query(Position)]) this.world.destroy(e)  // primero
  detach()                                                                // despues
})
```

Tres cosas que el usuario tiene que deducir solo, ninguna documentada:

- **Destruir antes de `detach()`.** Al reves, el observer `onRemove` del bridge ya no
  esta y cada entidad deja su `Sprite.go` y sus sombras de posicion colgadas para
  siempre.
- **No hay forma de decir "todas las entidades".** `World` no tiene `clear()` ni
  `destroyAll()`, y `query()` exige al menos un componente. El demo consulta por
  `Position` y funciona solo porque en el demo toda entidad tiene `Position`.
- **La copia con spread es obligatoria** (`[...this.world.query(...)]`): `query()`
  devuelve el array vivo de bitECS y `destroy()` lo muta mientras se lo recorre.

**Medicion del costo de olvidarse.** Se desactivo el bloque de limpieza y se
volvieron a correr los mismos scripts:

| | con la limpieza | sin la limpieza |
|---|---|---|
| entidades del world al apagar la escena | 0 | 6 |
| referencias `Sprite.go` vivas tras la transicion (con 1 sprite real en pantalla) | 1 | 4 |
| eid de la entidad de la escena nueva | 3 (reciclado del world viejo) | 5 (los eids de la escena vieja quedan tomados para siempre) |
| volver a entrar a la escena | funciona | **lanza**: `attachSprites: el world ya esta enganchado con otra factory` |

La ultima fila es la peor: sin `detach()`, la segunda entrada a la escena muere
adentro de `GameScene#create()`, porque `onCreate()` construye una factory nueva
(es un arrow literal) y el bridge, correctamente, se niega a re-enganchar. O sea que
el usuario que ignora el valor de retorno de `attachSprites` (que es lo que invita a
hacer una API que devuelve algo sin decir para que) tiene un juego que funciona hasta
la primera vez que alguien vuelve a un nivel.

Y la fila de los eids importa por lo que dice `src/core/world.ts`: el entity index es
**compartido por todos los World** y las columnas son buffers de modulo con capacidad
fija. Entidades que no se destruyen no devuelven su eid, asi que cada transicion de
escena consume espacio de ids de forma permanente hasta llegar al error de capacidad.

Lo que falta es un dueno: que `GameScene` enganche el `SHUTDOWN` por su cuenta
(destruir el world y soltar el bridge), o al menos un `onShutdown?()` simetrico con
`onCreate()`. El framework ya tiene todas las piezas (`detach`, `destroy`,
`resetToDefaults`); lo unico que falta es el lugar donde llamarlas.

## 13. `GameScene` acumula un listener de frame por cada entrada a la escena

`GameScene#create()` hace `this.events.on(PRE_UPDATE, ...)` y `on(POST_UPDATE, ...)`
y nunca los da de baja. `Systems#shutdown()` de Phaser solo remueve los eventos de
transicion, no los de frame, y el emitter sobrevive al shutdown. Entonces cada vez que
se vuelve a entrar a la escena se suma un par de listeners, y con el un pase completo
de `runSystems` + `preSync` (y otro de `postSync`) por frame.

Medido con `demo/verify/reentry.mjs`, entrando y saliendo cuatro veces:

```
listeners de PRE_UPDATE por numero de entrada:  [5, 6, 7, 8]
postupdate, primera vs segunda entrada:          2 -> 3
```

(el 5 inicial incluye los listeners propios de Phaser y el del teclado del demo; lo
que importa es el +1 por entrada, que es el de `GameScene`).

El sintoma no es un crash sino un juego que se pone raro despues de un rato: los
systems corren N veces por frame. Lo que **no** se duplica es la velocidad de las
entidades, porque `preSync` escribe `body.velocity` de forma idempotente y el step de
fisica sigue siendo uno por frame; pero cualquier system con efecto acumulativo
(timers, cooldowns, dano por tick, spawns) si se multiplica, y en silencio.

Por esto el demo no ofrece "reiniciar" desde la pantalla de game over: seria vender
como funcionalidad un camino que el framework todavia no sostiene.

La correccion es trivial y va del lado del framework: guardar las dos funciones y
darlas de baja en un `this.events.once(SHUTDOWN, ...)`. El usuario no puede hacerlo
por su cuenta, porque los handlers son closures anonimas dentro de `create()`: lo
unico a su alcance es `events.off(PRE_UPDATE)` sin argumentos, que se lleva puestos
tambien los listeners de Phaser y los suyos propios.

## 14. De un GameObject no se puede volver a la entidad

Todo lo que la fisica de Phaser reporta esta en GameObjects (`overlap`, `collider`,
`pointerdown`), y todo lo que el ECS entiende son eids. El bridge no ofrece ninguna
de las dos direcciones del mapeo: no hay `entityOf(go)`, y la `SpriteFactory` recibe
`(key, x, y)` sin el eid, asi que ni siquiera en el momento de crear el GameObject se
sabe para quien es.

El demo lo resuelve como puede, y el resultado es feo en los dos extremos:

```ts
const go = Sprite.go[e] as unknown as Phaser.Physics.Arcade.Sprite  // doble cast
go.setData('eid', e)
// ...
const eid = a.getData('eid') as Entity                              // y otro cast
```

El `as unknown as` es inevitable porque `Sprite.go` esta tipado como `SpriteLike`
(la interfaz minima que el bridge usa para testear sin canvas), que no es
estructuralmente compatible con un `Phaser.GameObjects.Sprite`. La decision de tipar
el bridge contra `SpriteLike` esta bien; lo que falta es un generico o un helper que
le devuelva al usuario el tipo que su factory realmente produce.

Arreglos posibles, de menor a mayor: pasarle el eid a la factory
(`(key, x, y, eid) => ...`), exponer `entityOf(go)` en el bridge, o que el bridge
escriba el eid en el `data` del GameObject por su cuenta.

## Lo que si funciono bien

- El error de `Sprite` sin `Position` dice literalmente que hacer y donde. Es el
  mejor mensaje del framework.
- No haber tenido que pensar nunca en el orden systems -> preSync -> fisica ->
  postSync. Se escribio el demo sin tocarlo y salio bien a la primera.
- `set(Position, { x, y })` tipa las columnas correctamente: un `{ z: 0 }` o un
  `{ x: 'a' }` los agarra `tsc`.
- `component(class { @f32 x = 0 })` como funcion y no como decorador de clase: el
  store queda con tipos utiles (`Position.x[e]` es `number`) sin ningun cast.
- El `onRemove` del bridge no se equivoca nunca. En las 41 muestras que toma
  `lifecycle.mjs` durante una partida entera (con muertes de entidades en el medio)
  el numero de entidades y el de GameObjects del display list coinciden siempre:
  destruir la entidad destruye el sprite en el mismo paso, sin frames intermedios
  donde uno sobreviva al otro.
- Los eids reciclados entre escenas arrancan limpios de verdad. La entidad sonda de
  la segunda escena reusa un eid de la primera (medido: eid 3, que en la escena
  anterior estaba en `(374, 268)`) y nace exactamente en su spawn point `(400, 380)`.
  El reseteo de columnas de `spawn`/`destroy` hace lo que promete.
- La idempotencia de `attachSprites` y su error al recibir otra factory no son
  paranoia: son justo lo que convierte "olvide el detach" en una excepcion con
  instrucciones en vez de en dos observers duplicados creando GameObjects huerfanos.
