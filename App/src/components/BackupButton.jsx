import { Button } from '@mui/material'
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded'
import { useData } from '../contexts/DataContext.jsx'
import { useFeedback } from '../contexts/FeedbackContext.jsx'

export default function BackupButton({ compact = false }) {
  const { data } = useData()
  const { notify } = useFeedback()

  const exportBackup = () => {
    const payload = {
      format: 'belle-pos-backup',
      version: 2,
      exportedAt: new Date().toISOString(),
      data,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `belle-pos-backup-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    notify('Backup downloaded successfully.')
  }

  return (
    <Button
      size={compact ? 'small' : 'medium'}
      variant="outlined"
      startIcon={<DownloadRoundedIcon />}
      onClick={exportBackup}
    >
      Backup
    </Button>
  )
}

