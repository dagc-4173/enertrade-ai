# Evidencia: preparación Docker y servidor integrado

Estado real: preparado y probado nativamente; Docker build/run y despliegue público pendientes. Docker no estaba disponible en el equipo. No se han contratado servicios, configurado remitentes ni publicado credenciales.

## Ejecutado

- Bases oficiales Bun 1.3.13-debian, Node 22-bookworm-slim y Python 3.12-slim-bookworm: manifiestos consultados al registro oficial; digests fijados en Dockerfile.
- Versiones principales de Chronos consultadas en el entorno existente. Se comprobó en PyPI que NumPy 2.5.4 requiere Python >=3.12, ajustando la imagen base.
- Backend: 16 pruebas aprobadas, 0 fallos, 62 aserciones, en deployment.test.ts y auth.test.ts. DEP-01..04 comprueban frontend/API, secretos y caché, cookie bajo /api y validación de configuración.
- Frontend: 261 pruebas aprobadas, 0 fallos, 1152 aserciones, 31 archivos. DEP-UI-01/02 comprueban /api relativo y rechazo de rutas no válidas. Build con VITE_API_BASE_URL=/api y ESLint aprobados. Tipos backend aprobados.
- Verificador de checkpoints ejecutado sobre modelos locales: chronos2 y bolt verificados. No ejecuta inferencia ni modifica pesos.
- Sintaxis Python de preflight y benchmark comprobada mediante AST. Compose analizado con Bun.YAML: servicios app/migrate y volumen evidence. Esto NO sustituye docker compose config/build.
- git check-ignore confirmó exclusión de .env.deploy, deployment/models y deployment/secrets. git diff --check aprobado.
- Arranque nativo integrado con XM automático desactivado en puerto 18080: / devuelve HTML 200; /api/unknown devuelve JSON 404; /.env devuelve 404; /api/auth/me anónimo devuelve 401. /api/health dio 503 en primera conexión fría y posteriormente 200 con database ok. No se ejecutaron migraciones ni se crearon usuarios o transacciones para este smoke test.

## Pendiente explícito

Docker Engine/Desktop, construcción real de ambas etapas, verificación de dependencias Linux/rueda CPU, compose config efectivo, arranque del contenedor, persistencia tras reinicio y pruebas de los modelos en Linux. El benchmark está preparado pero NO ejecutado: no hay cifras medidas de RAM/CPU ni un plan de alojamiento recomendado. Falta elección de alojamiento, URL HTTPS y presupuesto; envío de correo sigue pendiente.

Ver deployment/README.md y ADR-37. Conservar este reporte con el commit manual futuro. No se hizo commit/push. Uso de IA: apoyo en ingeniería y documentación; revisión académica y aceptación del estudiante pendientes.

Comprobación adicional: prepare-models.py probado con fixture temporal; hash, copia idempotente y rechazo de destino distinto aprobados. No se duplicaron pesos reales. El servidor nativo temporal se detuvo tras la verificación; los servidores habituales permanecen independientes.
