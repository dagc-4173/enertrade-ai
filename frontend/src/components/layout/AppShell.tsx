import './Navigation.css'
import { NavigationIcon } from './NavigationIcon'
import { useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
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
  const { user } = useSyncExternalStore(authStore.subscribe, authStore.getSnapshot, authStore.getSnapshot)
  const [menuOpen,setMenuOpen] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)
  function navigate(page: PageKey) { onNavigate(page);setMenuOpen(false);requestAnimationFrame(() => document.getElementById('page-heading')?.focus()) }
  const initials = user?.name.trim().split(/\s+/).slice(0,2).map(part=>part[0]).join('').toLocaleUpperCase('es-CO') || 'ET'
  const [logoutError, setLogoutError] = useState<string | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)
  async function logout() {
    setLoggingOut(true); setLogoutError(null)
    try { await authStore.logout() } catch (error) { setLogoutError(authErrorMessage(error)) }
    finally { setLoggingOut(false) }
  }
  const activeItem = navigationItems.find((item) => item.key === activePage)

  return (
    <div className="app-shell app-navigation-layout">
      <aside className="sidebar app-sidebar" aria-label="Navegación principal" onKeyDown={event => { if (event.key === 'Escape' && menuOpen) { setMenuOpen(false);menuButton.current?.focus() } }}>
        <div className="brand-block">
          <div className="brand-mark">ET</div>
          <div>
            <p>EnerTrade AI</p>
            <span>Mercado energético inteligente</span>
          </div>
        </div>

        <button ref={menuButton} type="button" className="sidebar-menu-toggle" aria-expanded={menuOpen} aria-controls="primary-navigation" onClick={() => setMenuOpen(value=>!value)}><NavigationIcon page="menu" /><span>{menuOpen ? 'Cerrar menú' : 'Abrir menú'}</span></button>
        <nav id="primary-navigation" className={`sidebar-nav${menuOpen ? ' is-open' : ''}`} aria-label="Secciones de EnerTrade AI">
          {navigationItems.filter(item => item.key !== 'admin' || user?.role === 'ADMIN').map((item) => (
            <button
              key={item.key}
              type="button"
              className={item.key === activePage ? 'sidebar-link active' : 'sidebar-link'}
              aria-current={item.key === activePage ? 'page' : undefined}
              title={item.description}
              onClick={() => navigate(item.key)}
            >
              <NavigationIcon page={item.key} /><span>{item.label}</span>
            </button>
          ))}
        </nav>

        <button className="sidebar-account" type="button" onClick={() => navigate('profile')} aria-label="Ver mi perfil"><span className="sidebar-avatar" aria-hidden="true">{initials}</span><span><strong>{user?.name ?? 'Mi cuenta'}</strong><small>Ver perfil y configuración</small></span><NavigationIcon page="profile" /></button>
      </aside>

      <div className="content-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">Entorno de prototipo</p>
            <h1 id="page-heading" tabIndex={-1}>{activeItem?.title ?? activeItem?.label ?? 'Inicio'}</h1>
          </div>
          <div className="auth-session">
            <span>{user?.name}</span>
            <button type="button" className="secondary-button" disabled={loggingOut} onClick={() => { void logout() }}>{loggingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}</button>
            {logoutError && <span className="auth-session-error" role="alert">{logoutError}</span>}
          </div>
        </header>
        <main>{children}</main>
      </div>
    </div>
  )
}
