# Rol de gruista y recepción de remitos

Fecha: 2 de noviembre de 2026. Base: `19e8ef8`.

## Alcance acordado

El usuario pidió un rol nuevo en inglés para que cada gruista cargue remitos de los trabajos de su grúa. Eligió expresamente permitir también remitos sin presupuesto. El identificador es `crane_operator`; la etiqueta visible es «Gruista». Los nombres técnicos nuevos se escriben en inglés y los textos y comentarios en español. Los contratos existentes conservan sus claves.

## Decisión de diseño

Se elige un registro de recepción separado para las cargas de los gruistas. Admitir documentos comerciales sin cliente o presupuesto obligaría a debilitar restricciones del circuito actual; crear un cliente o presupuesto ficticio dejaría datos incorrectos. La recepción conserva sus archivos originales y, al vincularse, crea un remito comercial normal dentro del presupuesto elegido.

Una pantalla especial dentro del formulario administrativo expondría contexto financiero y demasiados controles. Se elige un portal sencillo para el gruista y una bandeja de recepción para administración, con validación de permisos también en SQL y Storage.

## Usuarios y grúas

- Se mantienen `admin` y el rol existente `operador`, que representan los accesos administrativos actuales.
- Un administrador asigna el rol, la activación y una grúa por usuario desde Configuración → Usuarios y grúas. Varios gruistas pueden compartir una grúa por turnos.
- La asignación puede cambiar. Cada carga conserva el autor y la grúa con la que fue recibida, sin trasladar su historial a la nueva grúa.
- Un gruista activo sin grúa activa puede consultar sus cargas anteriores; recibe una explicación y no puede iniciar nuevas cargas.
- No se crean usuarios reales ni datos comerciales ficticios durante la implementación. El script administrativo existente se amplía para dar de alta el nuevo rol y asignar su grúa.

## Circuito del gruista

1. Ingresa al portal `/operator`, con su grúa y sus remitos. No recibe pantallas ni datos financieros.
2. Elige «Cargar remito». Puede seleccionar un presupuesto aprobado y en curso de su grúa, o «Trabajo sin presupuesto».
3. Completa fecha del servicio, número opcional, descripción del trabajo y observaciones opcionales. Sin presupuesto informa el cliente o lugar como texto; ese texto no crea un cliente.
4. Adjunta uno o más PDF, JPG o PNG mediante cámara o selector, con compresión y reintento existentes; hasta 50 archivos de 10 MB cada uno.
5. El servidor determina autor y grúa desde la sesión y la asignación vigente. Los archivos deben provenir de sus propias autorizaciones de subida para esa misma grúa.
6. Con un presupuesto válido, se crea el remito comercial y su vínculo en la misma transacción. Sin presupuesto queda «Pendiente de vincular» en la bandeja administrativa.
7. El gruista consulta el estado y descarga sus archivos. No puede editar, anular, reasignar o eliminar una carga enviada.

La fecha y la descripción son obligatorias; el cliente/lugar es obligatorio cuando no se eligió un presupuesto. Las fechas de servicio históricas son válidas. No se incorporan importes, facturas, cobros, horarios de planificación ni funcionamiento sin conexión.

## Bandeja administrativa

- El sidebar incorpora «Remitos», en `/delivery-notes`, con pendientes y vinculados.
- La revisión muestra autor, grúa, fecha, cliente/lugar informado, descripción, notas y archivos.
- Administración puede vincular un pendiente a un presupuesto aprobado y no anulado, incluso si su cotización no tiene equipo o si ya está finalizado.
- La grúa efectiva del remito sigue siendo la registrada en la carga. No se modifica la cotización aprobada ni su PDF para habilitar trabajos históricos.
- Si falta el presupuesto, se conserva la recepción mientras administración lo crea por el circuito existente.
- Reintentar una vinculación no crea otro remito. Vincular la misma recepción a otro presupuesto después de haberla procesado devuelve un conflicto explícito.
- La vinculación crea `documentos.tipo = 'remito'`, `monto = null`, sus vínculos y archivos; usa la fecha informada y conserva autor y equipo. Los archivos conservan su ubicación, sin copias ni borrados físicos.

## Modelo y contratos nuevos

