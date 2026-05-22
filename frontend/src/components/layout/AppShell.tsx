import type { ReactNode } from 'react'
import { navigationItems } from '../../data/mockData'
import type { PageKey } from '../../types/domain'

interface AppShellProps {
  activePage: PageKey
  onNavigate: (page: PageKey) => void
  children: ReactNode
}

export function AppShell({ activePage, onNavigate, children }: AppShellProps) {
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
          <p>Motor IA</p>
          <strong>Prediccion estable</strong>
          <span>Precision esperada 91.4%</span>
        </div>
      </aside>

      <div className="content-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">Operacion en tiempo real</p>
            <h1>{activeItem?.label ?? 'Inicio'}</h1>
          </div>
          <div className="topbar-status">
            <span>Zona: Antioquia</span>
            <strong>Mercado activo</strong>
          </div>
        </header>
        <main>{children}</main>
      </div>
    </div>
  )
}
