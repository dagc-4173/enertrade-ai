# ADR-37 — Preparación Docker y publicación en un mismo origen

Estado: implementación de arranque integrado y archivos Docker preparados; pruebas nativas aprobadas; construcción y ejecución Docker pendientes. No desplegado públicamente.

## Contexto

El estudiante autorizó preparar despliegue reproducible después de revisar correo y requisitos de TG-II. Las cookies SameSite y controles de origen actuales hacen inconveniente separar la aplicación entre sitios distintos sin ajustes adicionales. Chronos usa Python y pesos externos, mientras Ridge usa artefactos del repositorio. Los directorios de evidencias necesitan persistencia.

## Alternativas

1. Frontend/backend en sitios distintos: exige rediseñar políticas de cookies/origen y probar restricciones de terceros.
2. Proxy adicional dedicado: viable, pero introduce otro servicio/configuración sin necesidad en la primera entrega.
3. Servidor Express integrado con frontend estático y API /api: reutiliza la pila actual y conserva el origen de las cookies.

## Decisión

Se prepara la alternativa 3, conservando el arranque de desarrollo existente. Docker construye frontend con Node y npm ci; backend con Bun y su lock. Las bases se verificaron en el registro oficial y se fijaron por digest. La imagen de ejecución utiliza usuario sin privilegios, datos persistentes y checkpoints montados solo lectura. Las migraciones son un comando explícito separado. No se copian archivos .env ni datos/modelos locales al contexto.

La variante completa requiere ambos Chronos; un preflight comprueba paquete 2.3.2 y hashes de config/pesos del worker antes del arranque. La variante core es una opción explícita sin Chronos, no una entrega equivalente. Python 3.12 es compatible con el requisito publicado de NumPy 2.5.4; la resolución Linux completa y construcción todavía necesitan Docker. Se genera un manifiesto pip freeze en la imagen para cerrar posteriormente el bloqueo de todas las dependencias Python.

## Consecuencias y límites

No se encontró Docker disponible; no se instaló ni se afirmó construir la imagen. Se probaron el build frontend y el servidor integrado nativo bajo http://localhost:18080, incluidos HTML/API, denegación de .env, JSON 404 y disponibilidad PostgreSQL (503 inicial en conexión fría, luego 200). El verificador confirmó ambos checkpoints locales sin cargar modelos. No se ejecutó benchmark ni inferencia Linux.

Una sola instancia conserva semántica del planificador y límites/cola en memoria de recuperación. HTTPS y proxy confiable dependen del alojamiento; SMTP y recepción real siguen pendientes. Falta validar construcción, arranque Docker, volumen tras reinicio, todas las capacidades en Linux y aceptación pública. Los archivos de preparación no sustituyen evidencia de despliegue.

Trazabilidad: actividad de preparación/entrega en TG-II sobre funcionalidades existentes; no redefine objetivos ni declara HU completadas. Documentar sprint y story points cuando el estudiante refine esta actividad. Uso de IA: ChatGPT/Codex apoyó diseño, implementación, pruebas y documentación, sujeto a revisión y sustentación del estudiante.
