# ADR: PostgreSQL local para desarrollo y pruebas

Estado: fallback temporal de desarrollo, implementado y probado técnicamente el7/10/2026; validación académica pendiente.

Contexto: al tomar la decisión, el límite mensual de transferencia de Neon impedía desarrollo, login y validación del PDF. Se necesitaba continuidad local mientras se restablecía el servicio cloud; esta condición describe el contexto de la decisión, no el estado actual de Neon.

Alternativas: esperar renovación (retrasa trabajo), plan pagado (costo), Docker (no instalado) o PostgreSQL nativo portátil oficial ya verificado (sin nueva dependencia de contenedor).

Decisión: conservar PostgreSQL/Prisma y migraciones y usar PostgreSQL17.11 en carpeta persistente del usuario, acceso loopback y SCRAM, rol aplicación sin privilegios administrativos. Bases dev y test independientes; configuración de Neon respaldada y excluida de Git. Este fallback no cambia la arquitectura objetivo: Neon continúa siendo el servicio PostgreSQL cloud previsto cuando está disponible.

Consecuencias: continuidad de desarrollo sin depender de la cuota cloud, datos persistentes locales y arranque manual después de reinicio. No es despliegue productivo local, traslado/restauración automática de datos ni decisión permanente de arquitectura. Cualquier recuperación de datos Neon requiere un proceso separado de restauración y conciliación en otra base local; su ejecución debe documentarse aparte. Preservar trazabilidadTG-I; cambia el entorno temporal de desarrollo, no la arquitectura funcional ni el alcance. No modifica archivos ML/HU-06.
