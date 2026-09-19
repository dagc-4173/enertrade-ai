import { useState, useSyncExternalStore, type ReactNode } from 'react'
import { authStore } from '../../auth/authStore'
import { authErrorMessage } from '../../services/authService'
import { navigationItems } from '../../data/navigation'
import type { PageKey } from '../../types/domain'

interface AppShellProps {
  activePage: PageKey
  onNavigate: (page: PageKey) => void
  children: ReactNode
}

export function AppShell({ activePage, onNavigate, children }: AppShellProps) {
  const { user } = useSyncExternalStore(authStore.subscribe, authStore.getSnapshot)
  const [logoutError, setLogoutError] = useState<string | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)
  async function logout() {
    setLoggingOut(true); setLogoutError(null)
    try { await authStore.logout() } catch (error) { setLogoutError(authErrorMessage(error)) }
    finally { setLoggingOut(false) }
  }
  const activeItem = navigationItems.find((item) => item.key === activePage)

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Navegacion principal">
        <div className="brand-block">
          <div className="brand-mark">ET</div>
          <div>
            <p>EnerTrade AI</p>
            <span>Mercado energetico inteligente</span>
          </div>
        </div>

        <nav className="main-nav">
          {navigationItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={item.key === activePage ? 'nav-item active' : 'nav-item'}
              onClick={() => onNavigate(item.key)}
            >
              <span>{item.label}</span>
              <small>{item.description}</small>
            </button>
          ))}
        </nav>

        <div className="sidebar-panel">
          <p>Motor analítico</p>
          <strong>Capacidades versionadas</strong>
          <span>Consulta indicadores en Inicio</span>
        </div>
      </aside>

      <div className="content-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">Entorno de prototipo</p>
            <h1>{activeItem?.title ?? activeItem?.label ?? 'Inicio'}</h1>
          </div>
          <div className="auth-session">
            <span>{user?.name}</span>
            <button type="button" disabled={loggingOut} onClick={() => { void logout() }}>{loggingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}</button>
            {logoutError && <span className="auth-session-error" role="alert">{logoutError}</span>}
          </div>
        </header>
        <main>{children}</main>
      </div>
    </div>
  )
}
