# Crane Operator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir a gruistas cargar remitos de su grúa con o sin presupuesto, con vinculación administrativa posterior y aislamiento de datos.

**Architecture:** Registro de recepción independiente, permisos por sesión y asignación de grúa, RPC transaccionales y archivos privados. El portal del gruista consume proyecciones operativas; el circuito comercial existente solo recibe remitos cuando hay un presupuesto real. Referencia completa de contratos y reglas: `docs/plans/2026-11-02-crane-operator-design.md`.

**Tech Stack:** Next.js 16.4.3, React 19.3, Supabase/Postgres/RLS/Storage, Zod, shadcn/Radix, Vitest y Playwright con bases descartables.

---

## Task 1: Modelo, permisos y recepción transaccional

**Files:**
- Create: `supabase/migrations/20261102090000_crane_operator_access.sql`
- Create: `supabase/migrations/20261102100000_crane_delivery_notes.sql`
- Create: `tests/integration/crane-operators.test.ts`
- Create: `tests/integration/crane-delivery-notes.test.ts`
- Create: `tests/integration/crane-operator-helpers.ts`
- Modify: `tests/integration/helpers.ts` (tipo de rol compatible)
- Generate: `src/lib/supabase/database.types.ts` únicamente desde el proyecto temporal.

- [x] Agregar pruebas de rechazo y permiso usando JWT reales. La preparación utiliza `crearUser` importado como `createTestUser`, SQL y archivos con una marca única; afterAll borra únicamente lo propio. Ejemplo de comprobación del límite:

```ts
const user = await createTestUser({ activo: true, rol: 'crane_operator' })
const { data, error } = await user.client.from('cotizaciones').select('*')
expect(error).toBeNull()
expect(data).toEqual([])
const write = await user.client.rpc('presupuesto_directo', {
  p_datos: { cliente_id: customerId, asunto: 'Fuera de alcance' }, p_items: [],
})
expect(write.error?.code).toBe('42501')
```

- [x] Ejecutar `npm run test:int -- tests/integration/crane-operators.test.ts tests/integration/crane-delivery-notes.test.ts`: deben fallar por ausencia de tablas/RPC.
- [x] Implementar el rol, asignaciones, guardas y políticas restrictivas con las claves antiguas intactas. Conservar el mensaje de usuario inactivo y exigir además `private.is_staff()` en `private.exigir_usuario_activo()`. Conceder a authenticated solo SELECT de las tablas nuevas y EXECUTE de las RPC públicas del diseño; escrituras por funciones comprobadas. Los helpers privados no se exponen.
- [x] Implementar las cuatro tablas, tickets, contexto operativo, envío y vinculación según el diseño. La fecha y el equipo se preservan y no se inventan relaciones comerciales. Ejemplo mínimo de forma de almacenamiento:

```sql
create table public.crane_operator_assignments (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  equipment_id uuid not null references public.equipos(id),
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now()
);
```

- [x] Verificar: otras grúas, perfil propio/ajeno, consultas de importes, todas las RPC comerciales concedidas, Storage ajeno, falta de asignación, equipo inactivo, desactivación/reasignación entre autorización y envío, MIME/tamaño/ruta adulterados, fechas inválidas, más de 50 archivos, consumo repetido y reintento idéntico. Probar carga sin presupuesto y autovinculación con uno permitido, vinculación administrativa a uno sin equipo, presupuesto anulado, y vinculación concurrente sin duplicar documentos.
- [x] Generar tipos mediante un controlador temporal de `runTests('int', ...)`: inyectar un wrapper de `runProcess` que, antes de lanzar Vitest y con el stack temporal activo, ejecute `supabase gen types typescript --local --workdir <temp>`. Guardar stdout de tipos en el archivo generado. No ejecutar db reset/push sobre desarrollo o producción.
- [x] Correr las pruebas dirigidas y `npm run typecheck`. Commit `feat: add scoped crane operator delivery note intake`.
- [x] Revisión de especificación y después de calidad; resolver y volver a revisar cualquier hallazgo material.

## Task 2: Acceso del servidor, contratos tipados y alta administrativa

**Files:**
- Create: `src/lib/auth/roles.ts`, `src/lib/auth/roles.test.ts`
- Modify: `src/lib/auth.ts`
- Create: `src/lib/crane-operators/{schemas,queries,service}.ts`
- Create: `src/lib/crane-operators/schemas.test.ts`
- Modify: `scripts/create-user.mjs`
- Create: `scripts/create-user.test.mjs`

- [x] Definir Role como `admin | operador | crane_operator`, `isStaffRole`, `homeForRole`, `requireStaff`, `requireAdmin` y `requireCraneOperator`. Leer rol y actividad de profiles, sin confiar en user_metadata.
- [x] Escribir esquemas Zod estrictos con los nombres ingleses del diseño. Los archivos del uploader existente se adaptan de `nombre_original` a `originalName`; no se aceptan campos de autor, grúa, importe o estado.
- [x] Implementar funciones de consultas/RPC tipadas: contexto del gruista, listado propio de recepciones y archivos, bandeja de staff, detalles, usuarios/asignaciones, autorización de subida, envío y vinculación. Ningún servidor público usa una secret key.
- [x] Ampliar el script con flags canónicos `--name`, `--role`, `--equipment-id`, manteniendo `--nombre` y `--rol` como alias. Validar rol/equipo antes de crear una cuenta; comprobar que la grúa existe y está activa. Si falla activar/asignar, eliminar el Auth user recién creado y su perfil/asignación; si la limpieza falla, informar explícitamente el ID pendiente sin imprimir contraseñas ni claves.
- [x] Probar campos obligatorios, fechas/formatos, límites, payload financiero rechazado y destino por rol con `npm run test`. Probar CLI mediante fetch simulado que rechaza toda red no esperada: `node --test scripts/create-user.test.mjs`.
- [x] Commit `feat: add crane operator access and typed services`; revisión de especificación y de calidad.

