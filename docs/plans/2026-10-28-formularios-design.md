# Reemplazo de formularios

El usuario autoriza reemplazar por completo la composición anterior. La revisión previa se limitó a ajustar controles y no resolvió la estructura. Se conserva la marca y el shell; los formularios pasan a una hoja dividida por tareas, con encabezados compactos y acciones persistentes.

Se elige una hoja con secciones frente a dos alternativas: tarjetas independientes (mantienen la fragmentación rechazada) y asistentes por pasos (ocultan información que se consulta y edita en conjunto). En escritorio ancho cada sección presenta su propósito a la izquierda y los campos a la derecha. En móvil la misma jerarquía se apila. Se mantienen todos los campos, ayudas, errores y vistas en vivo existentes.

La referencia `docs/diseno/referencias/13-formularios-estructura.png` fija la composición: encabezado de 28 px, hoja plana con borde y radio de 12 px, secciones separadas por reglas, campos de 40 px en escritorio y 44 px en móvil, etiquetas de 14 px, columnas con 16–24 px de separación y una barra fija de acciones. Los controles falsos de la generación no se reproducen: condición de pago sigue siendo texto libre; la navegación activa depende de la ruta.

Alcance: altas y edición de clientes y contactos; Empresa, Equipos, Firmantes y Plantillas; formularios de cotizaciones y documentos. El editor comercial mantiene su estado, reordenamiento y vista previa, pero adopta la misma hoja para agrupar el contenido. No cambian contratos del servidor ni reglas comerciales.

La implementación conserva las acciones y validaciones existentes. El estado pendiente bloquea los controles y el envío duplicado; los errores enfocan el primer campo. Los botones de activar/desactivar permanecen fuera del formulario de edición para evitar formularios anidados.

La validación combina pruebas de guardado, validación y documentos; capturas conjuntas de escritorio y móvil y revisión independiente del resultado.
