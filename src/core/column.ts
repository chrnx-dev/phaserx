/** Una columna de datos numericos indexada por entity id. */
export type Column = { [i: number]: number; readonly length: number }

/** Descriptor de columna recolectado por los field decorators. */
export type ColumnSpec = { name: string; make: (capacity: number) => unknown }

/**
 * Buffer module-level de columnas pendientes.
 *
 * Los field decorators se aplican al definirse la clase, antes de que
 * `component()` reciba la clase ya construida. Cada decorador empuja su
 * descriptor aca y `component()` drena el buffer inmediatamente despues.
 * El orden lo garantiza la especificacion de decoradores: todos los field
 * decorators de una clase corren durante su definicion.
 */
let pending: ColumnSpec[] = []

/** Vacia el buffer y devuelve lo acumulado. Solo lo usa `component()`. */
export function drainColumns(): ColumnSpec[] {
  const cols = pending
  pending = []
  return cols
}

/**
 * Rechaza un campo invalido descartando el batch en curso.
 *
 * Si un field decorator lanza, la clase nunca termina de definirse y por lo
 * tanto nunca llega a `component()`, asi que nadie drena el buffer. Sin este
 * descarte las columnas ya acumuladas de esa clase se filtrarian al proximo
 * componente que se defina, que puede ser uno totalmente ajeno.
 */
function reject(who: string, name: string | symbol, why: string): never {
  pending = []
  throw new Error(`${who}: '${String(name)}' ${why}`)
}

function numericColumn(make: (capacity: number) => unknown) {
  return function <T>(_value: undefined, ctx: ClassFieldDecoratorContext<T, number>) {
    if (ctx.static) reject('@column', ctx.name, 'no puede ser static')
    if (ctx.private) reject('@column', ctx.name, 'no puede ser privado')
    pending.push({ name: String(ctx.name), make })
  }
}

export const f32 = numericColumn(n => new Float32Array(n))
export const f64 = numericColumn(n => new Float64Array(n))
export const i8 = numericColumn(n => new Int8Array(n))
export const i16 = numericColumn(n => new Int16Array(n))
export const i32 = numericColumn(n => new Int32Array(n))
export const u8 = numericColumn(n => new Uint8Array(n))
export const u16 = numericColumn(n => new Uint16Array(n))
export const u32 = numericColumn(n => new Uint32Array(n))
