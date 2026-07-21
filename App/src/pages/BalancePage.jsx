import { useMemo, useState } from 'react'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import PictureAsPdfRoundedIcon from '@mui/icons-material/PictureAsPdfRounded'
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded'
import MetricCard from '../components/MetricCard.jsx'
import PageHeader from '../components/PageHeader.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import SectionCard from '../components/SectionCard.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useData } from '../contexts/DataContext.jsx'
import {
  createExpenseDocument,
  deleteExpenseDocument,
  updateExpenseDocument,
} from '../services/shopApiService.js'
import { useFeedback } from '../contexts/FeedbackContext.jsx'
import { calculateFinancialSummary } from '../domain/finance.js'
import { isRevenueRecognized, normalizeOrders } from '../domain/orders.js'
import {
  buildProfitState,
  formatKs,
  getReceivedByMethod,
  getToday,
} from '../utils/storage.js'
import { activePaymentMethods } from '../utils/catalog.js'

const fallbackExpenseTypes = ['General', 'Operations', 'Marketing']

const emptyExpenseForm = {
  title: '',
  amount: '',
  type: fallbackExpenseTypes[0],
  method: 'Cash',
  date: getToday(),
  note: '',
}

function getTypeProfit(records, expenses) {
  const map = {}

  normalizeOrders(Object.values(records).flat()).forEach((order) => {
    if (!isRevenueRecognized(order)) return
    order.items.forEach((item) => {
      if (!map[item.type]) map[item.type] = { income: 0, cost: 0, expense: 0 }
      map[item.type].income += Number(item.lineTotal || 0)
      map[item.type].cost += Number(item.unitCost || 0) * Number(item.quantity || 0)
    })
  })

  expenses.forEach((expense) => {
    if (!map[expense.type]) {
      map[expense.type] = { income: 0, cost: 0, expense: 0 }
    }

    map[expense.type].expense += Number(expense.amount || 0)
  })

  return map
}

