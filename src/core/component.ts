import { type Column, drainColumns } from './column'

export const DEFAULT_CAPACITY = 10_000

/** Mapea la forma de instancia de la clase a su store de columnas. */
export type SoA<T> = { [K in keyof T]: T[K] extends number ? Column : T[K][] }

/**
 * Valores de reseteo por store, indexados por nombre de columna.
 *
 * Vive en un WeakMap module-level y no como propiedad del store a proposito:
 * el store debe seguir teniendo exactamente una clave por columna
 * (`Object.keys(Position) === ['x', 'y']`), porque bitECS y el codigo de
 * usuario lo recorren como tal.
 */
const defaults = new WeakMap<object, Readonly<Record<string, unknown>>>()

/**
 * Valores de reseteo declarados por el componente, o `undefined` si el store
 * no lo produjo `component()`. Lo consulta `World.spawn` para limpiar las
 * columnas de un entity id reciclado.
 */
export function getDefaults(store: object): Readonly<Record<string, unknown>> | undefined {
  return defaults.get(store)
}

/**
 * Materializa una clase de declaracion en un store SoA.
 *
 * Es una funcion y no un class decorator porque TypeScript no ensancha el
 * tipo de una clase con el valor devuelto por su decorador: `@Component`
 * daria `Property 'x' does not exist on type 'typeof Position'` en cada
 * acceso. Verificado con tsc --strict.
 *
 * Los valores iniciales de la clase de declaracion NO son decoracion: son los
 * defaults de reseteo del componente. `component(class { @i16 hp = 100 })`
 * significa que toda entidad que reciba ese componente arranca con hp = 100, y
 * que un `set()` parcial deja las columnas no mencionadas en ese valor en vez
 * de en los datos del ocupante anterior del entity id (los ids se reciclan y
 * las columnas son buffers compartidos). Un campo sin inicializador
 * (`@ref go!: SpriteLike`) resetea a `undefined` si es por referencia y a 0 si
 * es numerico, porque un TypedArray no puede guardar `undefined`.
 */
export function component<C extends new () => unknown>(
  cls: C,
  capacity: number = DEFAULT_CAPACITY,
): SoA<InstanceType<C>> {
  const store: Record<string, unknown> = {}
  for (const col of drainColumns()) store[col.name] = col.make(capacity)

  // Instanciar la clase corre los inicializadores de campo y recupera los
  // valores declarados. Es una sola vez, al definir el componente.
  const declared = new cls() as Record<string, unknown>
  const initial: Record<string, unknown> = {}
  for (const name of Object.keys(store)) initial[name] = declared[name]
  defaults.set(store, initial)

  return store as SoA<InstanceType<C>>
}
