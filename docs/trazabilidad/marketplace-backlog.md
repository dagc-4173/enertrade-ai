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

## 3. HU-21 — Registrar oferta energética

- **ID:** HU-21
- **Épica/Módulo:** Gestión transaccional simulada
- **Título:** Registrar oferta energética
- **Prioridad:** Alta
- **Sprint:** Pendiente de asignación documental
- **Story points:** Pendiente de estimación/documentación
- **Estado técnico:** Implementada y probada técnicamente
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
- **Sprint:** Pendiente de asignación documental
- **Story points:** Pendiente de estimación/documentación
- **Estado técnico:** Implementada y probada técnicamente
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
| Estado | Implementada y probada técnicamente |

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
| Estado | Implementada y probada técnicamente |

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
| HU-21 | Sí | Sí | Sí | Sí | Sí | Sí | Pendiente | No |
| HU-22 | Sí | Sí | Sí | Sí | Sí | Sí | Pendiente | No |
| HU-10 | No modificado aquí | No modificado aquí | No se afirma | No se afirma | No se afirma | No se afirma | No se afirma | No |

## 9. Cambios de backlog

- **Tipo:** Refinamiento/adición de backlog durante TG-II.
- **Motivo:** Formalizar una funcionalidad transaccional necesaria para disponer de ofertas y demandas persistentes antes del emparejamiento.
- **Impacto:**
  - se agregan HU-21 y HU-22;
  - HU-01 a HU-20 permanecen sin renumeración;
  - HU-10 conserva su objetivo original;
  - se añade dependencia conceptual HU-21/HU-22 -> HU-10;
  - no cambia el objetivo general del proyecto;
  - no cambia el alcance de EnerTrade AI hacia transacciones energéticas reales.

## 10. Pendientes documentales

- Definir el sprint al revisar el diario real de sprints.
- Definir o confirmar story points.
- Incorporar HU-21 y HU-22 al Product Backlog de TG-II.
- Incorporar las historias al sprint correspondiente.
- Actualizar la trazabilidad del informe.
- Mantener la validación académica como pendiente.

## Seguridad y límites

Este documento no incluye emails de prueba, passwords, tokens, cookies reales, `DATABASE_URL`, IDs personales ni hosts de PostgreSQL.

No se afirma que HU-10 esté implementada, que exista matching, que el Marketplace esté desplegado en producción ni que existan transacciones reales.
