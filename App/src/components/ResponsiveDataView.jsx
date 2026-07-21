import { Box, Paper, TableContainer } from '@mui/material'

export default function ResponsiveDataView({ mobile, table, empty, hasRows = true }) {
  return (
    <>
      <Box className="mobile-data-list">{hasRows ? mobile : empty}</Box>
      <TableContainer component={Paper} variant="outlined" className="desktop-data-table">
        {hasRows ? table : empty}
      </TableContainer>
    </>
  )
}
