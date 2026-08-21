# Modelo entidad-relación conceptual
```mermaid
    erDiagram

    USUARIOS {
        int id_usuario PK
        string nombre
        string correo
        string estado
        int id_perfil FK
    }

    PERFILES_USUARIO {
        int id_perfil PK
        string tipo_perfil
        string descripcion
    }

    OFERTAS_ENERGIA {
        int id_oferta PK
        int id_usuario FK
        float cantidad_energia
        float precio_base
        date fecha_disponibilidad
        string estado
    }

    DEMANDAS_ENERGIA {
        int id_demanda PK
        int id_usuario FK
        float cantidad_requerida
        float precio_esperado
        date fecha_solicitud
        string estado
    }

    TRANSACCIONES_SIMULADAS {
        int id_transaccion PK
        int id_oferta FK
        int id_demanda FK
        int id_emparejamiento FK
        date fecha_simulacion
        float energia_negociada
        float precio_referencia
        string estado
    }

    DATASETS_ENERGETICOS {
        int id_dataset PK
        string fuente
        string tipo_dato
        date fecha_carga
        string estado_validacion
        string observaciones
    }

    MODELOS_IA {
        int id_modelo PK
        string nombre_modelo
        string tipo_modelo
        string version
        date fecha_entrenamiento
        float metrica_desempeno
        string estado
        int id_dataset FK
    }

    PREDICCIONES_OFERTA {
        int id_prediccion_oferta PK
        int id_modelo FK
        int id_oferta FK
        date periodo
        float valor_estimado
        float nivel_confianza
        date fecha_generacion
    }

    PREDICCIONES_DEMANDA {
        int id_prediccion_demanda PK
        int id_modelo FK
        int id_demanda FK
        date periodo
        float valor_estimado
        float nivel_confianza
        date fecha_generacion
    }

    RECOMENDACIONES_PRECIO {
        int id_recomendacion PK
        int id_modelo FK
        int id_oferta FK
        int id_demanda FK
        float precio_sugerido
        string condiciones
        date fecha_generacion
        string estado
    }

    EMPAREJAMIENTOS_ENERGETICOS {
        int id_emparejamiento PK
        int id_oferta FK
        int id_demanda FK
        int id_modelo FK
        float porcentaje_compatibilidad
        string criterio_emparejamiento
        date fecha_generacion
        string estado
    }

    PATRONES_IDENTIFICADOS {
        int id_patron PK
        int id_modelo FK
        int id_dataset FK
        string tipo_patron
        string variable_analizada
        string descripcion
        float nivel_relevancia
        date fecha_identificacion
        string estado_revision
    }

    RESULTADOS_ANALITICOS {
        int id_resultado PK
        string tipo_resultado
        string descripcion
        date fecha_generacion
        int id_modelo FK
        int id_prediccion_oferta FK
        int id_prediccion_demanda FK
        int id_recomendacion FK
        int id_emparejamiento FK
        int id_patron FK
    }

    TRAZABILIDAD_CONSULTAS {
        int id_trazabilidad PK
        int id_usuario FK
        int id_resultado FK
        date fecha_evento
        string tipo_evento
        string detalle
        string estado
        float tiempo_respuesta
    }

    METRICAS_MODELOS {
        int id_metrica PK
        int id_modelo FK
        string nombre_metrica
        float valor_metrica
        date fecha_evaluacion
        string observaciones
    }

    %% Relaciones principales

    PERFILES_USUARIO ||--o{ USUARIOS : asigna
    USUARIOS ||--o{ OFERTAS_ENERGIA : registra
    USUARIOS ||--o{ DEMANDAS_ENERGIA : registra

    OFERTAS_ENERGIA ||--o{ EMPAREJAMIENTOS_ENERGETICOS : participa
    DEMANDAS_ENERGIA ||--o{ EMPAREJAMIENTOS_ENERGETICOS : participa

    EMPAREJAMIENTOS_ENERGETICOS ||--o{ TRANSACCIONES_SIMULADAS : genera
    OFERTAS_ENERGIA ||--o{ TRANSACCIONES_SIMULADAS : relaciona
    DEMANDAS_ENERGIA ||--o{ TRANSACCIONES_SIMULADAS : relaciona

    DATASETS_ENERGETICOS ||--o{ MODELOS_IA : entrena
    DATASETS_ENERGETICOS ||--o{ PATRONES_IDENTIFICADOS : alimenta

    MODELOS_IA ||--o{ PREDICCIONES_OFERTA : genera
    MODELOS_IA ||--o{ PREDICCIONES_DEMANDA : genera
    MODELOS_IA ||--o{ RECOMENDACIONES_PRECIO : genera
    MODELOS_IA ||--o{ EMPAREJAMIENTOS_ENERGETICOS : sugiere
    MODELOS_IA ||--o{ PATRONES_IDENTIFICADOS : identifica
    MODELOS_IA ||--o{ METRICAS_MODELOS : evalua

    OFERTAS_ENERGIA ||--o{ PREDICCIONES_OFERTA : usa
    DEMANDAS_ENERGIA ||--o{ PREDICCIONES_DEMANDA : usa

    OFERTAS_ENERGIA ||--o{ RECOMENDACIONES_PRECIO : considera
    DEMANDAS_ENERGIA ||--o{ RECOMENDACIONES_PRECIO : considera

    PREDICCIONES_OFERTA ||--o{ RESULTADOS_ANALITICOS : compone
    PREDICCIONES_DEMANDA ||--o{ RESULTADOS_ANALITICOS : compone
    RECOMENDACIONES_PRECIO ||--o{ RESULTADOS_ANALITICOS : compone
    EMPAREJAMIENTOS_ENERGETICOS ||--o{ RESULTADOS_ANALITICOS : compone
    PATRONES_IDENTIFICADOS ||--o{ RESULTADOS_ANALITICOS : compone

    RESULTADOS_ANALITICOS ||--o{ TRAZABILIDAD_CONSULTAS : registra
    USUARIOS ||--o{ TRAZABILIDAD_CONSULTAS : consulta
```
<b><i><span style='font-size:12px;'> 
    Diagrama 08.<br>
    Modelo entidad-relación conceptual de la plataforma EnerTrade AI.
 </span></i></b>