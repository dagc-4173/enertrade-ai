# Diagrama de clases conceptual
```mermaid
    classDiagram

    class Usuario {
        +int idUsuario
        +string nombre
        +string correo
        +string estado
        +iniciarSesion()
        +consultarResultados()
    }

    class PerfilUsuario {
        +int idPerfil
        +string tipoPerfil
        +string descripcion
        +asignarPermisos()
    }

    class Proveedor {
        +int idProveedor
        +string tipoFuenteEnergia
        +float capacidadOferta
        +registrarOferta()
        +consultarEmparejamientos()
    }

    class Consumidor {
        +int idConsumidor
        +float demandaEstimada
        +registrarDemanda()
        +consultarRecomendaciones()
    }

    class OfertaEnergia {
        +int idOferta
        +float cantidadEnergia
        +float precioBase
        +date fechaDisponibilidad
        +string estado
        +registrarOferta()
        +actualizarOferta()
    }

    class DemandaEnergia {
        +int idDemanda
        +float cantidadRequerida
        +float precioEsperado
        +date fechaSolicitud
        +string estado
        +registrarDemanda()
        +actualizarDemanda()
    }

    class TransaccionSimulada {
        +int idTransaccion
        +date fechaSimulacion
        +string estado
        +float energiaNegociada
        +float precioReferencia
        +registrarSimulacion()
        +consultarEstado()
    }

    class MotorIA {
        +int idMotor
        +string version
        +procesarDatos()
        +generarPronostico()
        +recomendarPrecio()
        +sugerirEmparejamiento()
        +reconocerPatrones()
    }

    class ModeloIA {
        +int idModelo
        +string nombreModelo
        +string tipoModelo
        +string version
        +date fechaEntrenamiento
        +float metricaDesempeno
        +entrenarModelo()
        +evaluarModelo()
    }

    class PrediccionOferta {
        +int idPrediccionOferta
        +float valorEstimado
        +date periodo
        +float nivelConfianza
        +generarPrediccion()
    }

    class PrediccionDemanda {
        +int idPrediccionDemanda
        +float valorEstimado
        +date periodo
        +float nivelConfianza
        +generarPrediccion()
    }

    class RecomendacionPrecio {
        +int idRecomendacion
        +float precioSugerido
        +string condiciones
        +date fechaGeneracion
        +generarRecomendacion()
    }

    class EmparejamientoEnergetico {
        +int idEmparejamiento
        +float porcentajeCompatibilidad
        +string criterioEmparejamiento
        +string estado
        +generarEmparejamiento()
        +consultarResultado()
    }

    class PatronIdentificado {
        +int idPatron
        +string tipoPatron
        +string descripcion
        +float nivelRelevancia
        +date fechaIdentificacion
        +string variableAnalizada
        +registrarPatron()
        +consultarPatron()
    }

    class ResultadoAnalitico {
        +int idResultado
        +string tipoResultado
        +date fechaGeneracion
        +string descripcion
        +almacenarResultado()
        +consultarResultado()
    }

    class RegistroTrazabilidad {
        +int idRegistro
        +date fechaEvento
        +string tipoEvento
        +string detalle
        +string estado
        +registrarEvento()
        +consultarEvento()
    }

    class DatasetEnergetico {
        +int idDataset
        +string fuente
        +string tipoDato
        +date fechaCarga
        +string estadoValidacion
        +validarDataset()
        +prepararDataset()
    }

    Usuario "1" --> "1" PerfilUsuario : tiene
    Usuario <|-- Proveedor
    Usuario <|-- Consumidor

    Proveedor "1" --> "0..*" OfertaEnergia : registra
    Consumidor "1" --> "0..*" DemandaEnergia : registra

    OfertaEnergia "1" --> "0..*" EmparejamientoEnergetico : participa
    DemandaEnergia "1" --> "0..*" EmparejamientoEnergetico : participa

    EmparejamientoEnergetico "1" --> "0..1" TransaccionSimulada : genera

    MotorIA "1" --> "0..*" ModeloIA : utiliza
    MotorIA "1" --> "0..*" DatasetEnergetico : procesa

    ModeloIA "1" --> "0..*" PrediccionOferta : genera
    ModeloIA "1" --> "0..*" PrediccionDemanda : genera
    ModeloIA "1" --> "0..*" RecomendacionPrecio : genera
    ModeloIA "1" --> "0..*" PatronIdentificado : identifica

    MotorIA "1" --> "0..*" EmparejamientoEnergetico : sugiere
    MotorIA "1" --> "0..*" ResultadoAnalitico : produce

    ResultadoAnalitico "1" --> "0..*" PrediccionOferta : contiene
    ResultadoAnalitico "1" --> "0..*" PrediccionDemanda : contiene
    ResultadoAnalitico "1" --> "0..*" RecomendacionPrecio : contiene
    ResultadoAnalitico "1" --> "0..*" PatronIdentificado : contiene
    ResultadoAnalitico "1" --> "0..*" EmparejamientoEnergetico : contiene

    RegistroTrazabilidad "0..*" --> "1" MotorIA : registra eventos de
    RegistroTrazabilidad "0..*" --> "1" ResultadoAnalitico : documenta
```
<b><i><span style='font-size:12px;'> 
    Diagrama 07.<br>
    Diagrama de clases conceptual de la plataforma EnerTrade AI.
 </span></i></b>