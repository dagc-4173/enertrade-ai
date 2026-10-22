import { useState } from 'react'
import { ActiveArtifacts } from './ActiveArtifacts'
import type { CapabilityVersion } from '../../types/capabilities'

export function ArtifactDisclosure({ capabilities }: { capabilities: CapabilityVersion[] }) {
  const [opened, setOpened] = useState(false)
  const classes = new Set(capabilities.map(item => item.capability)).size
  return <details className="panel dashboard-disclosure" onToggle={event => setOpened(event.currentTarget.open)}>
    <summary>Artefactos activos · {capabilities.length} registros en {classes} capacidades funcionales</summary>
    <p>Consulta versiones, horizontes y limitaciones. Activo significa disponible en el servicio; no acredita validación académica.</p>
    {opened && <ActiveArtifacts capabilities={capabilities} />}
  </details>
}
