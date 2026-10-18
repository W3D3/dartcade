import { describe, it, expect } from 'vitest'
import { isPublicRoute } from '../publicRoutes'

describe('isPublicRoute', () => {
  it.each(['#/login', '#/register', '#/verify?email=a%40b', '#/forgot', '#/reset?token=x', '#/terms', '#/privacy', '#/imprint'])(
    '%s is public',
    h => expect(isPublicRoute(h)).toBe(true),
  )
  it.each(['#/', '#/settings', '#/join/K7Q4MD', '#/termsx', ''])('%s is not', h => expect(isPublicRoute(h)).toBe(false))
})
