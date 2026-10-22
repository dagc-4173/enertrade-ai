# Perfil — 2026-10-21
Estado: implementado y probado localmente. Sin despliegue ni cierre integral de HU.

Datos de cuenta con nombre, correo y fecha de registro real en hora Bogotá; cabecera con iniciales, estado activo condicionado a sesión autenticada; detalles técnicos desplegables y copiar identificador con alternativa ante fallo del portapapeles. Configuración oferta/demanda reutiliza SimulationProfileEditor y servicio existente; advierte impacto de nueva versión sobre verificaciones. Se conserva acceso en Mercado. No se añade edición de datos personales ni cambio de contraseña sin backend.

Archivos: Profile.tsx, Profile.css, PublicationVerification.tsx y pruebas profile.test.tsx/publication-verification.test.tsx.

Pruebas: 245 pass, 0 fail, 1072 aserciones; build y lint aprobados. PROFILE-01 verifica datos y controles existentes, PROFILE-02 sesión ausente sin falso estado activo ni configuración. VERIFY-UI-03 ajustada para estado de consulta en lugar de asumir sin configuración.

Manual: navegador autenticado confirmó fecha, información de cuenta y dos perfiles sin configurar tras consulta. Móvil390px/documento375px sin desbordamiento. Viewport restaurado. Captura adjunta. No se guardaron datos ni perfiles, no se probaron cambios persistentes. Copiar identificador no se ejecutó manualmente. Evidencia contiene datos de cuenta visibles: revisar antes de incluir capturas en informe público.

Trazabilidad: presentación de sesión y configuración de verificación simulada existente; no se asignan HU no verificadas. IA: Codex apoyó implementación y verificación; revisión del estudiante pendiente. Conservar evidencia para TG-II.
