import { BuyerPaymentNotification } from '../components/BuyerPaymentNotification'
import { Administration } from '../pages/Administration'
import { authStore } from '../auth/authStore'
import { useState, useSyncExternalStore, type ComponentType } from 'react'
import { AppShell } from '../components/layout/AppShell'
import type { PageKey } from '../types/domain'
import { Dashboard } from '../pages/Dashboard'
import { Marketplace } from '../pages/Marketplace'
import { Patterns } from '../pages/Patterns'
import { Predictions } from '../pages/Predictions'
import { Profile } from '../pages/Profile'
import { Transactions } from '../pages/Transactions'

export default function AppRouter() {
  const role = useSyncExternalStore(authStore.subscribe, () => authStore.getSnapshot().user?.role, () => authStore.getSnapshot().user?.role)
  const [activePage, setActivePage] = useState<PageKey>('dashboard')
  const pageComponents = {
    dashboard: Dashboard,
    admin: Administration,
    marketplace: () => <Marketplace onNavigate={() => setActivePage('transactions')} />,
    predictions: Predictions,
    transactions: Transactions,
    patterns: Patterns,
    profile: Profile,
  } satisfies Record<PageKey, ComponentType>
  const ActivePage = pageComponents[activePage === 'admin' && role !== 'ADMIN' ? 'dashboard' : activePage]

  return (
    <AppShell activePage={activePage} onNavigate={setActivePage}>
      <BuyerPaymentNotification pageKey={activePage} onNavigate={() => setActivePage('transactions')} />
      <ActivePage />
    </AppShell>
  )
}
