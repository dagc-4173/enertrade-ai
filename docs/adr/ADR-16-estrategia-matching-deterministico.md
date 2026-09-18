# ADR-16 — Estrategia determinista para sugerencias de emparejamiento

**Estado:** Aceptado para el alcance acotado de HU-10.

## Contexto

La historia HU-10 requiere sugerir emparejamientos entre ofertas y demandas energéticas disponibles en un entorno simulado. La implementación no crea transacciones, no modifica inventarios reales ni persiste decisiones de matching.

El alcance técnico actual está delimitado a una capa de sugerencia determinista, aplicada sobre datos ya existentes en memoria o en repositorios de lectura. La intención es ofrecer una salida reproducible y verificable sin introducir cambios en el esquema Prisma ni migraciones adicionales.

## Problema

Un emparejamiento energético no puede asumirse como una operación transaccional ni como una liquidación real. Si la solución se integra directamente con escritura en base de datos, se desplaza el alcance de HU-10 hacia persistencia y decisiones de negocio con efectos de estado, sin evidencia de necesidad en este sprint.

Además, el algoritmo debe ser determinista: la misma entrada debe producir la misma salida, con ordenamiento estable por precio, fecha de creación y identificador.

## Alternativas consideradas

### Opción A — Matching determinista en memoria, sin persistencia

**Ventajas:**

- evita cambios en Prisma y migraciones;
- mantiene el alcance acotado a HU-10;
- produce salidas reproducibles y auditables;
- no altera la arquitectura de registros transaccionales existentes;
- permite pruebas automatizadas directas sobre la lógica de matching.

**Desventajas:**

- no persiste sugerencias ni decisiones; la salida es efímera;
- requiere una frontera clara entre oferta/demanda inventariadas y la recomendación sugerida.

### Opción B — Persistir matching y decisiones en PostgreSQL

**Ventajas:**

- habilita una historia de historial de emparejamientos;
- permite trazabilidad y auditoría de decisiones.

**Desventajas:**

- exige modificación del esquema y migraciones;
- amplía funcionalidad fuera del alcance de HU-10;
- introduce estado y complejidad operativa no exigida por la historia;
- requiere decisiones sobre idempotencia, conciliación y reintentos.

### Opción C — Reusar la lógica de transacción completa como matching real

**Ventajas:**

- podría parecer más completo desde el punto de vista de negocio.

**Desventajas:**

- no forma parte de la intención de la historia vigente;
- excede el alcance permitido;
- requiere reglas de liquidación, inventario y validación financiera que no están diseñadas en este proyecto.

## Decisión

Se adopta la **Opción A**.

La sugerencia de emparejamiento es una operación de lectura y cálculo determinista. El flujo actual:

- considera solo ofertas y demandas con `status = ACTIVE`;
- ordena ofertas por precio ascendente, luego `createdAt` y `id`;
- ordena demandas por `createdAt` y `id`;
- empareja solo si la fecha de entrega coincide;
- acepta solo si el precio de la oferta no supera el máximo de la demanda;
- asigna la menor cantidad entre oferta restante y demanda restante;
- conserva la demanda en el resultado incluso cuando no hay coincidencia;
- devuelve `status` como `matched`, `partial` o `no_matches`.

No se crean tablas de matching, ni registros persistentes, ni nuevas migraciones.

## Justificación

La regla principal del proyecto exige verificar implementación real y no asumir completitud por documentación. En este caso, la evidencia existente muestra que la capa Marketplace ya provee ofertas y demandas, pero no existe un modelo de matching persistente ni un contrato de negocio que obligue a persistir sugerencias.

La estrategia determinista es suficiente para la HU-10 porque cumple la necesidad mínima de producir una recomendación útil sin alterar la persistencia ni la arquitectura actual.

## Consecuencias

### Positivas

- mantiene el alcance estrictamente acotado;
- evita cambios de esquema y migraciones;
- facilita pruebas automatizadas y comparabilidad;
- mantiene la capa de negocio separada de la persistencia;
- exige un repositorio de lectura inyectado en el servicio productivo.

### Deuda y límites

- la sugerencia no se conserva en base de datos;
- no hay historial de emparejamientos ni auditoría de decisiones;
- la salida es útil para análisis o UI, no para una operación comercial final.

## Estado de implementación

- `buildMatchingSuggestions(...)`: implementado.
- `createMatchingService(...)`: implementado con repositorio de lectura obligatorio.
- `POST /matches/suggest`: implementado y autenticado.
- `schema.prisma`: sin cambios.
- `migraciones`: no creadas.

Un repositorio válido sin ofertas o demandas es un resultado de negocio
`no_matches`. Un fallo de lectura del repositorio es un error interno controlado
y no se convierte en una sugerencia vacía.

Se trata de una implementación técnica acotada, validada por pruebas automatizadas y sin expansión funcional fuera de HU-10.
