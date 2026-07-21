import { Position, Query, type QueryResult, System, Velocity } from '../src/index'
import { Enemy, Health, Player } from './components'

const SPEED = 200

/** Estado del teclado que la escena refresca antes de correr los systems. */
export type Keys = { left: boolean; right: boolean; up: boolean; down: boolean }

@System()
export class PlayerInputSystem {
  @Query(Player, Velocity) players!: QueryResult

  constructor(private readonly keys: Keys) {}

  update(): void {
    for (const e of this.players) {
      Velocity.x[e] = (this.keys.right ? SPEED : 0) - (this.keys.left ? SPEED : 0)
      Velocity.y[e] = (this.keys.down ? SPEED : 0) - (this.keys.up ? SPEED : 0)
    }
  }
}

@System()
export class ChaseSystem {
  @Query(Enemy, Position, Velocity) enemies!: QueryResult
  @Query(Player, Position) players!: QueryResult

  update(): void {
    const target = [...this.players][0]
    if (target === undefined) return
    for (const e of this.enemies) {
      const dx = Position.x[target] - Position.x[e]
      const dy = Position.y[target] - Position.y[e]
      const dist = Math.hypot(dx, dy) || 1
      const speed = Enemy.chaseSpeed[e]
      Velocity.x[e] = (dx / dist) * speed
      Velocity.y[e] = (dy / dist) * speed
    }
  }
}

@System()
export class DeathSystem {
  @Query(Health) mortales!: QueryResult

  constructor(private readonly onDeath: (entity: number) => void) {}

  update(): void {
    for (const e of this.mortales) {
      if (Health.hp[e] <= 0) this.onDeath(e)
    }
  }
}