## Task 3: Portal, recepción administrativa y asignaciones

**Files:**
- Create: `src/app/(operator)/operator/{layout,page,actions}.tsx|ts`, `new/page.tsx`, `notes/[id]/page.tsx`, `files/[id]/route.ts`
- Create: `src/app/(app)/delivery-notes/{page,actions}.tsx|ts`, `[id]/page.tsx`
- Create: `src/app/(app)/configuracion/users/{page,actions}.tsx|ts`
- Create: componentes pequeños en `src/components/crane-operators/` para shell, formulario, hook, listado, archivos, vinculación y acceso de usuarios.
- Modify: `src/app/(app)/layout.tsx`, `src/components/app-shell/nav-items.ts`, `src/app/(app)/configuracion/page.tsx`
- Modify: acciones y rutas protegidas existentes para exigir staff, incluyendo vista previa, PDF y descarga de archivos.
- Modify: `src/components/documents/upload-files.tsx` para inyectar opcionalmente el preparador de subida, manteniendo por defecto el comportamiento actual.
- Create: `tests/e2e/crane-operators.spec.ts`

- [x] Antes del código de UI, generar una referencia que continúe los tokens, marca y estructura de las capturas existentes; documentar un breve criterio visual y usar componentes Radix ya instalados.
- [x] Portal móvil: encabezado con identidad y grúa, acción «Cargar remito», lista propia con estado. Sin grúa activa, explicación y carga deshabilitada. Formulario con presupuesto opcional, fecha, número, cliente/lugar y trabajo, observaciones, uploader y estado de envío. Tras guardar, navegar al detalle propio; los errores conservan el formulario y adjuntos. El ID de envío permanece estable durante los reintentos.
- [x] Implementar archivos autenticados y detalle de estado. No ofrecer edición, anulación, eliminación, facturas ni importes al gruista.
- [x] Configuración administrativa para cambiar rol, activo y equipo por persona con guardas de servidor y SQL. Mantener la protección del último administrador/self-demotion existente.
- [x] Bandeja con pendientes/vinculados y detalle con archivos y selector de presupuesto no anulado. Evitar buscador separado «Buscar presupuesto». Confirmar vinculación mediante RPC; mostrar documento existente si la llamada ya se había completado.
- [x] Usar requireStaff en el layout comercial y en acciones/endpoints, y requireCraneOperator en portal/archivos. Usuarios autenticados que entren al área equivocada reciben el destino de su rol; los datos se protegen además por las políticas y RPC.
- [x] E2E: admin asigna grúa, operador móvil sube PDF/foto sin presupuesto, vuelve a ver su carga, otro gruista no puede abrirla, no accede a cotizaciones/finanzas, staff la vincula a un presupuesto real y el documento conserva los archivos, autor y equipo. Agregar caso con presupuesto, sin grúa, desactivado y cambio de asignación.
- [x] Capturas de móvil y escritorio juntas: comparar una vez con la referencia, corregir en un lote, confirmar una vez. Commit `feat: add crane operator portal and delivery note review`; revisión de especificación y después de calidad.

## Task 4: Cierre y publicación

- [x] Resolver los dos hallazgos de la revisión final: compatibilidad de número/notas del remito con el editor comercial sin recortar metadatos, y referencias UUID históricas que no bloqueen anular → revertir → borrar una cotización. Cubrir límites Unicode, edición real y ausencia del presupuesto original con pruebas aisladas. Revisión del arreglo por el mismo revisor.

- [x] Ejecutar `npm run check`, `node --test scripts/create-user.test.mjs`, `npm run test:runner`, `npm run build`, integración completa y navegador completo con los runners descartables. Corregir fallos por su causa y conservar aserciones.
- [x] Revisar de forma independiente el conjunto de permisos, flujo y calidad. Verificar que no quedaron contenedores, volúmenes, redes ni carpetas de los proyectos temporales y que main no recibió archivos de prueba ni secretos.
- [x] Documentar el uso del nuevo rol y las migraciones. No crear cuentas ni equipos ficticios en producción.
- [x] Aplicar las tres migraciones a producción después de dry-run, sin semillas ni cuentas de prueba. Verificar que los recuentos comerciales se conservan y las cuatro tablas nuevas están vacías.
- [ ] Integrar la rama en main sin force push y publicar por el pipeline existente. Leer el estado SUCCESS del despliegue de ese commit y comprobar /api/health y /login.

## Evidencia del cierre

Código validado: `70ff7d1`. `npm run check` aprobado: lint, tipos, 553 unitarias y 20 pruebas de importación histórica. Integración completa: 390; navegador completo: 83. CLI de usuarios: 14 y runner: 12, con entornos simulados. Compilación de producción aprobada. Todos los proyectos descartables quedaron sin contenedores, volúmenes, redes, directorios ni lock.

La revisión final de código cerró los dos hallazgos y el cierre visual emitió SHIP; el nuevo estado de presupuesto eliminado recibió un dictamen separado para ese delta. Las migraciones `20261102090000`, `20261102100000` y `20261102110000` se aplicaron al proyecto de producción existente el 2 de noviembre de 2026. No se crearon cuentas, grúas ni datos comerciales de prueba.
