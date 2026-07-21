/**
 * ANDAMIAJE DE TEST. No es parte del demo ni del framework.
 *
 * Expone en `globalThis.__phaserx` las referencias minimas que los scripts de
 * `demo/verify/` necesitan para medir desde el navegador: la instancia del
 * juego (de ahi salen las escenas, sus worlds y sus display lists) y los
 * stores de los componentes, que son estado de modulo y no se pueden alcanzar
 * de otra forma desde `page.evaluate`.
 *
 * Deliberadamente NO define ninguna funcion de snapshot: la logica de medicion
 * vive entera en los scripts de verificacion, para que este archivo sea el
 * unico punto de contacto entre el demo y el arnes de test, y para que el
 * codigo que un usuario lee para evaluar el framework (game.scene.ts) no tenga
 * una sola linea de instrumentacion.
 */
import type Phaser from 'phaser'
import { Position, Sprite, Velocity } from '../src/index'
import { Damage, Enemy, Health, Player } from './components'

export function exposeTestbed(game: Phaser.Game): void {
  ;(globalThis as unknown as Record<string, unknown>).__phaserx = {
    game,
    components: { Position, Velocity, Sprite, Health, Enemy, Player, Damage },
  }
}
