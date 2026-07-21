import { ref } from '../../src/core/column'
import { component } from '../../src/core/component'

component(
  class {
    // @ts-expect-error para numeros va f32/i16/u8, no @ref
    @ref count!: number
  },
)
