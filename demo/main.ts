import Phaser from 'phaser'
import { JuegoScene } from './game.scene'

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: 800,
  height: 600,
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 } } },
  scene: [JuegoScene],
})
