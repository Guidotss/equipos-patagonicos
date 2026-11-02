# Crane Operator Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a las cuentas de Administración un módulo para crear gruistas, gestionar su acceso y consultar sus remitos.

**Architecture:** RPC de personal limitadas al rol `crane_operator`, alta Auth Admin desde una acción autorizada con compensación y una finalización SQL atómica. Listado y fichas reutilizan las recepciones y componentes existentes. Contratos completos en `docs/plans/2026-11-02-crane-operator-management-design.md`.

**Tech Stack:** Next.js 16.4.3, React 19.3, Supabase Auth/Postgres/RLS, Zod, componentes Radix existentes y runners descartables Vitest/Playwright.

---

## Task 1: Permisos de personal, directorio y finalización del alta

**Files:**
- Create: `supabase/migrations/20261102120000_crane_operator_management.sql`
- Create: `tests/integration/crane-operator-management.test.ts`
- Extend: `tests/integration/crane-operator-helpers.ts` solo para fixtures necesarios.
- Generate: `src/lib/supabase/database.types.ts` desde el stack descartable.

- [ ] Prueba roja con JWT: `operador` lista solo gruistas y puede cambiar su grúa/actividad; `crane_operator` no puede llamar las RPC nuevas. Comprobar que intentar modificar un perfil `admin` u `operador` falla y conserva el perfil.

```ts
const result = await staff.client.rpc('set_crane_operator_access', {
  p_user_id: worker.id, p_active: true, p_equipment_id: equipmentId,
})
expect(result.error).toBeNull()
const denied = await worker.client.rpc('complete_crane_operator_signup', {
  p_user_id: staff.id, p_name: 'Otro', p_equipment_id: equipmentId, p_actor_id: staff.id,
})
expect(denied.error?.code).toBe('42501')
```

- [ ] Implementar las tres RPC del diseño, sin ampliar las RPC genéricas de administrador. El directorio filtra búsqueda/estado, agrega conteos y último envío del autor, conserva equipo inactivo como contexto y admite paginación externa con conteo exacto. No incluir fechas/IP/tokens de Auth.
- [ ] La finalización se concede explícitamente solo a `service_role`; revocar `PUBLIC`, `anon` y `authenticated`. Revalidar al actor y bloquear filas antes de activar/asignar. Fijar siempre `crane_operator`, sin argumento de rol.
- [ ] Probar finalización correcta y rechazo de actor inactivo/rol gruista, destino ya activo, grúa inactiva y objetivo de otro rol. Comprobar que los errores revierten perfil y asignación. Verificar historial y conteos después de reasignar/desactivar.
- [ ] Generar tipos usando el controlador temporal de `runTests('int', ...)` con `supabase gen types typescript --local --workdir <temp>` antes de Vitest. No reset/push sobre desarrollo o producción.
- [ ] Ejecutar dirigida y typecheck, revisar, commit `feat: add scoped staff management for crane operators`; revisión de especificación y luego calidad.

## Task 2: Contratos, consultas y alta segura desde el servidor

**Files:**
- Create: `src/lib/supabase/privileged.ts` (`server-only`, creación perezosa).
- Create: `src/lib/crane-operators/management-schemas.ts` y pruebas.
- Create: `src/lib/crane-operators/management-queries.ts` y pruebas relevantes.
- Create: `src/lib/crane-operators/provisioning.ts` y pruebas con fetch simulado.
- Extend: consultas/contratos de actividad solo si hace falta un orden explícito por envío.

- [ ] Esquemas estrictos: alta `{name,email,password,equipmentId}`, acceso `{userId,active,equipmentId}`, filtros `{q,active,page}`. Nombre no vacío y hasta 120; email válido; contraseña sin trim de 6 a 72 caracteres; UUID de equipo. Rechazar `role`, `actorId`, `userId` en alta y claves extra. Nunca devolver contraseña en DTO ni logs.
- [ ] Consultas tipadas `listCraneOperators(client,filters)`, `getManagedCraneOperator(client,id)` y servicio `setCraneOperatorAccess(client,input)`. Normalizar páginas fuera de rango conservando filtros y total 0.
- [ ] Implementar el alta para llamarse después de `requireStaff` y validación en la acción; comprobar la grúa con cliente de sesión antes de instanciar privilegios. Crear Auth con email confirmado y finalizar con el actor real. En fallo borrar solo el nuevo ID; error de duplicado no toca la cuenta existente. Fallo de limpieza informa ID y explicación segura.

