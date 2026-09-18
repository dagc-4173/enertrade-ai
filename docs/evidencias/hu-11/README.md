# Evidencia tecnica — HU-11: Registrar resultado de emparejamiento

## Objetivo y estado

HU-11 registra la trazabilidad de cada simulacion generada por `POST /matches/suggest`. HU-10 conserva la responsabilidad de calcular sugerencias; HU-11 persiste el ciclo de ejecucion, criterios, entrada y salida.

| Dimension | Estado |
| --- | --- |
| Trazabilidad backend HU-11 | Implementado |
| Pruebas automatizadas | Probado tecnicamente |
| Validacion academica/formal | Pendiente |
| Despliegue | Pendiente |

## Modelo y lifecycle

`MatchingExecution` contiene UUID, `executionStatus`, `matchingStatus`, `criteriaVersion`, snapshots JSON, `errorCode`, `createdAt` y `completedAt`.

El lifecycle es `pending -> succeeded|failed`. `matchingStatus` se mantiene separado: `matched`, `partial` y `no_matches`. Una ejecucion con `no_matches` es satisfactoria; no es un fallo tecnico.

Cada POST genera un UUID nuevo. La implementacion no modifica `EnergyOffer`, `EnergyDemand`, cantidades, estados ni crea transacciones o pagos.

## Snapshots y criterios

`inputSnapshot` guarda solo las ofertas y demandas activas usadas: ID, cantidades/precios como strings, `deliveryDate` y `createdAt`. No guarda usuario, correo, contrasena, cookies, tokens ni sesiones.

`criteriaVersion` es `matching-v1`. El snapshot estructurado conserva filtro `ACTIVE`, fecha igual, limite de precio, cantidad remanente positiva, orden determinista y asignacion greedy.

`resultSnapshot` conserva el resultado funcional HU-10 sin un contrato paralelo: `status`, `matches`, `demands`, `summary` y `warnings`.

## Contrato HTTP

La respuesta de `POST /matches/suggest` conserva los campos HU-10 y agrega:

```json
{
  "trace": {
    "executionId": "uuid",
    "persistence": "persisted" | "failed"
  }
}
```

Si falla iniciar o completar la persistencia, el resultado tecnico de matching se devuelve intacto con `trace.persistence = "failed"`. Si falla la lectura o el calculo antes de existir un resultado, el endpoint responde con error interno controlado e intenta marcar la ejecucion como `failed`.

## Pruebas ejecutadas

`matching-trace.test.ts` valida FULL, PARTIAL, NO_MATCH, snapshots, precision de decimales, criterios, UUID por intento, lifecycle, fallos de inicio/finalizacion, error sanitizado, inmutabilidad de publicaciones, ausencia de transacciones comerciales, paridad de `resultSnapshot` y contrato HTTP.

La prueba usa repositorio y almacenamiento en memoria inyectados; no afirma integracion PostgreSQL real. Se complementa con la regresion HU-10 y Marketplace.

## Limitaciones

- Puede quedar una ejecucion `pending` si falla el cierre de persistencia.
- No existe endpoint de consulta historica en HU-11 v1.
- El backend requiere autenticacion, pero no implementa RBAC ni restriccion real al rol administrador.

Ver [ADR-17](../../adr/ADR-17-trazabilidad-ejecuciones-matching.md) y [ADR-16](../../adr/ADR-16-estrategia-matching-deterministico.md).
