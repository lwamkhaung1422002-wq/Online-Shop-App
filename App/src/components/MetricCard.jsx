import { Box, Card, CardContent, Typography } from '@mui/material'

export default function MetricCard({ title, value, tone = 'default', icon }) {
  const toneColor = {
    default: 'text.primary',
    success: 'success.main',
    warning: 'warning.main',
    error: 'error.main',
    primary: 'primary.main',
  }[tone]

  return (
    <Card variant="outlined">
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2.25 }}>
        {icon ? (
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 2,
              display: 'grid',
              placeItems: 'center',
              bgcolor: 'grey.100',
              color: toneColor,
              flexShrink: 0,
            }}
          >
            {icon}
          </Box>
        ) : null}
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" color="text.secondary">
            {title}
          </Typography>
          <Typography variant="h5" color={toneColor} sx={{ mt: 0.25 }}>
            {value}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  )
}
