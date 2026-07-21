import Phaser from 'phaser'
import { JuegoScene } from './game.scene'
import { FinScene } from './gameover.scene'
import { exposeTestbed } from './testbed'

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: 800,
  height: 600,
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 } } },
  scene: [JuegoScene, FinScene],
})

// Andamiaje de verificacion (demo/verify/). Es la unica linea del demo que
// existe para los tests; ver demo/testbed.ts.
exposeTestbed(game)
