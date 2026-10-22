# EnerTrade AI: preparación de despliegue

Estado: archivos preparados y servidor integrado probado de forma nativa. La imagen Docker NO se ha construido ni ejecutado porque Docker no está disponible en el equipo de trabajo. No hay despliegue público ni mediciones verificadas de recursos del contenedor. Correo sigue pendiente de configuración.

## Arquitectura

Una dirección HTTPS pública sirve frontend en `/` y API en `/api`. `backend/deploy.ts` es el arranque integrado; `backend/index.ts` conserva el desarrollo habitual en puerto 3000. El frontend de la imagen se compila con VITE_API_BASE_URL=/api. Las cookies usan el mismo origen. PostgreSQL permanece externo; `/app/data` conserva evidencias en volumen; los dos checkpoints Chronos se montan solo lectura y no se incluyen en Git ni en la imagen.

El Dockerfile ofrece runtime-chronos (completo y predeterminado) y runtime-core (Ridge y funciones web, sin inferencia Chronos). No presentar runtime-core como validación del sistema completo. Una sola instancia evita duplicar el planificador XM y es coherente con los límites/cola de correo en memoria existentes.

## Requisitos antes del primer arranque

1. Docker Engine con Compose v2 disponible, o Docker Desktop con contenedores Linux. Validar `docker version` y `docker compose version`.
2. Base PostgreSQL del entorno de prueba/despliegue y copia de seguridad. Preferir una base separada para la primera validación; una migración no restaura datasets ni replica registros de otra base.
3. Snapshots exactos de ambos modelos documentados en backend/src/python/chronos_worker.py. Las rutas deben contener config.json y model.safetensors. Escribir sus rutas del host en CHRONOS2_HOST_PATH y CHRONOS_BOLT_HOST_PATH. El montaje falla si faltan los directorios y el arranque verifica SHA256 sin descargar pesos.
4. Directorio/volumen persistente y permisos para UID/GID 10001. El volumen `evidence` nuevo hereda los permisos del directorio de imagen; revisar propietarios al restaurar un volumen existente.
5. URL pública HTTPS y proxy/terminación TLS del alojamiento. Compose publica únicamente en 127.0.0.1:8080 para que un proxy local controle el acceso. Si el proveedor arranca directamente la imagen, debe enrutar HTTPS al puerto PORT del contenedor.

## Preparación de pesos sin enlaces simbólicos

Los directorios de snapshots pueden contener enlaces a archivos fuera del directorio. Para un montaje portable, copiar los archivos verificados siguiendo sus enlaces con la utilidad incluida:

```powershell
python deployment/prepare-models.py --chronos2 RUTA_ORIGEN_CHRONOS2 --bolt RUTA_ORIGEN_BOLT --output deployment/models
```

Las rutas son las de los checkpoints ya disponibles en el equipo. La herramienta verifica config.json y model.safetensors antes/después de copiar, no descarga modelos y no sobrescribe archivos distintos existentes. El destino está excluido de Git y Docker. Asegurar espacio para la copia y permisos de lectura para el usuario 10001 en Linux. En el servidor usar esas copias con las mismas revisiones/hash.

## Preparación y comandos

Copiar deployment/.env.example a `.env.deploy` en la raíz y sustituir todos los marcadores. El archivo está ignorado por Git y excluido del contexto de construcción. No compartir su contenido ni pasar claves como build arguments. SMTP puede permanecer vacío: la recuperación informará que no está disponible.

```powershell
Copy-Item deployment/.env.example .env.deploy
# Editar .env.deploy localmente antes de continuar.
docker compose --env-file .env.deploy config --quiet
docker compose --env-file .env.deploy build app
docker compose --env-file .env.deploy run --rm migrate
docker compose --env-file .env.deploy up -d app
docker compose --env-file .env.deploy ps
docker compose --env-file .env.deploy logs --tail 80 app
```

No ejecutar `docker compose config` sin `--quiet` al conservar evidencias, porque puede mostrar secretos interpolados. Las migraciones son un paso explícito, no se ejecutan automáticamente en cada arranque. La activación inicial del administrador en una base nueva usa el comando documentado en backend/scripts/bootstrap-admin.ts después del registro de la cuenta; no introducir contraseñas en comandos o evidencias. En una base existente los roles se conservan.

Para una prueba local HTTP, ajustar explícitamente NODE_ENV=development y PUBLIC_ORIGIN=http://localhost:8080 en `.env.deploy`. Este modo no es la configuración pública. En producción usar NODE_ENV=production y origen HTTPS raíz, sin /api al final. Ajustar TRUST_PROXY_HOPS solo después de verificar cuántos proxies confiables hay delante; no confiar ciegamente en cabeceras suministradas por clientes.

## Persistencia, datos y XM

No usar `docker compose down -v` durante una actualización: elimina el volumen de evidencias. Respaldar PostgreSQL y el volumen antes de cambios. Los pesos se respaldan/conservan en sus rutas de host montadas solo lectura.

XM_AUTO_SYNC_ENABLED empieza en false para no modificar datos durante la primera comprobación. Tras verificar conexión XM, carga/restauración de datasets y modelos, habilitarlo conscientemente. TZ=America/Bogota mantiene la planificación diaria de este entorno. No arrancar varias réplicas con el planificador interno sin coordinación.

## Chronos: dependencias y medición pendientes

Las bases oficiales se fijaron por digest. npm usa package-lock con npm ci y Bun usa bun.lock con --frozen-lockfile. Python usa 3.12 porque NumPy 2.5.4 requiere al menos 3.12. Se fijaron las versiones principales observadas localmente, con Torch desde su índice CPU oficial. La resolución completa de dependencias Linux y la disponibilidad efectiva de la rueda CPU deben verificarse al construir; no se han probado aquí. La imagen guarda `python-environment.txt` con las versiones resueltas para revisar y cerrar el bloqueo completo de Python tras la primera construcción validada.

Para medir, preparar un JSON con 672 observaciones reales, como una lista o un objeto con campo context, y colocarlo temporalmente en el volumen de evidencias. No usar resultados de este benchmark como métricas de precisión.

```powershell
docker compose --env-file .env.deploy exec app /opt/venv/bin/python -I -B /app/deployment/benchmark-chronos.py --model chronos2 --context /app/data/benchmark-context.json --periods 24
docker compose --env-file .env.deploy exec app /opt/venv/bin/python -I -B /app/deployment/benchmark-chronos.py --model bolt --context /app/data/benchmark-context.json --periods 24
docker stats --no-stream
```

La herramienta informa tiempo y pico RSS del worker hijo en Linux; docker stats permite observar el conjunto. Repetir ambos modelos con los horizontes necesarios antes de elegir RAM/CPU y límites de peticiones del alojamiento. El worker tiene un límite de 120 segundos. No se ha medido este consumo ni se recomienda un plan concreto todavía.

## Validación de aceptación pública pendiente

Comprobar frontend, /api/health, login/logout, sesión tras recargar, restricciones de administrador, mercado/transacciones y los tres pronósticos Ridge. Probar ambos Chronos para oferta/demanda/precio, preservación de evidencias tras reinicio y actualización XM. Con remitente configurado, verificar correo recibido, enlace HTTPS válido y restablecimiento completado personalmente por el estudiante. El plan de alojamiento debe permitir SMTP 465/587 o requerirá adaptar el transporte a API HTTPS. El éxito de /api/health verifica PostgreSQL, no sustituye las pruebas de modelos ni de correo.

No registrar credenciales, tokens de recuperación, cookies o datos personales en logs/capturas de entrega. Mantener manuales y resultados sincronizados con lo efectivamente desplegado.
