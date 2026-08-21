# Arquitectura física / despliegue del prototipo
```mermaid
    flowchart TB

    %% Usuarios
    subgraph Usuarios["Usuarios del sistema"]
        Proveedor["Proveedor / Generador"]
        Consumidor["Consumidor / Demandante"]
        Admin["Administrador"]
        GerenteTec["Gerente de tecnología"]
    end

    %% Cliente
    subgraph Cliente["Equipo cliente / navegador"]
        Navegador["Navegador Web<br/>Acceso a la plataforma"]
    end

    %% Servidor de aplicación
    subgraph ServidorApp["Servidor de aplicación / entorno backend"]
        Frontend["Frontend Web<br/>Interfaz de usuario"]
        APIGateway["API Gateway<br/>Enrutamiento de solicitudes"]
        Backend["Backend principal<br/>Gestión de usuarios, ofertas,<br/>demandas y simulaciones"]
        ServicioTransaccional["Servicio transaccional<br/>Simulación de compra y venta<br/>de energía"]
        ServicioTrazabilidad["Servicio de trazabilidad<br/>Registro de eventos, consultas<br/>y resultados"]
    end

    %% Comunicación
    subgraph Mensajeria["Servidor de mensajería"]
        RabbitMQ["RabbitMQ<br/>Colas de mensajes<br/>entre servicios"]
    end

    %% Servicio IA
    subgraph ServidorIA["Servidor / contenedor del motor IA"]
        APIIA["Servicio IA / API Python<br/>Recepción de solicitudes<br/>y entrega de resultados"]
        Pipeline["Pipeline de datos<br/>Validación, limpieza<br/>y transformación"]
        ModelosIA["Modelos IA entrenados<br/>Oferta, demanda, precio,<br/>emparejamiento y patrones"]
        ResultadosIA["Resultados IA<br/>Pronósticos, precios,<br/>emparejamientos sugeridos<br/>y patrones identificados"]
    end

    %% Persistencia
    subgraph Datos["Servidor de base de datos / almacenamiento"]
        BDPrincipal["Base de datos principal<br/>Usuarios, ofertas, demandas,<br/>transacciones simuladas<br/>y resultados analíticos"]
        DatosHistoricos["Repositorio de datos históricos<br/>Generación, consumo, precios<br/>y transacciones simuladas"]
        RepoModelos["Repositorio de modelos<br/>Versiones, métricas,<br/>configuración y documentación"]
        Logs["Logs técnicos<br/>Trazabilidad, errores<br/>y rendimiento"]
    end

    %% Ambiente académico
    subgraph Pruebas["Ambiente de pruebas académico"]
        Evidencias["Evidencias de validación<br/>Pruebas funcionales,<br/>métricas e integración"]
        Documentacion["Documentación técnica<br/>Arquitectura, servicios,<br/>modelos y despliegue"]
    end

    %% Relaciones usuarios
    Proveedor --> Navegador
    Consumidor --> Navegador
    Admin --> Navegador
    GerenteTec --> Navegador

    %% Flujo cliente - servidor
    Navegador --> Frontend
    Frontend --> APIGateway
    APIGateway --> Backend

    %% Backend
    Backend --> ServicioTransaccional
    Backend --> ServicioTrazabilidad
    Backend --> BDPrincipal

    %% Mensajería
    ServicioTransaccional --> RabbitMQ
    Backend --> RabbitMQ
    RabbitMQ --> APIIA
    APIIA --> RabbitMQ

    %% Motor IA
    APIIA --> Pipeline
    Pipeline --> DatosHistoricos
    Pipeline --> ModelosIA
    ModelosIA --> ResultadosIA

    %% Resultados IA
    ResultadosIA --> APIIA
    ResultadosIA --> BDPrincipal
    ResultadosIA --> ServicioTrazabilidad

    %% Persistencia
    ServicioTrazabilidad --> Logs
    ModelosIA --> RepoModelos
    Pipeline --> RepoModelos

    %% Pruebas y documentación
    ResultadosIA --> Evidencias
    Logs --> Evidencias
    RepoModelos --> Documentacion
    Evidencias --> Documentacion
```
<b><i><span style='font-size:12px;'> 
    Diagrama 05.<br>
    Arquitectura física de despliegue del prototipo EnerTrade AI.
 </span></i></b>