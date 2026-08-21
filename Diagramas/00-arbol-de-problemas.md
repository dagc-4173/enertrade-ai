# Árbol de problemas
```mermaid
    flowchart TB

    %% Causas secundarias
    C1["Insuficiente capacidad predictiva<br/>sobre generación fotovoltaica<br/>y consumo energético"]
    C2["Falta de procesamiento estructurado<br/>de datos históricos<br/>y contextuales"]
    C3["Limitada recomendación de precios<br/>basada en oferta, demanda<br/>y patrones históricos"]
    C4["Carencia de mecanismos para reconocer<br/>patrones energéticos y transaccionales<br/>relevantes"]
    C5["Falta de contratos claros de integración<br/>entre motor IA, backend,<br/>base de datos y sistema transaccional"]
    C6["Baja trazabilidad y reproducibilidad<br/>de modelos, datos, resultados analíticos<br/>y simulaciones"]
    C7["Ausencia de métricas técnicas<br/>para evaluar modelos, integración,<br/>resultados analíticos y calidad del prototipo"]

    %% Causa principal
    CP["CAUSA PRINCIPAL<br/><br/>Ausencia de un componente inteligente integrado<br/>que analice datos históricos,<br/>pronostique oferta y demanda,<br/>recomiende precios, sugiera emparejamientos<br/>y reconozca patrones en procesos<br/>de intercambio energético simulado"]

    %% Problema central
    P["PROBLEMA CENTRAL<br/><br/>Limitada capacidad de las plataformas centralizadas<br/>de intercambio energético tipo P2P<br/>para simular de forma inteligente<br/>la compra y venta de energía,<br/>integrando pronóstico de oferta y demanda,<br/>recomendación de precios,<br/>emparejamiento entre actores<br/>y reconocimiento de patrones<br/>en datos energéticos y transaccionales"]

    %% Efectos directos
    E1["Decisiones simuladas poco precisas<br/>en procesos de compra y venta de energía"]
    E2["Desajustes entre oferta energética disponible<br/>y demanda proyectada"]
    E3["Recomendaciones de precio poco coherentes<br/>con la dinámica de oferta, demanda<br/>y patrones históricos"]
    E4["Menor capacidad para interpretar tendencias,<br/>recurrencias y relaciones relevantes<br/>en los datos"]
    E5["Menor confianza en los resultados analíticos<br/>generados por la plataforma"]
    E6["Menor eficiencia en la simulación<br/>del intercambio de energía renovable distribuida"]

    %% Efecto superior
    ES["EFECTO SUPERIOR<br/><br/>Baja eficiencia analítica y transaccional<br/>en la simulación de procesos<br/>de intercambio energético<br/>dentro de plataformas digitales centralizadas"]

    %% Relaciones causas
    C1 --> CP
    C2 --> CP
    C3 --> CP
    C4 --> CP
    C5 --> CP
    C6 --> CP
    C7 --> CP

    %% Relación central
    CP --> P

    %% Relaciones efectos
    P --> E1
    P --> E2
    P --> E3
    P --> E4
    P --> E5
    P --> E6

    E1 --> ES
    E2 --> ES
    E3 --> ES
    E4 --> ES
    E5 --> ES
    E6 --> ES
```
<b><i><span style='font-size:12px;'> 
    Imagen 00.
    Árbol de problemas del proyecto EnerTrade AI
 </span></i></b>