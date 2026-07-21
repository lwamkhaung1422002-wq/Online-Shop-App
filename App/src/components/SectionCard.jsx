import { Paper, Stack, Typography } from '@mui/material'

export default function SectionCard({ title, subtitle, actions, children, sx, ...props }) {
  return (
    <Paper variant="outlined" className="section-card" sx={sx} {...props}>
      {title || subtitle || actions ? (
        <Stack
          className="section-card-header"
          direction={{ xs: 'column', sm: 'row' }}
          gap={1.5}
          sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, mb: children ? 2 : 0 }}
        >
          <div className="section-card-copy">
            {title ? <Typography className="section-card-title" variant="h6">{title}</Typography> : null}
            {subtitle ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                {subtitle}
              </Typography>
            ) : null}
          </div>
          {actions ? (
            <Stack className="section-card-actions" direction="row" gap={1} sx={{ flexWrap: 'wrap', justifyContent: { xs: 'stretch', sm: 'flex-end' } }}>
              {actions}
            </Stack>
          ) : null}
        </Stack>
      ) : null}
      {children}
    </Paper>
  )
}
