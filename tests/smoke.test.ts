import { expect, test } from 'vitest'
import { VERSION } from '../src/index'

test('el paquete exporta su version', () => {
  expect(VERSION).toBe('0.1.0')
})
