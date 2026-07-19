export const routeLoaders = {
  home: () => import('./pages/HomePage.jsx'),
  sales: () => import('./pages/SalesPage.jsx'),
  stock: () => import('./pages/StockPage.jsx'),
  finance: () => import('./pages/FinancePage.jsx'),
  balance: () => import('./pages/BalancePage.jsx'),
  order: () => import('./pages/OrderPage.jsx'),
  settings: () => import('./pages/AppSettingsPage.jsx'),
}

const preloadCache = new Map()

export function preloadRoute(route) {
  if (!routeLoaders[route]) return Promise.resolve()
  if (!preloadCache.has(route)) {
    preloadCache.set(route, routeLoaders[route]())
  }
  return preloadCache.get(route)
}

export function preloadAllRoutes() {
  return Promise.allSettled(Object.keys(routeLoaders).map(preloadRoute))
}
