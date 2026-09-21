# Trazabilidad de backlog — Marketplace de ofertas y demandas

## 1. Propósito

Este documento formaliza técnicamente dos historias surgidas durante TG-II a partir de una necesidad detectada al implementar el flujo transaccional simulado.

Las historias HU-21 y HU-22:

- no reemplazan historias existentes;
- no cambian HU-10;
- completan una dependencia funcional implícita para HU-10;
- quedan pendientes de incorporación al documento académico después de la revisión del sprint.

La fuente de implementación real es el código versionado y la evidencia técnica del incremento Marketplace.

## 2. Justificación del ajuste de backlog

HU-10, “Sugerir emparejamiento entre consumidores y proveedores”, requiere que existan ofertas y demandas disponibles.

El backlog original define el emparejamiento, pero no contiene una historia específica para que usuarios autenticados creen y consulten esas publicaciones.

Durante TG-II se implementó esa capacidad. Por trazabilidad, se formaliza como dos nuevas historias surgidas del refinamiento del backlog durante TG-II. Esto no se presenta como un error del Trabajo de Grado I.

El backlog original conserva HU-01 a HU-20 sin renumeración. La lectura del documento original confirma HU-10 y HU-20, pero no HU-21 ni HU-22.

### Asignación al Sprint 2

El plan original define S2 en las semanas 5–8. El seguimiento oficial de semana 8 tiene corte el 26 de septiembre de 2026.

El incremento Marketplace fue implementado, probado, documentado y versionado antes de dicho corte. Aunque funcionalmente el Marketplace se relaciona con las capacidades transaccionales previstas para S3, su desarrollo fue adelantado durante S2.

Se registra por tanto como un ajuste/refinamiento de backlog incorporado en S2. Esta decisión preserva la cronología real en lugar de reasignar retrospectivamente el trabajo a S3.

HU-21 y HU-22 quedan como antecedentes funcionales de HU-10. HU-10 permanece pendiente.

### Estimación relativa

Se asignan 5 story points a HU-21 y 5 story points a HU-22. La estimación refleja una complejidad intermedia que incluye:

- modelo persistente;
- API autenticada;
- aislamiento por usuario;
- integración frontend;
- validaciones;
- pruebas automatizadas;
- prueba de integración real;
- prueba funcional en navegador.

Los story points son una estimación relativa de complejidad. No equivalen a horas ni constituyen una reconstrucción del tiempo trabajado.

## 3. HU-21 — Registrar oferta energética

- **ID:** HU-21
- **Épica/Módulo:** Gestión transaccional simulada
- **Título:** Registrar oferta energética
- **Prioridad:** Alta
- **Sprint:** S2
- **Story points:** 5
- **Estado técnico:** Completado técnicamente con evidencia
- **Validación académica/formal:** Pendiente

### Historia

Como usuario autenticado de la plataforma, quiero registrar una oferta de energía indicando cantidad, precio por kWh y fecha de entrega, para publicar mi disponibilidad energética dentro del entorno simulado y disponer de información que pueda utilizarse posteriormente en el proceso de emparejamiento.

### Descripción funcional

La oferta:

- queda asociada al usuario autenticado;
- registra cantidad en kWh;
- registra precio en COP/kWh;
- registra fecha de entrega;
- se persiste en PostgreSQL;
- puede consultarse en el listado propio del usuario;
- pertenece a un entorno simulado y no representa una venta real.

### Criterios de aceptación

**Escenario exitoso**

Dado que el usuario está autenticado y proporciona datos válidos, cuando publica una oferta, entonces el sistema la registra asociada a su cuenta y la presenta en su listado.

**Escenario alternativo**

Dado que el usuario no tiene ofertas, cuando consulta su listado, entonces recibe una respuesta vacía controlada.

**Escenario de excepción**

Dado que existen datos inválidos o campos no permitidos, cuando intenta publicar, entonces el sistema rechaza la solicitud y no crea el registro.

**Escenario de seguridad**

Dado que existen ofertas de otros usuarios, cuando el usuario consulta sus ofertas, entonces solo recibe las publicaciones asociadas a su propia sesión.

### Dependencias

- Autenticación.
- PostgreSQL.
- Prisma.
- API backend.

### Relación

HU-21 es un antecedente funcional de HU-10.

## 4. HU-22 — Registrar demanda energética

- **ID:** HU-22
- **Épica/Módulo:** Gestión transaccional simulada
- **Título:** Registrar demanda energética
- **Prioridad:** Alta
- **Sprint:** S2
- **Story points:** 5
- **Estado técnico:** Completado técnicamente con evidencia
- **Validación académica/formal:** Pendiente

