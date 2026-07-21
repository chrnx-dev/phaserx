import { expect, test } from 'vitest'
import { VERSION } from '../src/index'

test('el paquete exporta su version', () => {
  expect(VERSION).toBe('26.7.0-alpha.0')
})
