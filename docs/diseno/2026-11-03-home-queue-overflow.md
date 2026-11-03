# Identificadores largos en las colas de Inicio

Modo: Operate. Corrección puntual descubierta al ejecutar la suite existente en Linux junto a los nuevos recorridos. Se conserva el sistema de DESIGN.md y su sidecar.

## Dirección y alcance

Un remito con un número válido de 100 caracteres debe caber en las colas de Inicio en móvil sin ensanchar las tarjetas ni desplazar sus acciones. Se conserva el dato completo en persistencia y enlaces, y su acceso completo si la presentación se limita visualmente. No se cambia la estructura, el contenido funcional, la paleta, la tipografía ni la composición de Inicio.

El ajuste se limita al mínimo intrínseco y al tratamiento del identificador en QueueHome o su grid inmediato. No se admite ocultar el overflow de toda la página ni reducir los datos de prueba para evitar el caso.

## Evidencia inicial

La ejecución GitHub `41656762953` terminó con 88 pruebas correctas y un fallo de ancho en `home.spec.ts:108`. Su captura completa móvil midió 1148 px de ancho frente a una ventana de 390 px. Un número de remito sin separadores ensanchó las filas y el grid de las colas; el encabezado global permaneció en 390 px. La reproducción permanente tendrá un dato largo propio para no depender de otra prueba concurrente.

La verificación incluirá capturas locales móvil/escritorio y revisión acotada, conservando los archivos globales del sistema visual. No hay recursos gráficos nuevos.
