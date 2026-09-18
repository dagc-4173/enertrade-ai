# Evidencia técnica — HU-10: Sugerir emparejamiento entre consumidores y proveedores

## Objetivo

Validar la implementación acotada de una sugerencia de emparejamiento entre ofertas y demandas energéticas activas, sin persistir decisiones ni modificar el esquema Prisma.

## Alcance real implementado

- `buildMatchingSuggestions(...)` calcula coincidencias deterministas.
- `createMatchingService(...)` actúa como capa de lectura.
- `POST /matches/suggest` queda protegido por autenticación.
- El endpoint acepta cuerpo vacío y rechaza query string.
- La respuesta elimina `userId` si alguna entidad lo trajera de repositorios futuros.
- Un repositorio válido sin ofertas o demandas devuelve `200` con `no_matches`.
- Un fallo de lectura del repositorio devuelve `500` controlado; no se interpreta como ausencia de coincidencias.

Se mantiene el criterio de no escritura y no se incorporan migraciones.

## Contrato observado

### Endpoint

- `POST /matches/suggest`
- Requiere autenticación.
- Cuerpo esperado: JSON vacío `{}`.
- Query: no permitida.
- Respuesta HTTP 200 cuando la solicitud es válida.

### Estructura de salida

```json
{
  "status": "matched" | "partial" | "no_matches",
  "matches": [
    {
      "offerId": "...",
      "demandId": "...",
      "suggestedQuantityKwh": "30.00",
      "offerPricePerKwh": "400.00000",
      "maxDemandPricePerKwh": "450.00000",
      "deliveryDate": "2026-09-18"
    }
  ],
  "demands": [
    {
      "demandId": "...",
      "requestedQuantityKwh": "30.00",
      "suggestedQuantityKwh": "30.00",
      "unmatchedQuantityKwh": "0",
      "compatibility": "FULL" | "PARTIAL" | "NO_MATCH",
      "reasons": ["SAME_DELIVERY_DATE", "PRICE_COMPATIBLE"]
    }
  ],
  "summary": {
    "offersConsidered": 1,
    "demandsConsidered": 1,
    "suggestedMatches": 1,
    "matchedQuantityKwh": "30.00",
    "unmatchedDemandKwh": "0"
  },
  "warnings": []
}
```

## Reglas del algoritmo

- solo considera `ACTIVE`;
- compara fechas de entrega; si no coinciden, no empareja;
- si el precio de oferta excede el máximo de demanda, no empareja;
- prioriza ofertas más baratas;
- cuando hay empate, ordena por `createdAt` y luego `id`;
- el resultado incluye demandas sin coincidencia para trazabilidad;
- la salida es determinista.

## Evidencia de verificación

Se ejecutaron estas comprobaciones reales:

```bash
Set-Location 'd:\Proyectos\backend'
bun test src/tests/matching.test.ts
bun test
bunx tsc -p tsconfig.json --noEmit
git diff --check
git diff -- backend/prisma/schema.prisma
```

Resultados observados:

- `matching.test.ts`: 22 pass, 0 fail.
- suite backend completa: exitosa según salida de `bun test`.
- typecheck: exitoso.
- `git diff --check`: sin errores.
- `backend/prisma/schema.prisma`: sin modificaciones.

## Estado

**Implementado y probado técnicamente en alcance acotado.**

No se afirma completitud académica ni despliegue. La funcionalidad cumple la intención de HU-10 sin ampliar a transacciones reales ni a persistencia de matching.
