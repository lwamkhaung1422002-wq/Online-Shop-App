/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { Alert, Snackbar } from '@mui/material'

const FeedbackContext = createContext(null)

export function FeedbackProvider({ children }) {
  const [message, setMessage] = useState(null)

  const notify = useCallback((text, severity = 'success') => {
    setMessage({ text, severity, key: Date.now() })
  }, [])

  const runMutation = useCallback(
    async (operation, successMessage) => {
      try {
        const result = await operation()
        if (successMessage) notify(successMessage, 'success')
        return result
      } catch (error) {
        notify(error?.message || 'The operation could not be completed.', 'error')
        throw error
      }
    },
    [notify],
  )

  const value = useMemo(() => ({ notify, runMutation }), [notify, runMutation])

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <Snackbar
        key={message?.key}
        open={Boolean(message)}
        autoHideDuration={5000}
        onClose={() => setMessage(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setMessage(null)}
          severity={message?.severity || 'info'}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {message?.text}
        </Alert>
      </Snackbar>
    </FeedbackContext.Provider>
  )
}

export function useFeedback() {
  const context = useContext(FeedbackContext)
  if (!context) throw new Error('useFeedback must be used within FeedbackProvider')
  return context
}