### Historia

Como usuario autenticado de la plataforma, quiero registrar una demanda de energía indicando cantidad requerida, precio máximo por kWh y fecha de entrega, para representar mi necesidad energética dentro del entorno simulado y disponer de información que pueda utilizarse posteriormente en el proceso de emparejamiento.

### Descripción funcional

La demanda:

- queda asociada al usuario autenticado;
- registra cantidad requerida en kWh;
- registra precio máximo en COP/kWh;
- registra fecha de entrega;
- se persiste en PostgreSQL;
- puede consultarse en el listado propio del usuario;
- pertenece a un entorno simulado y no representa una compra real.

### Criterios de aceptación

**Escenario exitoso**

Dado que el usuario está autenticado y proporciona datos válidos, cuando publica una demanda, entonces el sistema la registra asociada a su cuenta y la presenta en su listado.

**Escenario alternativo**

Dado que el usuario no tiene demandas, cuando consulta su listado, entonces recibe una respuesta vacía controlada.

**Escenario de excepción**

Dado que existen datos inválidos o campos no permitidos, cuando intenta publicar, entonces el sistema rechaza la solicitud y no crea el registro.

**Escenario de seguridad**

Dado que existen demandas de otros usuarios, cuando el usuario consulta sus demandas, entonces solo recibe las publicaciones asociadas a su propia sesión.

### Dependencias

- Autenticación.
- PostgreSQL.
- Prisma.
- API backend.

### Relación

HU-22 es un antecedente funcional de HU-10.

## 5. Trazabilidad HU-21

| Elemento | Evidencia |
|---|---|
| Objetivo funcional | Registrar una oferta energética propia |
| HU | HU-21 |
| Modelo | `EnergyOffer` |
| Migración | `20260917010000_add_energy_marketplace` |
| API | `POST /offers` y `GET /offers/mine` |
| Autenticación | `requireAuth` / `req.authUser.id` |
| Backend | `offer.controller.ts` / `offer.service.ts` |
| Frontend | `Marketplace.tsx` / `marketplaceService.ts` |
| Pruebas backend | `energy-marketplace.test.ts` |
| Pruebas frontend | `marketplace.test.tsx` |
| Integración | HTTP real + PostgreSQL |
| Prueba funcional | Navegador real, usuarios A/B |
| Evidencia | `docs/evidencias/marketplace/README.md` |
| Commit funcional | `7426228417a2db0b20004d0239eb0747bb7b79fd` |
| Commit evidencia | `4d9c6a5` |
| Sprint | S2 |
| Story points | 5 |
| Estado técnico | Completado técnicamente con evidencia |
| Validación académica | Pendiente |
| Producción | No |

## 6. Trazabilidad HU-22

| Elemento | Evidencia |
|---|---|
| Objetivo funcional | Registrar una demanda energética propia |
| HU | HU-22 |
| Modelo | `EnergyDemand` |
| Migración | `20260917010000_add_energy_marketplace` |
| API | `POST /demands` y `GET /demands/mine` |
| Autenticación | `requireAuth` / `req.authUser.id` |
| Backend | `demand.controller.ts` / `demand.service.ts` |
| Frontend | `Marketplace.tsx` / `marketplaceService.ts` |
| Pruebas backend | `energy-marketplace.test.ts` |
| Pruebas frontend | `marketplace.test.tsx` |
| Integración | HTTP real + PostgreSQL |
| Prueba funcional | Navegador real, usuarios A/B |
| Evidencia | `docs/evidencias/marketplace/README.md` |
| Commit funcional | `7426228417a2db0b20004d0239eb0747bb7b79fd` |
| Commit evidencia | `4d9c6a5` |
| Sprint | S2 |
| Story points | 5 |
| Estado técnico | Completado técnicamente con evidencia |
| Validación académica | Pendiente |
| Producción | No |

## 7. Relación con HU-10

HU-21 y HU-22 proporcionan las entidades transaccionales simuladas que HU-10 podrá consumir posteriormente.

No se afirma que HU-10 esté implementada. El código actual implementa registro y consulta propia de ofertas y demandas, pero no implementa sugerencias de emparejamiento.

**Estado de HU-10:** Pendiente, salvo una verificación futura que demuestre implementación real.

No se confunden las siguientes capacidades:

- registrar ofertas y demandas;
- sugerir matching;
- ejecutar transacciones.

## 8. Estado de implementación

