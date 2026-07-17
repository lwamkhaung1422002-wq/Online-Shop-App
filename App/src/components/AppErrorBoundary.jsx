import { Component } from 'react'
import { Alert, Box, Button, Paper, Typography } from '@mui/material'

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
        <Paper variant="outlined" sx={{ maxWidth: 560, p: 3 }}>
          <Typography variant="h5" gutterBottom>
            Something went wrong
          </Typography>
          <Alert severity="error" sx={{ my: 2 }}>
            {this.state.error.message || 'The application encountered an unexpected error.'}
          </Alert>
          <Button variant="contained" onClick={() => window.location.reload()}>
            Reload application
          </Button>
        </Paper>
      </Box>
    )
  }
}

