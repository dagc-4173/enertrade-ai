# Inicio: organización y disponibilidad — 2026-10-21
Estado: implementado y probado localmente. No implica validación académica ni despliegue.
HU relacionadas: HU18 versiones y evidencia, HU19 indicadores; disponibilidad vinculada a HU04/06/08. No se declara cierre integral de HU.

Cambios: encabezado compacto; consulta independiente de disponibilidad Ridge por oferta Gene, demanda horaria DemaReal y precio horario; fecha de consulta, origen utilizable y fechas elegibles reales. Reutiliza endpoints y parsers existentes. No genera predicciones ni sincroniza datos XM. Carga y error independientes por variable y botón de actualización. No certifica disponibilidad de Chronos.

Artefactos: apartado nativo desplegable con 26 registros en 5 capacidades funcionales. Detalle técnico se monta únicamente al abrir; conserva versiones, limitaciones y estado académico. Gestión de datos conservada en apartado desplegable.

Pruebas: 239 pass, 0 fail, 1035 aserciones; build y lint aprobados antes del ajuste final exclusivo de altura CSS. Prueba manual navegador autenticado: disponibilidad real origen 2026-10-18; oferta/demanda elegibles 22–25 octubre y precio 22–24 octubre. Datos puntuales sujetos a publicación. Apertura/cierre del catálogo confirmó tabla técnica. Vista móvil 390px: documento 375px, sin desbordamiento horizontal. Captura desktop adjunta. No se generaron pronósticos para esta prueba. No se simularon errores de red en navegador.

Archivos: Dashboard.tsx, Dashboard.css, ForecastReadiness.tsx, ArtifactDisclosure.tsx, dashboard.test.tsx. Evidencia importante para TG-II. IA: Codex apoyó implementación y verificación; revisión del estudiante pendiente.
