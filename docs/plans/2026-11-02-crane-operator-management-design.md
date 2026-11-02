# Gestión de gruistas para administración

Fecha: 2 de noviembre de 2026. Base: `9da7b90`.

## Alcance y contexto confirmado

El usuario pidió que Thomas, Administración y J. Rojas puedan crear nuevos gruistas y consultar su actividad desde un módulo. Las tres cuentas existentes tienen rol `operador`; no se modifica su rol ni su contraseña. El usuario ya eligió un módulo propio. Se conserva el rol `crane_operator`, visible como Gruista, y la UI vigente.

La actividad de esta versión son los remitos enviados: fecha de envío y servicio, grúa efectiva, trabajo, adjuntos y estado de vinculación. Se consultó si hacen falta otros datos; en ausencia de una ampliación, se utiliza este alcance operativo. No se incorpora seguimiento de ubicación, asistencia ni horas trabajadas.

## Superficies y recorrido

- **Gruistas**, en `/crane-operators`, aparece en el sidebar del personal `admin | operador`. Listado paginado con nombre/email, grúa vigente, estado, cantidad de remitos y último envío. Búsqueda por nombre/email/grúa y filtro de acceso activo/inactivo.
- **Nuevo gruista**, en `/crane-operators/new`: nombre, email, contraseña y grúa activa. El rol es fijo y la cuenta queda habilitada al completar su configuración. No se envían invitaciones por correo ni se agregan selectores de roles administrativos.
- **Ficha**, en `/crane-operators/[id]`: identidad, estado, grúa vigente y actividad paginada. Se puede cambiar grúa y activar/desactivar el acceso. Cada remito conserva su grúa y autor originales; la ficha incluye el historial anterior a una reasignación. Los remitos abren la revisión existente de `/delivery-notes/[id]`.

La contraseña solo se utiliza para el alta y no se devuelve en consultas, URLs, mensajes de error ni registros. Tras crear la cuenta, se navega a su ficha. El formulario conserva los datos ante errores y evita doble envío; la unicidad del email evita cuentas duplicadas entre solicitudes concurrentes.

## Decisión de arquitectura

Se usa un módulo específico porque el usuario pidió administrar gruistas y su actividad. Extender la pantalla genérica de usuarios mezclaría esta tarea con roles administrativos; agregar solamente un filtro en Remitos dejaría fuera a las personas que todavía no enviaron ninguno. El módulo reutiliza la hoja de formularios y el marco de listados existentes.

El personal recibe permisos limitados a cuentas de gruistas. `list_user_access` y `set_user_access` siguen siendo exclusivos de `admin`. No se convierten las tres cuentas actuales en administradores.

### RPC nuevas

`list_crane_operators(p_search text default '', p_active boolean default null)` devuelve filas con `user_id, name, email, active, equipment_id, equipment_name, equipment_active, note_count, pending_note_count, last_submission_at`. Solo personal activo. El filtro se aplica antes del conteo/paginación de PostgREST; no se devuelven otras cuentas ni datos de autenticación.

`set_crane_operator_access(p_user_id uuid, p_active boolean, p_equipment_id uuid default null)` exige personal activo, bloquea el perfil objetivo y comprueba que su rol sea `crane_operator`. No acepta otro rol. Una cuenta activa necesita grúa activa; una cuenta inactiva puede quedar sin asignar. La asignación registra `auth.uid()` como autor.

`complete_crane_operator_signup(p_user_id uuid, p_name text, p_equipment_id uuid, p_actor_id uuid)` solo se concede a `service_role`. Valida y bloquea al actor, que debe seguir activo con rol administrativo, la grúa activa y el perfil recién creado e inactivo. En una transacción fija el rol `crane_operator`, el nombre, la activación y su asignación. Los IDs del actor y de la cuenta proceden del servidor, nunca del cuerpo del formulario.

### Alta desde el servidor

1. Una Server Action verifica sesión y rol con `requireStaff` y valida un objeto estricto `{name,email,password,equipmentId}`.
2. El cliente de sesión comprueba la grúa activa antes de solicitar el alta.
3. Un módulo `server-only` instancia un cliente independiente con `SUPABASE_SECRET_KEY`, sin sesión de navegador, para `auth.admin.createUser({email,password,email_confirm:true,user_metadata:{nombre:name}})`.
4. Se llama a la RPC de finalización con el ID recién devuelto y el actor autenticado. El perfil permanece inactivo hasta completar la transacción.
5. Si falla la finalización, se elimina únicamente la cuenta recién creada. Si también falla esa limpieza, se informa el ID pendiente sin exponer contraseña ni claves. Un email ya existente no se modifica ni elimina.

La clave privada se configura únicamente en Railway al publicar; actualmente no está presente en el servicio. Las lecturas, la actividad y los cambios normales de acceso usan el cliente de sesión y las RPC autorizadas. La excepción privilegiada queda limitada al alta de cuentas y su compensación.

## Seguridad y compatibilidad

- Gruistas e inactivos no acceden al módulo, sus acciones ni las nuevas RPC de personal.
- `operador` no recibe permisos para crear administradores, modificar cuentas de personal ni ejecutar directamente la finalización privilegiada.
- Se mantienen los contratos, roles existentes y la configuración genérica de usuarios. No hay cambios de importes, cotizaciones, facturas ni cobros.
- La actividad usa el autor de cada recepción, no la asignación actual. Se ordena por envío; el historial normal existente conserva su orden por servicio.
- Nuevos nombres técnicos en inglés; textos visibles y comentarios en español.

## Validación y publicación

Pruebas con JWT reales de personal y gruistas, acceso denegado a roles ajenos, modificación de otro tipo de perfil, actor desactivado durante el alta, grúa inválida y finalización/compensación. La creación se prueba en bases descartables y con clientes simulados que rechazan toda red inesperada.

E2E: un usuario `operador` crea un gruista, la cuenta inicia sesión y sube un remito, el personal ve su actividad, cambia asignación sin mover el historial y desactiva el acceso; otra cuenta de personal también ve el módulo. Se verifican móvil/escritorio, formularios, reintentos y limpieza de fixtures. En producción solo se hacen comprobaciones de lectura con las cuentas existentes y se conserva `gruistatest`.

Antes de publicar: revisión de alcance y calidad por etapa, build, check, integración/navegador completos, migración con dry-run, configuración de la credencial privada sin imprimirla, push a main y despliegue exacto `SUCCESS` con comprobaciones de salud.

Referencias: documentación instalada de Next.js 16.4.3 sobre DAL, Server Actions y Route Handlers; [Auth Admin createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser) y [claves de Supabase](https://supabase.com/docs/guides/getting-started/api-keys).
