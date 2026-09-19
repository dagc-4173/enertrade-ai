import { useSyncExternalStore } from 'react'
import { StatusBadge } from '../components/ui/StatusBadge'
import { authStore } from '../auth/authStore'

export function Profile() {
  const { user } = useSyncExternalStore(authStore.subscribe, authStore.getSnapshot)
  return (
    <div className="page-grid">
      <section className="profile-hero panel">
        <div>
          <p className="eyebrow">Perfil</p>
          <h2>{user?.name ?? 'Sesión no disponible'}</h2>
          <p>Información pública disponible en la sesión actual.</p>
        </div>
        <div className="profile-card">
          <strong>{user?.email ?? 'No disponible'}</strong>
          <span>Identificador: {user?.id ?? 'No disponible'}</span>
          <StatusBadge tone="success">Sesion activa</StatusBadge>
        </div>
      </section>
    </div>
  )
}
