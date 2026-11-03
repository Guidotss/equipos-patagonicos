# Gestión y actividad de gruistas

Fecha: 2 de noviembre de 2026. Modo: Operate. Extensión del sistema existente, con el mismo shell, tokens, Inter y componentes. No se reemplaza la identidad ni se repara deriva documental previa.

## Direction contract

THESIS: administración encuentra a cada gruista, crea su acceso y revisa los remitos que envió desde una ficha propia.

OWN-WORLD: continúa Equipos Patagónicos: logo existente, sidebar claro, canvas blanco, índigo para acciones, bordes fríos, marco de listado plano y hojas continuas de formulario. Controles táctiles de 44 px y campos de 16 px en móvil.

STORY: entrar a Gruistas, crear una cuenta con su grúa o abrir una persona existente, y consultar sus envíos. La asignación vigente y la grúa histórica de cada remito se distinguen por su contexto y etiquetas.

FIRST VIEWPORT: migas, título Gruistas con contador, bajada breve y Nuevo gruista. Dentro de un único marco: búsqueda, estado y filas con identidad, grúa, acceso, cantidad de remitos, último envío y Ver actividad. La ficha agrupa acceso y actividad; el alta usa Cuenta y Grúa sin tarjetas estadísticas.

FORM: extensión de los listados y hojas ya elegidos; la referencia 17 concreta el listado de escritorio. El formulario y la ficha conservan el vocabulario y las piezas actuales, sin un selector de rol administrativo. No se abre una exploración de identidad ni un sorteo de conceptos.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Referencia y procedencia

[17-crane-operator-management.png](referencias/17-crane-operator-management.png) se generó con OpenAI ImageGen integrado, usando como referencias visuales la captura local actual `.impeccable/review/inbox-desktop.png` y el formulario móvil versionado `verificaciones/2026-10-28-formularios/cliente-movil.png`. El prompt exacto está en [su archivo de texto](referencias/17-crane-operator-management.prompt.txt) y se incorpora también como metadatos del PNG.

Es una referencia de implementación, no una captura de la función terminada ni un recurso que se mostrará dentro de la aplicación. La fila de ejemplo no se inserta en la base. El listado real consulta las cuentas existentes, incluidas las que aún no enviaron remitos.

## Reglas de implementación

- Reutilizar HeaderPage, FrameListing, TableListing, PaginationListing y controles instalados. Columnas legibles y campos largos acotados visualmente con acceso al valor completo.
- En móvil, las filas se reorganizan con nombre, estado, grúa y Ver actividad; filtros y acción de alta permanecen localizables sin desbordes.
- Nuevo gruista usa una hoja Cuenta/Grúa. Nombre, email, contraseña y grúa activa; contraseña oculta y sin persistir en URL ni respuestas.
- La ficha muestra el equipo vigente separado de los remitos anteriores. Actividad ordenada por envío, con fecha del servicio y acceso a los adjuntos desde la revisión existente.
- El personal gestiona exclusivamente gruistas. El alta no ofrece roles administrativos y las tres cuentas operativas conservan sus accesos.
- Errores junto al control, foco al primer error, estado durante envío y conservación del formulario si falla. El acceso sin grúas activas explica cómo continuar.
- Inspección en lote móvil/escritorio, un único lote de correcciones y confirmación; luego revisión visual independiente y registro del dictamen. Las capturas locales no se versionan.

## Verificación visual y conservación del sistema

Artefacto revisado: `b7858ce`, en `src/app/(crane-management)/crane-operators` y `src/components/crane-operators/management`. La revisión visual independiente finalizó con dictamen **SHIP** y fidelidad **Faithful**: tipografía, material, fondo, shell, listado, formulario y actividad coinciden con la dirección acordada. Evaluó las doce capturas requeridas y confirmó la persistencia de las decisiones. No dejó correcciones materiales pendientes; se alcanzó el límite de revisión de Operate.

