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
