import { Chip } from '@mui/material'

const statusMap = {
  paid: { color: 'success', label: 'Paid' },
  received: { color: 'success', label: 'Received' },
  completed: { color: 'success', label: 'Completed' },
  reserved: { color: 'primary', label: 'Reserved' },
  unpaid: { color: 'warning', label: 'Outstanding' },
  outstanding: { color: 'warning', label: 'Outstanding' },
  preorder: { color: 'warning', label: 'Preorder' },
  refunded: { color: 'error', label: 'Refunded' },
  cancelled: { color: 'error', label: 'Cancelled' },
  active: { color: 'success', label: 'Active' },
  inactive: { color: 'default', label: 'Inactive' },
}

export default function StatusChip({ status, label, ...props }) {
  const normalized = String(status || '').toLowerCase()
  const mapped = statusMap[normalized] || { color: 'default', label: label || status || 'Unknown' }
  return (
    <Chip
      size="small"
      variant={mapped.color === 'default' ? 'outlined' : 'filled'}
      color={mapped.color}
      label={label || mapped.label}
      {...props}
    />
  )
}
