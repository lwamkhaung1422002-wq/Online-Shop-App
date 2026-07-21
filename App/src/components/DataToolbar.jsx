import { Paper, Stack, Typography } from '@mui/material'

export default function DataToolbar({ title, subtitle, children }) {
  return (
    <Paper variant="outlined" className="data-toolbar">
      <Stack direction={{ xs: 'column', md: 'row' }} gap={1.5} sx={{ alignItems: { md: 'center' } }}>
        {(title || subtitle) ? (
          <div className="data-toolbar-copy">
            {title ? <Typography fontWeight={900}>{title}</Typography> : null}
            {subtitle ? <Typography variant="body2" color="text.secondary">{subtitle}</Typography> : null}
          </div>
        ) : null}
        <Stack className="data-toolbar-controls" direction={{ xs: 'column', sm: 'row' }} gap={1.25}>
          {children}
        </Stack>
      </Stack>
    </Paper>
  )
}
