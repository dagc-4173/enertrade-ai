# Deuda técnica — HU-02

1. No existe revalidación.
2. No existe historial de validaciones.
3. Dos solicitudes concurrentes pueden realizar cálculo redundante aunque solo una persista.
4. validationReport es JSON y su estructura se garantiza en aplicación, no por PostgreSQL.
5. El consumo de memoria depende del tamaño del dataset y del número de hallazgos.
6. Permanece la advertencia futura del driver pg sobre modos SSL.
7. La cobertura v1 no incluye rangos, periodicidad, catálogo de zonas ni verificación independiente de unidades.
8. La validación formal/académica está pendiente.
