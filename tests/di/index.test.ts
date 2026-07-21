import { beforeEach, describe, expect, test } from 'vitest'
import { clearProviders, Inject, provide, resolve, Token } from '../../src/di/index'

interface Audio {
  play(key: string): string
}

const AudioToken = new Token<Audio>('Audio')

const fakeAudio: Audio = { play: key => `sonando ${key}` }

describe('DI', () => {
  beforeEach(() => clearProviders())

  test('resolve devuelve el valor provisto', () => {
    provide(AudioToken, fakeAudio)
    expect(resolve(AudioToken)).toBe(fakeAudio)
  })

  test('resolve sin provider lanza un error que nombra el token', () => {
    expect(() => resolve(AudioToken)).toThrow(/Audio/)
  })

  test('@Inject resuelve al construir', () => {
    provide(AudioToken, fakeAudio)
    class Player {
      @Inject(AudioToken) audio!: Audio
    }
    expect(new Player().audio.play('salto')).toBe('sonando salto')
  })

  test('@Inject sin provider lanza al construir', () => {
    class Player {
      @Inject(AudioToken) audio!: Audio
    }
    expect(() => new Player()).toThrow(/Audio/)
  })
})