La inspección en lote detectó un recorte de la acción del listado en escritorio. El único lote de correcciones y su confirmación dejaron «Ver actividad» completo a 1024, 1200 y 1280 px; en móvil se confirmó el selector de grúa accesible por encima de la barra inferior. La ejecución única del detector tras el build final devolvió `[]` para la UI modificada y el sidebar; su salida local está en `/tmp/crane-management-detector.json`. No se abre otra ronda de pulido.

Se contrastaron `DESIGN.md` y `.impeccable/design.json` con `src/app/globals.css`, `src/app/layout.tsx`, `src/components/app-shell/{app-shell,header,sidebar-nav}.tsx`, `src/components/form/structure-form.tsx`, `src/components/listings/frame-listing.tsx`, las primitivas `button`, `input`, `native-select` y `pill`, y las páginas y componentes de la gestión de gruistas. La evidencia confirma la conservación del sistema existente:

- **Paleta:** índigo de acción `oklch(0.478 0.202 272.6)`, lienzo blanco, sidebar gris frío y bordes suaves; estados con texto y tono semántico. No se añade otra paleta.
- **Tipografía:** Inter; encabezados compactos de 28 px semibold, secciones de hoja de 16 px semibold, controles de escritorio de 14 px y campos móviles de 16 px. El título de actividad usa la jerarquía contextual de 20 px.
- **Continuidad de marca:** se mantiene la regla `The Brand Continuity Rule`, con logo, shell claro, navegación activa teñida de índigo e íconos de línea. La ficha operativa usa el encabezado compacto existente sin convertir su composición en una nueva regla global.
- **Hoja continua:** se mantienen `The Form Sheet Rule` y `The Flat Form Rule`. Cuenta y Grúa comparten un contorno y divisores; propósito y campos se apilan o forman columnas según el contenedor, sin sombras ni tarjetas por tarea.
- **Listado y controles:** filtros, filas y paginación comparten un marco plano. En móvil las filas se apilan, los controles conservan un mínimo de 44 px y el alta reserva espacio para las acciones fijas. La grúa actual queda separada de la grúa histórica, la fecha del servicio y el momento de envío de cada remito.

`DESIGN.md` y `.impeccable/design.json` permanecen sin cambios: esta extensión reutiliza sus tokens y componentes y no introduce una decisión visual durable que requiera ampliarlos. La ausencia previa de `PRODUCT.md` queda fuera de alcance y no se repara. No se incorpora ningún defecto como regla del sistema.

Las capturas son evidencia local ignorada por Git, tomada con ventanas de 1200 × 805 px en escritorio y 390 × 844 px en móvil; las exportaciones completas pueden superar esa altura. La captura inferior del alta móvil está desplazada intencionalmente:

- Listado: `.impeccable/review/crane-management-list-desktop.png` y `.impeccable/review/crane-management-list-mobile.png`.
- Alta: `.impeccable/review/crane-management-new-desktop.png` y `.impeccable/review/crane-management-new-mobile.png`; inicio y final móvil en `.impeccable/review/crane-management-new-mobile-first.png` y `.impeccable/review/crane-management-new-mobile-bottom.png`.
- Ficha con actividad: `.impeccable/review/crane-management-detail-desktop.png` y `.impeccable/review/crane-management-detail-mobile.png`.
- Listado vacío: `.impeccable/review/crane-management-list-empty-desktop.png` y `.impeccable/review/crane-management-list-empty-mobile.png`.
- Ficha sin envíos: `.impeccable/review/crane-management-detail-empty-desktop.png` y `.impeccable/review/crane-management-detail-empty-mobile.png`.

La referencia 17 aporta estructura para el listado; su prompt exacto y metadatos permanecen en `docs/diseno/referencias`. La verificación compara la extensión con esa dirección y con el sistema implementado; no existió una composición de píxeles aprobada que exigiera una diferencia de imágenes.

El primer relevo de documentación no devolvió resultado por límite de uso y fue reemplazado para completar este registro; la revisión visual independiente sí finalizó correctamente.
