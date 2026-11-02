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

## Verificación final

La revisión visual independiente del 2 de noviembre de 2026 emitió el dictamen **SHIP**, con fidelidad **Faithful** en `TYPE`, `MATERIAL`, `GROUND`, `THESIS`, `OWN-WORLD`, `STORY`, `FIRST VIEWPORT` y `FORM`. El límite de revisión quedó alcanzado (`Ceiling: Reached`) y no quedaron correcciones materiales (`Material fixes: None`). Este dictamen acredita el cierre visual de la extensión; las verificaciones funcionales, la compilación y el despliegue tienen su propio registro.

El resultado conserva la tarea comprometida: el gruista carga remitos de su grúa asignada, con presupuesto opcional, adjunta los comprobantes y consulta su estado. Administración recibe los pendientes en una pantalla de revisión y completa la vinculación cuando corresponde. La asignación de rol, acceso y grúa permanece en **Usuarios y grúas** para administradores. El uso y los permisos se describen en [la guía operativa](../crane-operators.md).

Se cotejaron `src/app/globals.css`, la carga de Inter en `src/app/layout.tsx`, los componentes compartidos `HeaderForm`, `SheetForm`, `SectionForm`, `Input` y `NativeSelect`, y las implementaciones de `OperatorShell`, `NoteForm`, `NoteList` y `UserAccessForm`. La paleta, los radios y las jerarquías continúan el sistema de [DESIGN.md](../../DESIGN.md) y [.impeccable/design.json](../../.impeccable/design.json): blanco y bordes fríos, índigo de acción, Inter, campos de 16 px y controles de al menos 44 px en móvil, hoja continua sin sombra y marco plano para listados. Ambos archivos de sistema se conservaron sin cambios.

### Evidencia comparada

La comparación usó [la referencia 16](referencias/16-crane-operator.png), [el formulario móvil existente](verificaciones/2026-10-28-formularios/cliente-movil.png) y [el listado de cotizaciones existente](verificaciones/2026-10-28-grillas/cotizaciones-escritorio.png). El formulario nuevo mantiene su orden de lectura y su barra inferior; la bandeja y Configuración mantienen el shell administrativo y los componentes existentes.

Las siguientes 16 capturas quedan localmente en `.impeccable/review/`, en la raíz del proyecto. Están ignoradas por Git y no se versionan. La revisión independiente abrió todas, junto con los alias locales `desktop.png` y `mobile.png` de esa carpeta. Los nombres de la tabla identifican esa evidencia local; las referencias enlazadas arriba sí están versionadas.

| Superficie | Escritorio | Móvil |
| --- | --- | --- |
| Cargar remito, página completa | `form-desktop.png` | `form-mobile.png` |
| Cargar remito, primer viewport | `form-desktop-first.png` | `form-mobile-first.png` |
| Mis remitos | `home-desktop.png` | `home-mobile.png` |
| Usuarios y grúas | `users-desktop.png` | `users-mobile.png` |
| Detalle del gruista | `operator-detail-desktop.png` | `operator-detail-mobile.png` |
| Bandeja administrativa | `inbox-desktop.png` | `inbox-mobile.png` |
| Revisión pendiente | `pending-detail-desktop.png` | `pending-detail-mobile.png` |
| Detalle vinculado para administración | `staff-detail-desktop.png` | `staff-detail-mobile.png` |

La revisión confirmó legibilidad, acceso a las tareas y ausencia de desbordes horizontales o áreas negras. La única tanda de corrección acotó los identificadores largos en el listado, conservando su texto completo en `title`, y ocultó el indicador de desarrollo de Next.js exclusivamente en E2E. La diferencia transitoria de ancho del pie entre una captura inicial y una completa corresponde a `transition-all` durante el cambio de viewport; no se registró como defecto de la composición final. El detector ejecutado sobre los objetivos de UI modificados devolvió `[]`.

### Procedencia y alcance del registro

El PNG de la referencia 16 conserva el prompt exacto en sus metadatos `impeccable:prompt`; su contenido coincide byte por byte con [16-crane-operator.prompt.txt](referencias/16-crane-operator.prompt.txt), salvo el salto de línea final del archivo de texto. Las imágenes de referencia y verificación son evidencia de trabajo. La aplicación reutiliza `public/logo-equipos-patagonicos.png` y no incorpora nuevos rásteres generados como recursos de interfaz.

La ausencia preexistente de `PRODUCT.md` queda registrada fuera del alcance de esta extensión. Se documenta el resultado construido y se conserva el sistema vigente, sin inventar contexto de producto ni promover excepciones de esta pantalla a reglas globales.

### Verificación del delta 70ff7d1

Una nueva revisión visual independiente emitió **SHIP** para el delta `70ff7d1`, sin observaciones pendientes. El alcance se limita al estado de presupuesto original no disponible y a sus dos capturas nuevas; las superficies sin cambios conservan el dictamen SHIP anterior. Este apéndice no constituye una nueva revisión visual global.

La revisión abrió las capturas locales `.impeccable/review/deleted-budget-desktop.png` (1200 × 1993 px) y `.impeccable/review/deleted-budget-mobile.png` (390 × 3734 px), ambas válidas y sin desbordes. Como el resto de `.impeccable/review/`, están ignoradas por Git y no se versionan. Después de los archivos, el aviso **«El presupuesto original ya no está disponible.»** reemplaza el enlace al presupuesto eliminado. Los números y textos extensos se ajustan al ancho disponible.

La edición documental conserva el estilo existente al admitir los límites de los remitos: 100 caracteres para el número y 6200 para las notas. La validación cuenta puntos de código Unicode y `maxLength` contempla su representación UTF-16 para permitir caracteres suplementarios. Los demás tipos de documento mantienen sus límites de 50 y 2000. Estos ajustes de comportamiento y el aviso reutilizan el sistema vigente; `DESIGN.md` y su sidecar permanecen sin cambios.
