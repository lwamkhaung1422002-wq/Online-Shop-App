import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import LockRoundedIcon from '@mui/icons-material/LockRounded'
import StorefrontRoundedIcon from '@mui/icons-material/StorefrontRounded'
import { useAuth } from '../contexts/AuthContext.jsx'

function getAuthErrorMessage(error) {
  return error?.message || 'Login failed.'
}

export default function LoginPage() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [shopName, setShopName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      if (mode === 'register') {
        await register({ name, shopName, email, password })
      } else {
        await login(email, password)
      }
    } catch (loginError) {
      setError(getAuthErrorMessage(loginError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '1.1fr 0.9fr' },
        bgcolor: 'background.default',
      }}
    >
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          justifyContent: 'space-between',
          p: 7,
          color: 'white',
          background:
            'radial-gradient(circle at 80% 20%, rgba(255,255,255,.22), transparent 22rem), linear-gradient(145deg, #39229b, #6d4aff 58%, #9678ff)',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <StorefrontRoundedIcon />
          <Typography fontWeight={900}>Shop Owner</Typography>
        </Box>
        <Box sx={{ maxWidth: 560 }}>
          <Typography variant="h2" fontWeight={900} sx={{ letterSpacing: '-0.04em' }}>
            Run your shop with confidence.
          </Typography>
          <Typography sx={{ mt: 2, opacity: 0.82, fontSize: 18 }}>
            Orders, inventory, payments, expenses, and profit kept together in one clear workspace.
          </Typography>
        </Box>
        <Typography variant="body2" sx={{ opacity: 0.72 }}>
          Secure owner workspace - API-backed shop data
        </Typography>
      </Box>

      <Box sx={{ display: 'grid', placeItems: 'center', p: { xs: 2, sm: 4 } }}>
        <Card
          variant="outlined"
          sx={{
            width: '100%',
            maxWidth: 440,
            borderColor: '#e1daf2',
            boxShadow: '0 24px 70px rgba(52, 37, 91, 0.10)',
          }}
        >
          <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
            <Box
              sx={{
                width: 52,
                height: 52,
                borderRadius: 3,
                display: 'grid',
                placeItems: 'center',
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                mb: 2.5,
              }}
            >
              <LockRoundedIcon />
            </Box>
            <Typography variant="h5">
              {mode === 'register' ? 'Create your shop' : 'Welcome back'}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, mb: 3 }}>
              {mode === 'register' ? 'Create your owner account and shop.' : 'Sign in with your shop owner account.'}
            </Typography>

            <Tabs value={mode} onChange={(_, value) => setMode(value)} variant="fullWidth" sx={{ mb: 2 }}>
              <Tab value="login" label="Login" />
              <Tab value="register" label="Register" />
            </Tabs>

            {error ? (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            ) : null}

            <Box component="form" onSubmit={handleSubmit} sx={{ display: 'grid', gap: 2 }}>
              {mode === 'register' ? (
                <>
                  <TextField
                    label="Username / owner name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoComplete="name"
                    required
                    fullWidth
                  />
                  <TextField
                    label="Shop name"
                    value={shopName}
                    onChange={(event) => setShopName(event.target.value)}
                    autoComplete="organization"
                    required
                    fullWidth
                  />
                </>
              ) : null}
              <TextField
                label="Email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
                fullWidth
              />
              <TextField
                label="Password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                helperText={mode === 'register' ? 'Use at least 8 characters.' : ''}
                required
                fullWidth
              />
              <Button type="submit" variant="contained" size="large" disabled={submitting}>
                {submitting ? (
                  <CircularProgress size={22} color="inherit" />
                ) : mode === 'register' ? (
                  'Create shop'
                ) : (
                  'Sign in'
                )}
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Box>
    </Box>
  )
}
