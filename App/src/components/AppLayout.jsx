import {
  AppBar,
  Box,
  BottomNavigation,
  BottomNavigationAction,
  Button,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  SpeedDial,
  SpeedDialAction,
  Toolbar,
  Typography,
  useMediaQuery,
} from '@mui/material'
import { useState } from 'react'
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded'
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded'
import Inventory2RoundedIcon from '@mui/icons-material/Inventory2Rounded'
import AccountBalanceWalletRoundedIcon from '@mui/icons-material/AccountBalanceWalletRounded'
import AddShoppingCartRoundedIcon from '@mui/icons-material/AddShoppingCartRounded'
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded'
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded'
import MoreHorizRoundedIcon from '@mui/icons-material/MoreHorizRounded'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import BackupButton from './BackupButton.jsx'
import { preloadRoute } from '../routes.js'

const drawerWidth = 224

const navItems = [
  { key: 'home', label: 'Home', icon: <DashboardRoundedIcon /> },
  { key: 'sales', label: 'Sales', icon: <ReceiptLongRoundedIcon /> },
  { key: 'stock', label: 'Stock', icon: <Inventory2RoundedIcon /> },
  { key: 'finance', label: 'Finance', icon: <AccountBalanceWalletRoundedIcon /> },
  { key: 'balance', label: 'Balance', icon: <TrendingUpRoundedIcon /> },
  { key: 'order', label: 'Order', icon: <AddShoppingCartRoundedIcon /> },
]

export default function AppLayout({
  page,
  onNavigate,
  onLogout,
  onGetStarted,
  preview = false,
  userEmail,
  shopName = 'Shop Owner',
  children,
}) {
  const desktop = useMediaQuery('(min-width:768px)')
  const current = navItems.find((item) => item.key === page) || navItems[0]
  const [moreAnchor, setMoreAnchor] = useState(null)
  const mobilePrimary = navItems.filter((item) =>
    ['home', 'sales', 'stock', 'order'].includes(item.key),
  )

  const nav = (
    <List sx={{ px: 1.5 }}>
      {navItems.map((item) => (
        <ListItemButton
          key={item.key}
          selected={page === item.key}
          onClick={() => onNavigate(item.key)}
          onMouseEnter={() => preloadRoute(item.key)}
          onFocus={() => preloadRoute(item.key)}
          onTouchStart={() => preloadRoute(item.key)}
          sx={{ borderRadius: 2, mb: 0.5 }}
        >
          <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
          <ListItemText primary={item.label} slotProps={{ primary: { fontWeight: 700 } }} />
        </ListItemButton>
      ))}
    </List>
  )

  return (
    <Box className="app-shell">
      <AppBar
        position="fixed"
        color="inherit"
        elevation={0}
        sx={{
          borderBottom: '1px solid',
          borderColor: 'divider',
          ml: desktop ? `${drawerWidth}px` : 0,
          width: desktop ? `calc(100% - ${drawerWidth}px)` : '100%',
        }}
      >
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {shopName}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' }, mr: 1.5 }}>
            {preview ? 'Read-only preview' : userEmail}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', md: 'block' }, mr: 1.5 }}>
            {current.label}
          </Typography>
          {!preview ? (
            <Box sx={{ display: { xs: 'none', sm: 'block' }, mr: 1 }}>
              <BackupButton compact />
            </Box>
          ) : null}
          <Button
            size="small"
            variant={preview ? 'contained' : 'outlined'}
            startIcon={preview ? null : <LogoutRoundedIcon />}
            onClick={preview ? onGetStarted : onLogout}
            sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
          >
            {preview ? 'Get Started' : 'Logout'}
          </Button>
        </Toolbar>
      </AppBar>

      {desktop ? (
        <Drawer
          variant="permanent"
          sx={{
            width: drawerWidth,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              width: drawerWidth,
              boxSizing: 'border-box',
              borderRight: '1px solid',
              borderColor: 'divider',
            },
          }}
        >
          <Toolbar>
            <Box>
              <Typography variant="subtitle1" fontWeight={800}>
                {shopName}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Shop workspace
              </Typography>
            </Box>
          </Toolbar>
          {nav}
        </Drawer>
      ) : null}

      <Box
        component="main"
        className="app-main"
        sx={{
          ml: desktop ? `${drawerWidth}px` : 0,
          pt: '88px',
        }}
      >
        <Box className="content-wrap">{children}</Box>
      </Box>

      {!desktop ? (
        <BottomNavigation
          value={page}
          onChange={(_, nextPage) => onNavigate(nextPage)}
          showLabels
          sx={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1200,
            borderTop: '1px solid',
            borderColor: 'divider',
          }}
        >
          {mobilePrimary.map((item) => (
            <BottomNavigationAction
              key={item.key}
              label={item.label}
              value={item.key}
              icon={item.icon}
              onMouseEnter={() => preloadRoute(item.key)}
              onFocus={() => preloadRoute(item.key)}
              onTouchStart={() => preloadRoute(item.key)}
            />
          ))}
          <BottomNavigationAction
            label="More"
            value={['finance', 'balance'].includes(page) ? page : 'more'}
            icon={<MoreHorizRoundedIcon />}
            onClick={(event) => setMoreAnchor(event.currentTarget)}
          />
        </BottomNavigation>
      ) : null}

      <Menu
        anchorEl={moreAnchor}
        open={Boolean(moreAnchor)}
        onClose={() => setMoreAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {!preview ? (
          <Box sx={{ display: { xs: 'block', sm: 'none' }, px: 1, py: 0.5 }}>
            <BackupButton compact />
          </Box>
        ) : null}
        {navItems
          .filter((item) => ['finance', 'balance'].includes(item.key))
          .map((item) => (
            <MenuItem
              key={item.key}
              onMouseEnter={() => preloadRoute(item.key)}
              onFocus={() => preloadRoute(item.key)}
              onTouchStart={() => preloadRoute(item.key)}
              onClick={() => {
                onNavigate(item.key)
                setMoreAnchor(null)
              }}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              {item.label}
            </MenuItem>
          ))}
        <MenuItem
          onClick={() => {
            if (preview) onGetStarted()
            else onLogout()
            setMoreAnchor(null)
          }}
        >
          <ListItemIcon>
            <LogoutRoundedIcon />
          </ListItemIcon>
          {preview ? 'Get Started' : 'Logout'}
        </MenuItem>
      </Menu>

      <SpeedDial
        ariaLabel="Quick actions"
        icon={<AddRoundedIcon />}
        sx={{
          position: 'fixed',
          right: { xs: 16, md: 28 },
          bottom: { xs: 84, md: 28 },
          display: page === 'order' ? 'none' : 'flex',
        }}
      >
        <SpeedDialAction
          icon={<AddShoppingCartRoundedIcon />}
          slotProps={{ tooltip: { title: 'New order' } }}
          onMouseEnter={() => preloadRoute('order')}
          onClick={() => {
            if (preview) onGetStarted()
            else onNavigate('order')
          }}
        />
        <SpeedDialAction
          icon={<Inventory2RoundedIcon />}
          slotProps={{ tooltip: { title: 'Stock' } }}
          onMouseEnter={() => preloadRoute('stock')}
          onClick={() => {
            if (preview) onGetStarted()
            else onNavigate('stock')
          }}
        />
        <SpeedDialAction
          icon={<AccountBalanceWalletRoundedIcon />}
          slotProps={{ tooltip: { title: 'Payments' } }}
          onMouseEnter={() => preloadRoute('finance')}
          onClick={() => {
            if (preview) onGetStarted()
            else onNavigate('finance')
          }}
        />
      </SpeedDial>
    </Box>
  )
}