export default function BalancePage({ refresh, requireAuth }) {
  const { user } = useAuth()
  const { data } = useData()
  const { notify } = useFeedback()
  const state = useMemo(() => buildProfitState(data), [data])
  const typeOptions = state.productTypes.length ? state.productTypes : fallbackExpenseTypes
  const expenseMethods = activePaymentMethods(data.catalogSettings).filter((method) => method.type === 'normal')
  const [expenseForm, setExpenseForm] = useState({
    ...emptyExpenseForm,
    type: typeOptions[0] || fallbackExpenseTypes[0],
  })
  const [editingExpenseId, setEditingExpenseId] = useState(null)
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const incomeMap = useMemo(() => getReceivedByMethod(state.payments, state.orderById), [state])
  const incomeTotal = Object.values(incomeMap).reduce((sum, value) => sum + value, 0)
  const expenseTotal = state.expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0)
  const financialSummary = useMemo(
    () => calculateFinancialSummary(data.orders, state.expenses),
    [data.orders, state.expenses],
  )
  const net = financialSummary.netProfit
  const typeProfit = getTypeProfit(state.records, state.expenses)

  const handleExportBalancePDF = async () => {
    const { exportBalancePDF } = await import('../utils/reports.js')
    exportBalancePDF(incomeMap, financialSummary)
  }

  const handleExportExpensePDF = async () => {
    const { exportExpensePDF } = await import('../utils/reports.js')
    exportExpensePDF(state.expenses)
  }

  const updateExpenseForm = (key, value) => {
    setExpenseForm((current) => ({ ...current, [key]: value }))
  }

  const clearExpenseForm = () => {
    setExpenseForm({
      ...emptyExpenseForm,
      type: typeOptions[0] || fallbackExpenseTypes[0],
    })
    setEditingExpenseId(null)
  }

  const addExpense = async () => {
    if (requireAuth?.('save expense')) return
    if (!expenseForm.title || !expenseForm.amount) {
      notify('Expense title and amount are required.', 'warning')
      return
    }

    const expense = {
      id: editingExpenseId || undefined,
      title: expenseForm.title,
      amount: Number(expenseForm.amount),
      type: expenseForm.type,
      method: expenseForm.method,
      date: expenseForm.date,
      note: expenseForm.note,
    }
    try {
      if (editingExpenseId) await updateExpenseDocument(user.uid, expense)
      else await createExpenseDocument(user.uid, expense)
      clearExpenseForm()
      notify(editingExpenseId ? 'Expense updated.' : 'Expense recorded.')
      refresh()
    } catch (error) {
      notify(error.message || 'Expense could not be saved.', 'error')
    }
  }

  const editExpense = (expense) => {
    setEditingExpenseId(expense.id)
    setExpenseForm({
      title: expense.title,
      amount: expense.amount,
      type: expense.type,
      method: expense.method,
      date: expense.date,
      note: expense.note || '',
    })
    setExpenseDialogOpen(false)
  }

  const deleteExpense = async (id) => {
    if (requireAuth?.('delete expense')) return
    try {
      await deleteExpenseDocument(user.uid, id)
      notify('Expense deleted.')
      refresh()
    } catch (error) {
      notify(error.message || 'Expense could not be deleted.', 'error')
    }
  }

  return (
    <Box className="page-stack">
      <PageHeader
        title="Profit / Expense / Balance"
        subtitle="Track income, expenses, balance by payment method, and profit by product type."
      />

      <div className="metric-grid">
        <MetricCard title="Revenue" value={formatKs(financialSummary.revenue)} tone="success" />
        <MetricCard title="Cost of Goods" value={formatKs(financialSummary.costOfGoods)} tone="warning" />
        <MetricCard title="Gross Profit" value={formatKs(financialSummary.grossProfit)} tone="primary" />
        <MetricCard title="Operating Expense" value={formatKs(expenseTotal)} tone="error" />
        <MetricCard title="Net Profit" value={formatKs(net)} tone={net >= 0 ? 'success' : 'error'} />
      </div>

      <SectionCard
        title="Balance by Payment Method"
        subtitle="Received orders grouped by payment method."
        actions={
          <Button
            variant="outlined"
            startIcon={<PictureAsPdfRoundedIcon />}
            onClick={handleExportBalancePDF}
          >
            Export Balance PDF
          </Button>
        }
      >
        <Box className="metric-grid" sx={{ mt: 2 }}>
          {Object.entries(incomeMap).map(([method, value]) => (
            <MetricCard key={method} title={method} value={formatKs(value)} />
          ))}
          {!Object.keys(incomeMap).length ? (
            <Typography color="text.secondary">No received payments yet.</Typography>
          ) : null}
        </Box>
        <Typography sx={{ mt: 2 }} fontWeight={800}>
          Total Balance : {formatKs(incomeTotal)}
        </Typography>
      </SectionCard>

      <SectionCard title="Profit by Product Type" subtitle="Income, cost, expense, and profit by product.">
        <Box className="mobile-data-list">
          {Object.entries(typeProfit).map(([type, data]) => {
            const profit = data.income - data.cost - data.expense
            return (
              <Paper key={type} variant="outlined" className="mobile-data-card">
                <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                  <Typography fontWeight={900}>{type}</Typography>
                  <Typography
                    fontWeight={900}
                    color={profit >= 0 ? 'success.main' : 'error.main'}
                  >
                    {formatKs(profit)}
                  </Typography>
                </Stack>
                <Box className="mobile-detail-grid">
                  <MobileDetail label="Income" value={formatKs(data.income)} />
                  <MobileDetail
                    label="Cost + Expense"
                    value={formatKs(data.cost + data.expense)}
                  />
                </Box>
              </Paper>
            )
          })}
        </Box>
        <TableContainer className="desktop-data-table">
          <Table className="nowrap-table" size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Type</TableCell>
                <TableCell align="right">Income</TableCell>
                <TableCell align="right">Expense</TableCell>
                <TableCell align="right">Profit / Loss</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {Object.entries(typeProfit).map(([type, data]) => {
                const profit = data.income - data.cost - data.expense
                return (
                  <TableRow key={type}>
                    <TableCell>{type}</TableCell>
                    <TableCell align="right">{formatKs(data.income)}</TableCell>
                    <TableCell align="right">{formatKs(data.cost + data.expense)}</TableCell>
                    <TableCell align="right" className={profit >= 0 ? 'positive' : 'negative'}>
                      {formatKs(profit)}
                    </TableCell>
                  </TableRow>
                )
              })}
              {!Object.keys(typeProfit).length ? (
                <TableRow>
                  <TableCell colSpan={4} align="center">
                    No profit records
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </TableContainer>
      </SectionCard>

      <SectionCard
        title={editingExpenseId ? 'Edit Expense' : 'Add Expense'}
        subtitle="Expenses reduce net profit and type-level profit."
        actions={
          <Button variant="outlined" startIcon={<VisibilityRoundedIcon />} onClick={() => setExpenseDialogOpen(true)}>
            View Expense Details
          </Button>
        }
      >

        <Box className="form-grid">
          <TextField
            className="span-3"
            label="Expense Title"
            value={expenseForm.title}
            onChange={(event) => updateExpenseForm('title', event.target.value)}
          />
          <TextField
            className="span-3"
            type="number"
            label="Amount"
            value={expenseForm.amount}
            onChange={(event) => updateExpenseForm('amount', event.target.value)}
          />
          <FormControl className="span-3">
            <InputLabel>Type</InputLabel>
            <Select label="Type" value={expenseForm.type} onChange={(event) => updateExpenseForm('type', event.target.value)}>
              {typeOptions.map((type) => (
                <MenuItem key={type} value={type}>
                  {type}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl className="span-3">
            <InputLabel>Method</InputLabel>
            <Select label="Method" value={expenseForm.method} onChange={(event) => updateExpenseForm('method', event.target.value)}>
              {(expenseMethods.length ? expenseMethods : activePaymentMethods(data.catalogSettings)).map((method) => (
                <MenuItem key={method.id} value={method.name}>
                  {method.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            className="span-3"
            type="date"
            label="Date"
            value={expenseForm.date}
            onChange={(event) => updateExpenseForm('date', event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            className="span-9"
            label="Note (optional)"
            value={expenseForm.note}
            onChange={(event) => updateExpenseForm('note', event.target.value)}
          />
        </Box>

        <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} sx={{ mt: 2, justifyContent: 'flex-end' }}>
          {editingExpenseId ? (
            <Button onClick={clearExpenseForm}>Cancel Edit</Button>
          ) : null}
          <Button variant="contained" color="error" onClick={addExpense}>
            Save
          </Button>
        </Stack>
      </SectionCard>

      <Dialog open={expenseDialogOpen} onClose={() => setExpenseDialogOpen(false)} fullWidth maxWidth="lg">
        <DialogTitle>Expense Details</DialogTitle>
        <DialogContent dividers>
          <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ mb: 2, justifyContent: 'flex-end' }}>
            <Button
              variant="outlined"
              color="error"
              startIcon={<PictureAsPdfRoundedIcon />}
              onClick={handleExportExpensePDF}
            >
              Export Expense PDF
            </Button>
          </Stack>
          <Box className="mobile-data-list">
            {state.expenses.map((expense) => (
              <Paper key={expense.id} variant="outlined" className="mobile-data-card">
                <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 2 }}>
                  <Box>
                    <Typography fontWeight={900}>{expense.title}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {expense.type} · {expense.method} · {expense.date}
                    </Typography>
                  </Box>
                  <Typography fontWeight={900}>{formatKs(expense.amount)}</Typography>
                </Stack>
                <Stack direction="row" gap={1}>
                  <Button fullWidth variant="outlined" onClick={() => editExpense(expense)}>
                    Edit
                  </Button>
                  <Button
                    fullWidth
                    variant="outlined"
                    color="error"
                    onClick={() => setDeleteTarget(expense)}
                  >
                    Delete
                  </Button>
                </Stack>
              </Paper>
            ))}
          </Box>
          <TableContainer className="desktop-data-table">
            <Table className="nowrap-table" size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Title</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Method</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {state.expenses.map((expense) => (
                  <TableRow key={expense.id}>
                    <TableCell>{expense.title}</TableCell>
                    <TableCell>{expense.type}</TableCell>
                    <TableCell>{expense.method}</TableCell>
                    <TableCell align="right">{formatKs(expense.amount)}</TableCell>
                    <TableCell>{expense.date}</TableCell>
                    <TableCell>
                      <Box className="table-actions">
                        <Button size="small" variant="outlined" startIcon={<EditRoundedIcon />} onClick={() => editExpense(expense)}>
                          Edit
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          color="error"
                          startIcon={<DeleteOutlineRoundedIcon />}
                          onClick={() => setDeleteTarget(expense)}
                        >
                          Delete
                        </Button>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
                {!state.expenses.length ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      No expense records
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExpenseDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete expense?"
        message={`Delete “${deleteTarget?.title || ''}”? This action is recorded immediately.`}
        confirmLabel="Delete expense"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          await deleteExpense(deleteTarget.id)
          setDeleteTarget(null)
        }}
      />
    </Box>
  )
}

function MobileDetail({ label, value }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography fontWeight={800}>{value}</Typography>
    </Box>
  )
}
