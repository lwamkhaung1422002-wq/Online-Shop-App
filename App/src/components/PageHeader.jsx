import { Box, IconButton, Typography } from '@mui/material'
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded'

export default function PageHeader({ title, subtitle, onBack, actions }) {
  return (
    <Box
      className="page-header"
      sx={{
        display: 'flex',
        alignItems: { xs: 'flex-start', sm: 'center' },
        justifyContent: 'space-between',
        gap: 2,
        flexDirection: { xs: 'column', sm: 'row' },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
        {onBack ? (
          <IconButton onClick={onBack} aria-label="Go back">
            <ArrowBackRoundedIcon />
          </IconButton>
        ) : null}
        <Box className="page-header-copy">
          <Typography className="page-header-title" variant="h5" sx={{ lineHeight: 1.18 }}>
            {title}
          </Typography>
          {subtitle ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              {subtitle}
            </Typography>
          ) : null}
        </Box>
      </Box>
      {actions ? (
        <Box
          className="page-header-actions"
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 1,
            width: { xs: '100%', sm: 'auto' },
            justifyContent: { xs: 'stretch', sm: 'flex-end' },
          }}
        >
          {actions}
        </Box>
      ) : null}
    </Box>
  )
}
