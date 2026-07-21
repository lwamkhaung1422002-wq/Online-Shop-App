import { Component } from 'react'
import { Alert, Box, Button, Paper, Stack, Typography } from '@mui/material'
import HomeRoundedIcon from '@mui/icons-material/HomeRounded'
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded'

export default class AppErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Application error', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2 }}>
        <Paper variant="outlined" className="section-card" sx={{ maxWidth: 600 }}>
          <Typography variant="h5" fontWeight={900} gutterBottom>
            The workspace needs a refresh
          </Typography>
          <Typography color="text.secondary">
            Your data was not changed. Reload the app and try the last action again.
          </Typography>
          <Alert severity="error" variant="outlined" sx={{ my: 2 }}>
            The application hit an unexpected display error.
          </Alert>
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}>
            <Button variant="contained" startIcon={<RefreshRoundedIcon />} onClick={() => window.location.reload()}>
              Reload application
            </Button>
            <Button
              variant="outlined"
              startIcon={<HomeRoundedIcon />}
              onClick={() => {
                window.location.hash = '#/home'
                window.location.reload()
              }}
            >
              Go to home
            </Button>
          </Stack>
        </Paper>
      </Box>
    )
  }
}
