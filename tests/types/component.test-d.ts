import { f32 } from '../../src/core/column'
import { component } from '../../src/core/component'

const Position = component(class { @f32 x = 0 })

// @ts-expect-error 'z' no es una columna declarada
Position.z

// una columna declarada si existe y es indexable por numero
const _x: number = Position.x[0]
void _x
