/**
 * Service locator minimo.
 *
 * No hay inyeccion por tipo inferido a proposito: eso exigiria decoradores
 * legacy y reflect-metadata, que solo funcionan con clases (no interfaces),
 * se rompen con imports circulares y obligan a un plugin de bundler. Un juego
 * necesita un punado de servicios; el token explicito los cubre sin runtime extra.
 */
export class Token<T> {
  declare private readonly __type?: T // hace el token invariante en T
  constructor(readonly name: string) {}
}

const providers = new Map<Token<unknown>, unknown>()

export function provide<T>(token: Token<T>, value: T): void {
  providers.set(token as Token<unknown>, value)
}

export function resolve<T>(token: Token<T>): T {
  if (!providers.has(token as Token<unknown>)) {
    throw new Error(`DI: no hay provider para el token '${token.name}'`)
  }
  return providers.get(token as Token<unknown>) as T
}

export function clearProviders(): void {
  providers.clear()
}

/** Resuelve el token al construirse la instancia. */
export function Inject<T>(token: Token<T>) {
  return function <C extends object>(
    _value: undefined,
    _ctx: ClassFieldDecoratorContext<C, T>,
  ) {
    return function (): T {
      return resolve(token)
    }
  }
}