| Historia | Planeada/refinada | Diseñada | Implementada | Probada automatizadamente | Integración real | Navegador real | Validación académica | Producción |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| HU-21 | Sí | Sí | Completado técnicamente | Sí | Sí | Sí | Pendiente | No |
| HU-22 | Sí | Sí | Completado técnicamente | Sí | Sí | Sí | Pendiente | No |
| HU-10 | No modificado aquí | No modificado aquí | No se afirma | No se afirma | No se afirma | No se afirma | No se afirma | No |

## 9. Cambios de backlog

- **Tipo:** Refinamiento/adición de backlog durante Sprint 2 de TG-II.
- **Motivo:** Formalizar una funcionalidad transaccional necesaria para disponer de ofertas y demandas persistentes antes del emparejamiento.
- **Impacto:**
  - se agregan HU-21 y HU-22;
  - se incorporan +10 story points al backlog de S2: HU-21 = 5 y HU-22 = 5;
  - ambas historias quedan completadas técnicamente con evidencia;
  - HU-01 a HU-20 permanecen sin renumeración;
  - HU-10 conserva su objetivo original;
  - se añade dependencia conceptual HU-21/HU-22 -> HU-10;
  - no cambia el objetivo general del proyecto;
  - no cambia el alcance de EnerTrade AI hacia transacciones energéticas reales.

No se recalcula la velocidad completa de S2 porque para ello deben revisarse todas las HU realmente completadas durante el sprint.

## 9.1 Propuesta provisional C20f

- **Título:** Gestionar propuestas de transacción simulada.
- **Estado:** Implementado y probado automatizadamente; formalización académica pendiente.
- **Criterios:** el creador puede editar cantidad antes de aceptación, puede cancelar antes de aceptación, el receptor puede aceptar o rechazar, una confirmada es inmutable y el historial se conserva.
- **Límite:** no asigna una HU definitiva ni altera la numeración vigente.

## 9.2 Propuesta provisional C21a

- **Título:** Permitir cobertura parcial y acumulativa de publicaciones.
- **Estado:** Implementado y probado automatizadamente; formalización académica pendiente.
- **Criterios:** una oferta puede cubrir varias demandas, una demanda puede cubrirse con varias ofertas, el saldo restante sigue disponible, no se permite sobreasignación y el historial conserva la cantidad original y las transacciones asociadas.
- **Regla de estado:** una publicación sigue `ACTIVE` mientras la suma confirmada sea menor a su cantidad original; las reservas pendientes descuentan saldo pero no la completan.
- **Límite:** no incluye pagos, negociación de precio, migración de datos ni modificación del matching informativo.

## 9.3 Propuesta provisional C21b

- **Título:** Negociar términos de una transacción energética simulada.
- **Estado:** Implementado y probado automatizadamente; formalización académica pendiente.
- **Criterios:** iniciar una negociación aunque no exista match de precio automático; proponer cantidad y precio; emitir contrapropuestas alternadas; conservar historial inmutable; mantener una reserva vigente; aceptar el último término; y conservar el saldo parcial final de las publicaciones.
- **Límites:** no asigna una HU oficial ni altera la numeración vigente. No incluye pagos, liquidación, entrega física, cambios de frontend ni modificación de matching-v1.
- **Evidencia pendiente:** prueba real de concurrencia PostgreSQL para contrapropuestas simultáneas.

## 9.4 Propuesta provisional C21d

- **Título:** Sincronizar automáticamente Marketplace y transacciones, con formato numérico es-CO y filtros de publicaciones.
- **Estado:** Implementado; pruebas frontend y validación manual entre dos sesiones pendientes de evidencia.
- **Criterios:** polling visible cada 5 segundos, formularios locales preservados, historial abierto actualizado, no auto-matching, aviso de sugerencias desactualizadas, payload numérico canónico y filtros de trazabilidad por estado.
- **Límites:** no añade WebSocket/SSE, backend, pagos ni cambios a matching-v1.

## 10. Pendientes documentales

- Incorporar HU-21 y HU-22 al Product Backlog de TG-II.
- Incorporar HU-21 y HU-22 en la sección Sprint 2.
- Registrar el ajuste en la retrospectiva de S2.
- Actualizar la trazabilidad del informe.
- Mantener la validación académica como pendiente.

## Seguridad y límites

Este documento no incluye emails de prueba, passwords, tokens, cookies reales, `DATABASE_URL`, IDs personales ni hosts de PostgreSQL.

No se afirma que HU-10 esté implementada, que exista matching, que el Marketplace esté desplegado en producción ni que existan transacciones reales.
