# Listados y grilla de ítems

El usuario pide revisar todas las grillas, empezando por Cotizaciones. La marca y los formularios recién aprobados se mantienen. Se reemplaza la presentación de Cotizaciones, Presupuestos, Clientes e Ítems, conservando reglas comerciales y búsquedas en URL.

## Decisiones

La referencia 14 define un registro operativo con buscador y filtros integrados, tabla de columnas acotadas y pie de resultados estable. Se elige agrupar metadatos frente a conservar todas las columnas estrechas o convertir todo el escritorio en tarjetas: facilita comparar filas y leer nombres completos. La tabla desplaza sus resultados con el encabezado visible; los controles de filtrado y paginación quedan fuera de ese desplazamiento. En móvil cada registro mantiene la misma prioridad como una fila apilada.

Cotizaciones presenta número/fecha/formato, cliente/trabajo, estado, vencimiento y acciones PDF/menú. Duplicar sigue disponible desde el menú. No muestra montos. Presupuestos usa número/fecha, cliente/trabajo, estado, documentos identificados y saldo de facturas; los conteos no se comunican con una cadena de barras sin etiquetas. Clientes conserva razón social, CUIT, localidad y estado, con apertura de fila y paginación de los resultados disponibles. La búsqueda actual devuelve hasta 200 clientes: se comunica ese límite cuando se alcanza, sin fingir un total ilimitado.

La referencia 15 define la grilla editable: bordes visibles, encabezados precisos, importe calculado diferenciado del precio y etiquetas en cada campo móvil. La vista previa lateral se reserva a ventanas de al menos 90rem para dar a los ítems espacio de trabajo a 1200px. A menor ancho sigue accesible en un panel. Se conservan Enter, teclado, reordenamiento, borradores de sección, formatos numéricos y validación por clave.

## Estados y alcance

Los filtros activos se pueden reconocer y quitar en escritorio y móvil. Los listados muestran rangos reales, vacío recuperable, foco visible y estado de actualización. Una fila abre su registro al hacer clic en el espacio disponible; enlaces y botones interiores mantienen sus acciones y el teclado usa enlaces reales.

Se mantienen consultas, permisos, importación, transición de estado, cotizaciones aprobadas, pagos y documentos. No se agregan selección masiva, exportación ni ordenamientos aparentes sin función.

## Validación

Capturas de 1200, 1024 y 390px con textos largos y estados variados; pruebas de navegación de fila y acciones, búsqueda y paginación; pruebas existentes de edición, precios, reordenamiento y PDF. Inspección conjunta y una confirmación, con revisión independiente al finalizar.
