# Navegación compartida — 2026-10-21
Estado: implementado y probado localmente. Sin despliegue ni cierre integral de HU.

Barra250px, verde uniforme, iconos SVG locales sin dependencias, nombres compactos y descripciones en atributo title; aria-current para página activa, foco visible y línea de selección. Cuenta al pie con iniciales y acceso a Perfil. Retirado bloque técnico inferior. Alineación superior y altura100dvh con scroll interno en escritorio; menú móvil compartido bajo900px con aria-expanded/controls, cierre al navegar y Escape; foco al encabezado de página. Eliminadas reglas de navegación duplicadas de las seis páginas.

Archivos: AppShell.tsx, Navigation.css, NavigationIcon.tsx y estilos de Dashboard/Marketplace/Predictions/Transactions/Patterns/Profile; tests/navigation.test.tsx. No se modifica información personal ni reglas de negocio.

Verificación: 246 pass,0 fail,1079 aserciones; build y lint aprobados. NAV-01 comprueba único aria-current, controles y estado móvil inicial, acceso a cuenta y eliminación del bloque técnico. Manual: desktop comprobado visualmente; móvil390px/doc375px, abrir/cerrar y navegar a Perfil confirmado, menú oculto y foco en page-heading. Viewport restaurado. Captura desktop adjunta. No se realizaron mutaciones persistentes. Escape implementado, no probado manualmente.

Evidencia útil TG-II. IA: Codex apoyó implementación y comprobación; revisión del estudiante pendiente. Captura contiene nombre visible de sesión: revisar antes de publicación académica.
