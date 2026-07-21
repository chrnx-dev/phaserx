# Limitaciones conocidas — v0.1

Nada de esto rompe el demo ni los tests. Es lo que sabemos que falta o incomoda,
anotado para no redescubrirlo. Cada punto se verificó empíricamente.

## Huecos de API que un juego va a pedir

**`World` no puede agregar ni quitar componentes de una entidad viva.**
No hay `add(entity, component)` ni `remove(...)`: los componentes se fijan en
`spawn()`. Impide modelar estados (`Stunned`, `Invulnerable`) salvo con flags
numéricos, y deja los observers `onAdd`/`onRemove` limitados a spawn y destroy,
mucho menos de lo que la API aparenta ofrecer. Es el hueco más grande.

**`@Scene({ systems })` solo acepta constructores sin argumentos.**
En cuanto un system necesita una dependencia hay que bajar todos a
`this.systems = [...]` en `onCreate()`, que pisa en silencio lo que el decorador
construyó. El demo, único consumidor real, nunca usa la feature. Arreglo natural:
aceptar instancias además de clases.

**El input no tiene lugar en el modelo.**
El demo lo resuelve con un listener de `PRE_UPDATE` propio, y funciona porque
`GameScene` registra el suyo después de `onCreate()`. Mover esa línea haría que
todo el input leyera un frame viejo, en silencio. Falta un hook `onBeforeSystems()`.

**`QueryResult` tiene `length` pero no indexación.**
Sin `at()` ni `first()`, tomar una sola entidad obliga a `[...query][0]`, que
aloca un array por frame.

## Silencios que deberían ser ruido

**Columnas huérfanas se filtran al próximo `component()`.**
Una clase con `@f32` que nunca pasa por `component()` regala sus columnas al
siguiente componente definido: `component(class {})` puede salir con columnas
ajenas. El mismo mecanismo en `@Asset` sí detecta huérfanos y avisa; el de
columnas no. La asimetría es el arreglo pendiente.

**`World.teardown()` no vacía los hooks de frame**, solo los de teardown. Como
`GameScene` reutiliza la misma instancia de `World` entre entradas a la escena,
un `world.onPreSync(...)` de usuario se acumula uno por entrada.

**`spawn(sprite(...))` sin haber llamado `attachSprites` no crea GameObject y no
avisa.** La entidad queda con componente `Sprite` y sin nada que dibujar.

**Sin chequeo de rango en columnas**: `@u8 chaseSpeed = 300` se envuelve en
silencio a 44.

**Residuo inalcanzable en el rollback de `spawn`**: si falla por columna
inexistente, ese componente nunca llegó a `addComponent`, así que el rollback no
resetea sus columnas ya escritas. No es alcanzable hoy —todo camino que asigna un
componente resetea primero— pero es frágil.

## Spec contra implementación

**`preSync` no copia escala ni rotación**, que el spec nombra, ni `postSync`
expone resultados de colisión. Hoy es solo posición y velocidad.

**`@ref` usa arrays JS planos, no el helper `aos()` de bitECS** que el spec
promete. La implementación es mejor; el texto del spec quedó viejo.

## Ergonomía y capas

**`Position` y `Velocity` viven en `bridge/`**, así que lógica puramente ECS
importa del puente a Phaser. Y el barrel importa Phaser como valor, así que traer
`component` arrastra Phaser entero. El entry point `phaserx/capacity` demuestra
que el corte es posible cuando hace falta.

**Los campos `@Asset` son propiedades muertas** cuyo único propósito es su efecto
secundario de registro. Un refactor de "borrar campos sin usar" rompe la carga.

**`@Inject` resuelve al construir**, así que `provide()` tiene que correr antes de
`new Phaser.Game`.

**Dos mecanismos `pending`/`drain`/`reject` idénticos** en `core/column.ts` y
`assets/index.ts`, sin helper común.

**Mutar el world durante la iteración de una query no está documentado.**
Verificado en bitECS 0.4: destruir es seguro, pero spawnear hace correr las
entidades nuevas en el mismo frame.

**El orden de una query es de inserción, no de entity id.**

**`detach()` deja entidades zombi** en `query(Sprite)`, invisibles e
irrecuperables al re-enganchar. Documentado en su JSDoc; el camino sigue ahí.

**`.prettierrc` no describe el codebase** (`printWidth`, `trailingComma`) y no hay
script de lint que lo corra.
