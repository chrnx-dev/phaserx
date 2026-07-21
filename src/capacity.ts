/**
 * Punto de entrada dedicado para `configureCapacity()`, separado a proposito
 * del barrel principal (`'phaserx'`).
 *
 * El barrel reexporta el bridge (`./bridge/index`), y el bridge define sus
 * propios componentes (`Position`, `Velocity`, `Sprite`) al evaluarse, en su
 * propio top-level. Como los `import`/`export ... from` de un modulo se izan
 * y se evaluan enteros antes de que el cuerpo del modulo que importa corra
 * una sola linea, hacer `import { configureCapacity } from 'phaserx'` ya
 * evalua TODO el grafo del barrel -bridge incluido- antes de que la llamada
 * a `configureCapacity()` que sigue llegue a ejecutarse. Para entonces
 * `Position`, `Velocity` y `Sprite` ya se definieron con la capacidad
 * default: llamar a `configureCapacity()` inmediatamente despues siempre
 * lanza, sin importar el orden de las lineas ni si es un modulo de solo
 * efecto, porque para cuando ese import se resuelve ya hay tres componentes
 * definidos.
 *
 * `'phaserx/capacity'` no reexporta nada de eso: su grafo de modulos es
 * unicamente `configureCapacity` y sus dependencias directas
 * (`core/column`, `core/component`), asi que importarlo no define ningun
 * componente. Es el punto de entrada que debe usar el modulo de solo efecto
 * de la receta de la seccion "La capacidad es global al proceso" del
 * README, y el unico camino por el que `configureCapacity()` puede llegar a
 * tener efecto sobre `Position`, `Velocity` y `Sprite`.
 */
export { configureCapacity } from './core/component'
