import { useState, type ComponentType } from 'react'
import { AppShell } from '../components/layout/AppShell'
import type { PageKey } from '../types/domain'
import { Anomalies } from '../pages/Anomalies'
import { Dashboard } from '../pages/Dashboard'
import { Marketplace } from '../pages/Marketplace'
import { Predictions } from '../pages/Predictions'
import { Profile } from '../pages/Profile'
import { Transactions } from '../pages/Transactions'

const pageComponents = {
  dashboard: Dashboard,
  marketplace: Marketplace,
  predictions: Predictions,
  transactions: Transactions,
  anomalies: Anomalies,
  profile: Profile,
} satisfies Record<PageKey, ComponentType>

export default function AppRouter() {
  const [activePage, setActivePage] = useState<PageKey>('dashboard')
  const ActivePage = pageComponents[activePage]

  return (
    <AppShell activePage={activePage} onNavigate={setActivePage}>
      <ActivePage />
    </AppShell>
  )
}
