import { Box, Button, Typography } from '@mui/material'
import InboxRoundedIcon from '@mui/icons-material/InboxRounded'

export default function EmptyState({ title, message, actionLabel, onAction, icon, compact = false }) {
  return (
    <Box className={`empty-state ${compact ? 'compact' : ''}`} role="status">
      <Box className="empty-state-icon" aria-hidden="true">
        {icon || <InboxRoundedIcon />}
      </Box>
      <Typography fontWeight={900}>{title}</Typography>
      {message ? (
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420 }}>
          {message}
        </Typography>
      ) : null}
      {actionLabel && onAction ? (
        <Button variant="outlined" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </Box>
  )
}
