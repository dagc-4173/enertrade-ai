import { expect,test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { AppShell } from '../src/components/layout/AppShell'
test('NAV-01: navegación identifica página activa y ofrece control móvil accesible',()=>{
 const html=renderToStaticMarkup(<AppShell activePage="patterns" onNavigate={()=>{throw Error('No navega al renderizar')}}><p>Contenido</p></AppShell>)
 expect((html.match(/aria-current="page"/g)??[]).length).toBe(1)
 expect(html).toContain('aria-controls="primary-navigation"')
 expect(html).toContain('aria-expanded="false"')
 expect(html).toContain('Ver mi perfil')
 expect(html).toContain('id="page-heading"')
 expect(html).not.toContain('Capacidades versionadas')
 expect(html).toContain('Mercado energético inteligente')
})
