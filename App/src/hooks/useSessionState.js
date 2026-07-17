import { useState } from 'react'

export default function useSessionState(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = sessionStorage.getItem(key)
      return stored === null ? initialValue : JSON.parse(stored)
    } catch {
      return initialValue
    }
  })

  const updateValue = (nextValue) => {
    setValue((current) => {
      const resolved = typeof nextValue === 'function' ? nextValue(current) : nextValue
      try {
        sessionStorage.setItem(key, JSON.stringify(resolved))
      } catch {
        // Session persistence is optional; in-memory state still works.
      }
      return resolved
    })
  }

  return [value, updateValue]
}

