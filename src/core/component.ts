import { type Column, drainColumns } from './column'

export const DEFAULT_CAPACITY = 10_000

/** Mapea la forma de instancia de la clase a su store de columnas. */
export type SoA<T> = { [K in keyof T]: T[K] extends number ? Column : T[K][] }

/**
 * Materializa una clase de declaracion en un store SoA.
 *
 * Es una funcion y no un class decorator porque TypeScript no ensancha el
 * tipo de una clase con el valor devuelto por su decorador: `@Component`
 * daria `Property 'x' does not exist on type 'typeof Position'` en cada
 * acceso. Verificado con tsc --strict.
 */
export function component<C extends new () => unknown>(
  cls: C,
  capacity: number = DEFAULT_CAPACITY,
): SoA<InstanceType<C>> {
  void cls // la clase solo aporta su tipo; los datos vienen del buffer
  const store: Record<string, unknown> = {}
  for (const col of drainColumns()) store[col.name] = col.make(capacity)
  return store as SoA<InstanceType<C>>
}
