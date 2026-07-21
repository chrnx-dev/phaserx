import { type Column, drainColumns } from './column'

export const DEFAULT_CAPACITY = 10_000

/**
 * Capacidad con la que se materializa cada componente que se defina de aca en
 * mas. Ver `configureCapacity`.
 */
let configuredCapacity: number = DEFAULT_CAPACITY

/**
 * Cuantos componentes se definieron ya en este proceso. `configureCapacity`
 * la consulta para lanzar en vez de aceptar en silencio una llamada que ya no
 * puede tener efecto. Ver el JSDoc de `configureCapacity`.
 */
let definedComponents = 0

/**
 * Fija cuantos entity ids puede direccionar cada componente.
 *
 * Es module-level y no un parametro de `component()` a proposito. Los entity
 * ids se reparten desde un unico index compartido por todos los World del
 * proceso (ver src/core/world.ts), asi que el id de una entidad no tiene
 * relacion con cuantas entidades tienen ese componente: es la cuenta global de
 * entidades vivas de TODAS las escenas. Una capacidad por componente seria una
 * bomba de tiempo: un componente declarado con 4 lanzaria en su primer spawn
 * apenas otra escena hubiera repartido cuatro ids, aunque ese componente no lo
 * tuviera ni una entidad.
 *
 * Llamala UNA VEZ, antes de definir el primer componente. Si ya hay
 * componentes definidos, LANZA: no hay forma de que cambiar la capacidad
 * ahora tenga efecto sobre ellos, y aceptar la llamada en silencio es
 * exactamente el defecto que esta funcion vino a evitar (una perilla que
 * parece funcionar y no hace nada). Los componentes ya definidos conservan la
 * capacidad que tenian: cambiarla a mitad de camino dejaria columnas de
 * distinto largo y el guard de `spawn` pasaria a depender de cual componente
 * se mire, asi que ni siquiera se ofrece esa opcion.
 *
 * Advertencia de ESM: los `import` de un modulo se izan y se evaluan ANTES de
 * la primera sentencia del cuerpo, asi que
 *
 * ```ts
 * // main.ts — NO FUNCIONA
 * import { configureCapacity } from 'phaserx'
 * import { Position } from './components' // este modulo ya corrio y definio
 * configureCapacity(50_000)                // Position antes de esta linea
 * ```
 *
 * define `Position` con la capacidad default antes de que `configureCapacity`
 * llegue a correr. Y ni siquiera alcanza con mover ese `import` a un modulo de
 * solo efecto propio si lo trae de `'phaserx'`: el barrel reexporta el bridge,
 * que define sus propios `Position`/`Velocity`/`Sprite` al evaluarse, y por la
 * misma razon (los `import` se izan) ya estan definidos para cuando la llamada
 * a `configureCapacity()` llega a correr. Por eso esta funcion tiene su propio
 * punto de entrada, `'phaserx/capacity'`, cuyo grafo de modulos no toca el
 * bridge:
 *
 * ```ts
 * // capacity.ts
 * import { configureCapacity } from 'phaserx/capacity'
 * configureCapacity(50_000)
 * ```
 * ```ts
 * // main.ts
 * import './capacity'       // corre y configura ANTES de lo que sigue
 * import { Position } from 'phaserx'
 * ```
 *
 * (un `await import('phaserx/capacity')` dinamico antes de importar el resto
 * de `'phaserx'` tambien funciona, por la misma razon: nada obliga a que la
 * evaluacion del barrel empiece antes de que termine el `await`). Ver la
 * seccion "La capacidad es global al proceso" del README para la receta
 * completa.
 */
export function configureCapacity(n: number): void {
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`configureCapacity: la capacidad debe ser un entero positivo, no ${n}`)
  }
  if (definedComponents > 0) {
    throw new Error(
      `configureCapacity: ya se definieron ${definedComponents} componente(s) con capacidad ` +
        `${configuredCapacity}; esta llamada no tendria efecto sobre ellos. configureCapacity() ` +
        'debe correr antes de que se evalue el primer modulo que define componentes. En ESM los ' +
        'import se izan, asi que no alcanza con ponerla antes en el mismo archivo: llamala desde ' +
        "un modulo de solo efecto importado PRIMERO en el entry (import './capacity') que traiga " +
        "configureCapacity de 'phaserx/capacity' (no de 'phaserx': ese barrel reexporta el bridge, " +
        'que define sus propios componentes al evaluarse), o con un await import() dinamico antes ' +
        'de importar los componentes.',
    )
  }
  configuredCapacity = n
}

/** Capacidad vigente para los proximos `component()`. */
export function getConfiguredCapacity(): number {
  return configuredCapacity
}

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
 * Capacidad (cantidad de entity ids direccionables) por store.
 *
 * Vive en su propio WeakMap por la misma razon que los defaults: el store no
 * puede tener claves que no sean columnas. La consulta `World.spawn` para
 * detectar el desborde del espacio de ids, que de otro modo es silencioso: un
 * `Float32Array` ignora la escritura fuera de rango y devuelve `undefined` al
 * leer, mientras que las columnas `@ref` (arrays JS) crecen sin limite.
 */
const capacities = new WeakMap<object, number>()

/**
 * Valores de reseteo declarados por el componente, o `undefined` si el store
 * no lo produjo `component()`. Lo consulta `World.spawn` para limpiar las
 * columnas de un entity id reciclado, y `World.destroy` para soltar las
 * referencias de la entidad que se va.
 */
export function getDefaults(store: object): Readonly<Record<string, unknown>> | undefined {
  return defaults.get(store)
}

/**
 * Capacidad declarada del store, o `undefined` si no lo produjo `component()`.
 */
export function getCapacity(store: object): number | undefined {
  return capacities.get(store)
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
 *
 * La clase de declaracion se instancia una vez (`new cls()`) para leer esos
 * valores, asi que debe poder construirse sin argumentos y sin efectos
 * secundarios: nada de I/O, registros globales ni acceso al DOM en sus
 * inicializadores de campo.
 *
 * ADVERTENCIA: un `@ref` con inicializador objeto comparte UNA SOLA instancia
 * entre todas las entidades, porque el default se captura de esa unica
 * instancia y se asigna por referencia a cada celda:
 *
 * ```ts
 * const Cfg = component(class { @ref cfg: object = {} })
 * Cfg.cfg[a] === Cfg.cfg[b] // true: mutar uno muta a todos
 * ```
 *
 * Si cada entidad necesita su propio objeto, declara el campo sin
 * inicializador (`@ref cfg!: object`) y pasa la instancia en el `set()` del
 * spawn.
 *
 * La capacidad de las columnas no es un parametro: es global al proceso y se
 * fija con `configureCapacity()` antes de definir el primer componente.
 */
export function component<C extends new () => unknown>(cls: C): SoA<InstanceType<C>> {
  const capacity = configuredCapacity
  const store: Record<string, unknown> = {}
  for (const col of drainColumns()) store[col.name] = col.make(capacity)

  // Instanciar la clase corre los inicializadores de campo y recupera los
  // valores declarados. Es una sola vez, al definir el componente.
  const declared = new cls() as Record<string, unknown>
  const initial: Record<string, unknown> = {}
  for (const name of Object.keys(store)) initial[name] = declared[name]
  defaults.set(store, initial)
  capacities.set(store, capacity)
  definedComponents++

  return store as SoA<InstanceType<C>>
}
