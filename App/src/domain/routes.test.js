import { describe, expect, it } from 'vitest'
import { preloadAllRoutes, preloadRoute, routeLoaders } from '../routes.js'

describe('route preloading', () => {
  it('defines every authenticated operational page', () => {
    expect(Object.keys(routeLoaders).sort()).toEqual(
      ['balance', 'finance', 'home', 'order', 'sales', 'settings', 'stock'].sort(),
    )
  })

  it('reuses preloaded modules and resolves all routes', async () => {
    const first = preloadRoute('home')
    const second = preloadRoute('home')
    expect(first).toBe(second)

    const results = await preloadAllRoutes()
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true)
  }, 60000)
})
