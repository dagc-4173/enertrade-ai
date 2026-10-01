# HU-06 — Experimento directo multi-horizonte V2

## Hipótesis

V1 no capturó suficiente dinámica reciente y todos sus horizontes incumplieron la regla catastrófica. V2 cambia únicamente las features. Conserva snapshot, particiones, baselines, grid alpha y promoción predefinida.

## Features finales

- `demand_at_origin`
- `demand_1_day_before_origin`
- `demand_2_days_before_origin`
- `demand_6_days_before_origin`
- `demand_7_days_before_origin`
- `demand_13_days_before_origin`
- `demand_14_days_before_origin`
- `demand_27_days_before_origin`
- `demand_28_days_before_origin`
- `demand_mean_7d_ending_at_origin`
- `demand_mean_14d_ending_at_origin`
- `demand_mean_28d_ending_at_origin`
- `demand_std_7d_ending_at_origin`
- `demand_std_14d_ending_at_origin`
- `sin_2pi_target_weekday_over7`
- `cos_2pi_target_weekday_over7`

Se omitieron `mean_3d` y tendencia reciente por ser combinaciones lineales exactas de niveles ya presentes. Las ventanas terminan en t. Weekday del target es contexto calendario conocido y no una observación futura.

## Protocolo preservado

Corpus SHA-256 `18fd5aad3fe12eaa5290dba9ea551ccaef1a2baf4f41febf0c0354f0252c1735`; TRAIN 2024-02-04..2026-03-31; VALIDATION 2026-04-01..2026-05-31; HOLDOUT 2026-06-01..2026-09-29. Alpha y baseline se seleccionan solo con validation. El holdout se evalúa después sin reajuste.

## Hallazgo de calidad

El holdout real contiene `2026-09-28=138000 kWh` y `2026-09-29=11310 kWh`, después de `2026-09-27=217211045.44 kWh`. Son valores finitos aceptados por el ruleset actual, pero producen errores máximos de 256–283 millones kWh, por encima del umbral predefinido de aproximadamente 135 millones. No se excluyeron, imputaron ni reinterpretaron después de observarlos. Debe verificarse su semántica/publicación con XM antes de repetir o promover el experimento.

V2 permanece offline y no modifica runtime, catálogo, frontend, Oferta ni Precio. Ningún horizonte es candidato bajo el protocolo congelado.
