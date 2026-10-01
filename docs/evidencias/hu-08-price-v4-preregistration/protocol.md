# Protocolo prospectivo HU-08 V4

## Congelación

Versión `hu08-price-v4-gene-only@1.0.0-preregistered`; cutoff `2026-10-01T16:18:30.593Z`. Features, modelos, alpha, baseline, scaler y criterios de [manifest.json](manifest.json) no pueden cambiar sin crear V5.

## Generación previa al target

Cuando Precio y Gene estén completos hasta t, generar D+1..D+7 usando solo fechas <=t. Cada día Gene debe contener 24 periodos. Si falta una fuente, registrar unavailable; no imputar. Guardar una entrada JSONL append-only con `generatedAt`, origen, target, horizonte, versión, 24 predicciones, cobertura fuente, hash de features, hash previo y hash de entrada. No existe API de actualización: una clave modelo/target/horizonte repetida se rechaza.

## Evaluación

El target debe ser recibido por XM después de `generatedAt` y del cutoff. Comparar exclusivamente contra la predicción ya almacenada; nunca recalcularla con información posterior. Por horizonte reportar MAE, RMSE, Bias, WAPE, maxAbsoluteError, evaluable y unavailable.

## Promoción congelada

Exigir mejora MAE >=1% y WAPE no peor frente al baseline congelado, unavailable=0 atribuible al modelo, finitud, maxAbsoluteError <= threshold TRAIN y ausencia de leakage. Para h4/h5/h6, donde V1 fue candidata, V4 debe además superar las predicciones prospectivas V1 generadas y congeladas en los mismos orígenes.

## Suficiencia

14 días completos: evidencia preliminar. 60 días completos por horizonte: evaluación prospectiva mínima suficiente para decisión técnica. Ambos estados deben informar indisponibles programados y no implican validación académica universal.
