/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  api,
  clearStoredToken,
  getStoredShopId,
  getStoredToken,
  storeShopId,
  storeToken,
} from '../services/api.js'

const AuthContext = createContext(null)

const previewUser = {
  id: 'preview-user',
  uid: 'preview-user',
  name: 'Preview Owner',
  email: 'preview@example.com',
  preview: true,
  shop: {
    id: 'preview-shop',
    name: 'General Shop Preview',
  },
  shops: [{ id: 'preview-shop', name: 'General Shop Preview' }],
}

function buildSession(result) {
  const shops = result.user?.shops || (result.shop ? [result.shop] : [])
  const savedShopId = getStoredShopId()
  const shop = shops.find((entry) => entry.id === savedShopId) || result.shop || shops[0] || null

  if (shop?.id) storeShopId(shop.id)

  return {
    ...result.user,
    uid: result.user?.id,
    shop,
    shops,
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => (getStoredToken() ? null : previewUser))
  const [loading, setLoading] = useState(() => Boolean(getStoredToken()))

  const restore = useCallback(async () => {
    const token = getStoredToken()
    if (!token) {
      setUser(previewUser)
      setLoading(false)
      return
    }

    try {
      const result = await api.me()
      setUser(buildSession(result))
    } catch {
      clearStoredToken()
      setUser(previewUser)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const token = getStoredToken()
    if (!token) return undefined

    let active = true
    api.me()
      .then((result) => {
        if (active) setUser(buildSession(result))
      })
      .catch(() => {
        clearStoredToken()
        if (active) setUser(previewUser)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const login = useCallback(async (email, password) => {
    const result = await api.login({ email: email.trim(), password })
    storeToken(result.token)
    setUser(buildSession(result))
    return result
  }, [])

  const register = useCallback(async (payload) => {
    const result = await api.register({
      name: payload.name.trim(),
      shopName: payload.shopName.trim(),
      email: payload.email.trim(),
      password: payload.password,
    })
    storeToken(result.token)
    setUser(buildSession(result))
    return result
  }, [])

  const logout = useCallback(() => {
    clearStoredToken()
    setUser(previewUser)
  }, [])

  const value = useMemo(
    () => ({
      user,
      shop: user?.shop || null,
      loading,
      login,
      register,
      logout,
      refreshSession: restore,
    }),
    [user, loading, login, register, logout, restore],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }

  return context
}
