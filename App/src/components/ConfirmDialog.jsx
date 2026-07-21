import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
} from '@mui/material'
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded'

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  color = 'error',
  busy = false,
  onCancel,
  onConfirm,
}) {
  return (
    <Dialog open={open} onClose={busy ? undefined : onCancel} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" gap={1.25} sx={{ alignItems: 'center' }}>
          <WarningAmberRoundedIcon color={color === 'error' ? 'error' : 'warning'} />
          {title}
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Alert severity={color === 'error' ? 'warning' : 'info'} variant="outlined">
          <DialogContentText>{message}</DialogContentText>
        </Alert>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button variant="contained" color={color} onClick={onConfirm} disabled={busy}>
          {busy ? 'Working...' : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