```ts
type NewCraneOperator = { name: string; email: string; password: string; equipmentId: string }
type NewCraneOperatorResult = { userId: string; email: string }
// El cuerpo HTTP no puede elegir el actor ni el rol; la acción obtiene el actor de requireStaff().
```

- [ ] Pruebas con dependencias explícitas y SDK real/fetch simulado: payload exacto, preflight sin alta, confirmación/finalización, duplicado sin borrado, fallo de finalización con compensación, fallo de limpieza con ID sin secretos, clave faltante y actor real separado del cuerpo. No red real en unitarios.
- [ ] Agregar orden de actividad por `created_at` sin cambiar el orden histórico por servicio de las pantallas existentes; probarlo cuando se amplíe un helper compartido.
- [ ] Ejecutar unitarios dirigidos, lint y typecheck; commit `feat: provision crane operators from authorized staff`; revisión de especificación y después calidad.

## Task 3: Módulo Gruistas, alta y actividad

**Files:**
- Create: `src/app/(app)/crane-operators/{page,actions}.tsx|ts`, `new/page.tsx`, `[id]/page.tsx`.
- Create: componentes pequeños y hook en `src/components/crane-operators/management/`.
- Modify: `src/components/app-shell/nav-items.ts`.
- Create: `tests/e2e/crane-operator-management.spec.ts` y fixture aislado si se necesita.
- Create: brief visual en `docs/diseno/2026-11-02-crane-operator-management.md` y referencia 17.

- [ ] Antes del código UI, generar referencia con ImageGen a partir del listado/formularios existentes y documentar su dirección/procedencia. Conservar DESIGN.md, tokens, Inter, logo y componentes instalados.
- [ ] Sidebar «Gruistas» para personal; layout, páginas, acciones y consultas usan `requireStaff`. Un gruista que intenta entrar recibe su portal y no puede ejecutar el alta ni modificar acceso.
- [ ] Listado paginado y responsive con búsqueda, estado, grúa, remitos y último envío; CTA «Nuevo gruista» y fila «Ver actividad». Fichas de otros roles/IDs inválidos devuelven 404.
- [ ] Formulario continuo Cuenta/Grúa con nombre, email, contraseña oculta y selector de grúa activa; botón «Crear gruista». Estado controlado, doble envío protegido, errores asociados y foco, contraseña fuera de URL/log/resultado. Guardar navega a la ficha. Grúa inactiva/ausente y email duplicado muestran recuperación clara.
- [ ] Ficha con estado/grúa actual y formulario específico de acceso, sin selector de rol. Actividad por envío con fecha de servicio, grúa histórica, trabajo y estado; abre la revisión y archivos existentes. Cambiar grúa o desactivar no mueve ni elimina remitos.
- [ ] E2E: staff `operador` crea cuenta, inicia sesión como gruista y envía remito, personal ve actividad, reasigna y desactiva, historial se conserva y acceso se bloquea. Segundo staff ve la ficha. Rechazar replay de acciones desde gruista e intentos de apuntar a cuentas de personal.
- [ ] Capturas de listado, alta y ficha en móvil/escritorio, inspección en lote y como máximo una confirmación. Reviewers independientes de spec/calidad y finish visual; documentar sistema preservado. No fixtures en bases compartidas.
- [ ] Commit `feat: add staff crane operator management module` después de pruebas dirigidas y revisión propia.

## Task 4: Validación y producción

- [ ] Check, compilación, integración completa y navegador completo; CLI/runner nativos si se afectan sus contratos. Revisión independiente final de permisos, alta y actividad; resolver hallazgos.
- [ ] Comprobar limpieza de todos los stacks, volúmenes, redes, directorios y locks descartables. Conservar la cuenta `gruistatest` pedida expresamente por el usuario.
- [ ] Actualizar guía operativa y registrar pruebas; no versionar capturas locales ni credenciales.
- [ ] Configurar `SUPABASE_SECRET_KEY` únicamente en el servicio Railway existente, sin imprimir valor y sin redeploy previo al push (`skipDeploys: true`). Verificar presencia por nombre. No cambiar otros valores.
- [ ] Dry-run y aplicación de la migración de producción sin seeds ni usuarios de prueba; los cuatro perfiles y asignaciones existentes se conservan. Integrar/pushear main sin force, observar SUCCESS del commit publicado y comprobar salud/login y lectura del módulo con las tres cuentas reales. Cerrar las sesiones de verificación; no crear más datos de prueba en producción.
