import { component, f32, i16, u8 } from '../src/index'

/**
 * Los inicializadores son los defaults reales de reseteo, no decoracion.
 * `hp = 100` y no `hp = 0` a proposito: con DeathSystem en la escena, una
 * entidad que reciba Health sin nombrar hp en el `set()` arrancaria muerta.
 */
export const Health = component(class { @i16 hp = 100 })
export const Enemy = component(class { @u8 chaseSpeed = 60 })
export const Player = component(class {})
export const Damage = component(class { @f32 amount = 0 })
