# Extensión de UI para gruistas y recepción de remitos

Fecha: 2 de noviembre de 2026. Modo: Operate. Se conserva el sistema existente de Equipos Patagónicos documentado en DESIGN.md, las hojas de formulario y los listados de las referencias 13 y 14.

La referencia `referencias/16-crane-operator.png` fue generada con la herramienta integrada OpenAI ImageGen a partir de las capturas existentes `verificaciones/2026-10-28-formularios/cliente-movil.png` y `verificaciones/2026-10-28-grillas/cotizaciones-escritorio.png`. Es una referencia de implementación; no se muestra como imagen dentro de la aplicación. Los nombres y la fecha del ejemplo son ilustrativos y nunca se insertan en la base.

## Direction contract

THESIS: una carga de campo con grúa ya determinada, presupuesto opcional y comprobante visible. La pantalla pide solamente datos que el gruista conoce.

OWN-WORLD: continúa el logo, Inter, índigo de acción, blanco, bordes fríos y estados con texto del producto actual. Controles de 44 px y texto de 16 px en móvil. Administración conserva su sidebar y marco de listados.

STORY: el gruista reconoce su equipo, informa el trabajo y envía los adjuntos. El estado posterior indica si quedó vinculado o si administración debe completar el vínculo. Los errores conservan datos y archivos.

FIRST VIEWPORT: barra de marca compacta, volver a Mis remitos, título Cargar remito, equipo como contexto de solo lectura y hoja con datos del trabajo. Archivos con cámara/selector y acciones inferiores persistentes; observaciones al final del formulario. En escritorio se limita el ancho y se usa la misma hoja por tareas; no se agrega una columna de contenido ornamental.

FORM: extensión precisa de la hoja de formularios ya elegida. No se abre una exploración de identidad ni un sorteo de conceptos. La referencia 16 concreta el formulario móvil; la bandeja usa el marco de listados existente y Configuración usa controles existentes.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Reglas de implementación

- Preservar la jerarquía de la referencia y sus etiquetas; no copiar un nombre de grúa ni una fecha ilustrativa a datos reales.
- El nombre de la grúa es contexto, no una opción editable por el gruista.
- Presupuesto es una selección opcional de trabajos permitidos. Trabajo sin presupuesto requiere cliente/lugar y descripción; nunca crea un cliente.
- Subir archivos es funcional: cámara/selector, múltiples páginas, compresión, progreso, errores y reintento. Reutilizar el uploader existente mediante un preparador inyectable.
- Botón Enviar remito deshabilitado durante subidas/envío y cuando falta asignación; los errores se muestran junto al campo y reciben foco.
- Sin grúa activa: mostrar el motivo y cómo pedir la asignación, conservando el acceso al historial propio.
- Portal con navegación de remitos y salida de sesión, sin búsqueda global ni accesos financieros.
- Bandeja administrativa: Pendientes/Vinculados, filas de fecha, grúa, autor y trabajo. Revisar abre una pantalla; no un modal. Al vincular, seleccionar presupuesto con contexto cliente/trabajo, sin buscador duplicado.
- Configuración Usuarios y grúas: edición de rol, activo y equipo por persona, reservada al administrador. No pedir claves privadas ni contraseñas en esa pantalla.

## Prompt de generación

Use case: ui-mockup. Referencia de formulario móvil para el rol Gruista de Equipos Patagónicos, preservando la UI de las dos capturas existentes. Captura plana vertical sin marco de teléfono: header con logo y usuario, volver a Mis remitos, Cargar remito, contexto Grúa asignada, hoja Trabajo con Presupuesto (opcional), opción Trabajo sin presupuesto y ayuda Administración lo vinculará después; fecha de servicio, número opcional, cliente/lugar, descripción; sección Archivos con Tomar foto y Seleccionar archivos, formatos PDF/JPG/PNG y límite de 10 MB; barra fija Cancelar/Enviar remito. Textos en español argentino. Inter, blanco, índigo y bordes fríos, controles táctiles. Sin nueva identidad, métricas, ilustraciones, archivos simulados ni números de pasos.
