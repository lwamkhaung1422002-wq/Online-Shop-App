import { Box, Paper, Skeleton, Stack } from '@mui/material'

export default function PageSkeleton() {
  return (
    <Box className="page-stack page-skeleton" aria-label="Loading page">
      <Box>
        <Skeleton variant="text" width="34%" height={42} />
        <Skeleton variant="text" width="52%" />
      </Box>
      <Box className="metric-grid">
        {[1, 2, 3, 4].map((item) => (
          <Paper key={item} variant="outlined" sx={{ p: 2 }}>
            <Stack direction="row" spacing={2} alignItems="center">
              <Skeleton variant="rounded" width={42} height={42} />
              <Box sx={{ flex: 1 }}>
                <Skeleton variant="text" width="55%" />
                <Skeleton variant="text" width="78%" height={34} />
              </Box>
            </Stack>
          </Paper>
        ))}
      </Box>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Skeleton variant="rounded" height={220} />
      </Paper>
    </Box>
  )
}