- `crane_operator_assignments`: asignación vigente por usuario, equipo, administrador y fecha.
- `crane_delivery_notes`: recepción, autor, equipo y nombre al recibirla, fecha, número, cliente informado, trabajo, notas, presupuesto solicitado opcional, estado `pending | linked` y remito comercial opcional. `linked_budget_id` conserva el destino original para que la idempotencia no dependa de cambios posteriores en los vínculos del documento comercial.
- `crane_delivery_note_uploads`: autorización de subida, propietario, equipo, ruta única, MIME, tamaño esperado y vencimiento de un día.
- `crane_delivery_note_files`: archivos de cada recepción, nombre original, MIME y tamaño comprobados en Storage, y orden. Cada autorización y ruta se consumen una sola vez.
- Ruta de archivos: `documentos/crane-operators/<user-id>/<upload-id>.<ext>`. Se conserva el bucket privado `documentos` y el CHECK de prefijo de los archivos comerciales. La vinculación especializada valida y consume esas rutas; el registrador genérico conserva su restricción de carpetas por cliente.
- El ID de recepción se genera una sola vez por formulario. Los reintentos de un envío idéntico devuelven el resultado existente; el mismo ID con otros datos se rechaza.

RPC públicas:

| RPC | Entrada | Salida |
| --- | --- | --- |
| `list_user_access` | — | usuarios: `user_id, name, email, role, active, equipment_id, equipment_name` |
| `set_user_access` | `p_user_id, p_role, p_active, p_equipment_id` | void |
| `get_crane_operator_context` | — | `{equipment: {id, name, active} | null, jobs: [{id, number, customerName, subject, location}]}` |
| `create_crane_delivery_note_upload` | `p_mime, p_size` | fila `{upload_id, path}` |
| `submit_crane_delivery_note` | `p_id, p_data, p_files` | UUID de recepción |
| `link_crane_delivery_note` | `p_note_id, p_budget_id` | UUID del remito comercial |

`p_data` contiene únicamente `budgetId`, `number`, `serviceDate`, `customerName`, `workDescription` y `notes`. `p_files` es una lista de `{path, originalName}`. El cliente no envía autor, grúa, estado, importes ni ID de documento comercial.

## Permisos

- `private.is_staff()` reconoce solo los roles administrativos activos existentes. Las políticas comerciales incorporan una restricción para impedir lecturas/escrituras del nuevo rol.
- El control central de las RPC comerciales exige personal administrativo; se revisan todas las funciones SECURITY DEFINER concedidas a `authenticated` para evitar accesos alternativos.
- El nuevo rol puede leer solo su perfil, su asignación, sus recepciones y archivos. Los trabajos se leen por una RPC con proyección explícita que no devuelve precios, datos fiscales, condiciones de pago ni PDF de cotización.
- La consulta de perfiles deja de mostrar al gruista los perfiles ajenos. Los accesos actuales de administración se conservan.
- Storage autoriza al gruista exclusivamente rutas registradas para él; la finalización comprueba nuevamente rol, actividad, asignación, equipo, propiedad, tamaño, MIME y vencimiento.
- La autorización de INSERT también rechaza el encabezado `x-upsert: true` para el gruista: una firma de subida conserva ese permiso al consumir el token, por lo que debe impedirse al emitirlo. La regresión usa Storage real y comprueba que los bytes enviados no pueden reemplazarse con esa firma.
- Un cambio de asignación invalida las subidas nuevas de la grúa anterior; no modifica ni expone cargas ajenas. Un usuario desactivado no conserva acceso por tener una sesión todavía válida.
- La vinculación y el envío se serializan para impedir documentos duplicados y operaciones concurrentes sobre presupuestos anulados. Las cotizaciones aprobadas siguen siendo inmutables.

## Verificación y publicación

Pruebas con usuarios de dos grúas, personal administrativo, usuarios sin equipo e inactivos: RLS real, llamadas RPC directas, subidas y descargas, intentos de manipular identificadores, acceso a facturas/cotizaciones, reintentos y carreras de vinculación. E2E de configuración, portal móvil, cámara/selector, carga con/sin presupuesto y vinculación administrativa.

Toda integración y navegador se ejecuta con `scripts/test-runner.mjs` en proyectos descartables; no se usa la base de desarrollo o producción para fixtures. Se conserva la cuenta y datos de prueba que el usuario pidió mantener. Antes de publicar: check, build, integración completa, navegador completo y revisión independiente de alcance y calidad. La migración se aplica a producción tras la validación; el despliegue se verifica por commit y `SUCCESS` y con comprobaciones públicas de salud.

Referencias técnicas: documentación instalada de Next.js 16.4.3 sobre autenticación y Server Actions; [RLS de Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security) y [autorizaciones de subida](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl).
