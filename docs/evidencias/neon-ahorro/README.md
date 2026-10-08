# Configuración operacional Neon de bajo cómputo

Fecha: 7 de octubre de 2026, America/Bogota. Evidencia **operacional** de ajustes de cómputo y alertas en consola Neon. Proyecto, branch y hostname se omiten intencionalmente; no se registra baseline de código.

## Ajustes observados

- Cómputo mínimo y máximo configurado: 0.25 CU.
- Scale to zero habilitado después de 5 minutos de inactividad.
- Aviso mensual configurado en USD 5, con alertas al 80% y 100% (USD 4/USD 5).
- El aviso de gasto no es un límite de gasto: `hardSpendingCap=false`.
- Los valores se comprobaron en consola después de guardar y recargar. No se midieron porcentajes de ahorro ni importes facturados.

La captura publicable `neon-configuracion-sanitizada.png` conserva solo los controles y valores relevantes. Se redactaron proyecto, branch y hostname. La captura original se conserva localmente y no forma parte de esta versión publicable. `resultados.json` incluye únicamente los ajustes operacionales y sus limitaciones; se omitieron identidad de conexión, metadatos/conteos del respaldo y su hash.

## Alcance y límites

Esta evidencia no demuestra funcionalidad de EnerTrade, validación C4, restauración de datos ni despliegue productivo. La restauración no se ha probado. No implica un cambio permanente de arquitectura: Neon sigue siendo el servicio PostgreSQL cloud previsto cuando está disponible; PostgreSQL local es un fallback temporal de desarrollo/pruebas, no un destino productivo.

Scale to zero reduce el cómputo activo según la configuración observada, pero no garantiza factura cero ni un porcentaje concreto de ahorro. Las alertas notifican umbrales, no bloquean cargos. Validación académica pendiente.