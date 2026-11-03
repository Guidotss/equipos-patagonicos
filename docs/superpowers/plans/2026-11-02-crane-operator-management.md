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

- [x] Prueba roja con JWT: `operador` lista solo gruistas y puede cambiar su grúa/actividad; `crane_operator` no puede llamar las RPC nuevas. Comprobar que intentar modificar un perfil `admin` u `operador` falla y conserva el perfil.

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

- [x] Implementar las tres RPC del diseño, sin ampliar las RPC genéricas de administrador. El directorio filtra búsqueda/estado, agrega conteos y último envío del autor, conserva equipo inactivo como contexto y admite paginación externa con conteo exacto. No incluir fechas/IP/tokens de Auth.
- [x] La finalización se concede explícitamente solo a `service_role`; revocar `PUBLIC`, `anon` y `authenticated`. Revalidar al actor y bloquear filas antes de activar/asignar. Fijar siempre `crane_operator`, sin argumento de rol.
- [x] Probar finalización correcta y rechazo de actor inactivo/rol gruista, destino ya activo, grúa inactiva y objetivo de otro rol. Comprobar que los errores revierten perfil y asignación. Verificar historial y conteos después de reasignar/desactivar.
- [x] Generar tipos usando el controlador temporal de `runTests('int', ...)` con `supabase gen types typescript --local --workdir <temp>` antes de Vitest. No reset/push sobre desarrollo o producción.
- [x] Ejecutar dirigida y typecheck, revisar, commit `feat: add scoped staff management for crane operators`; revisión de especificación y luego calidad.

## Task 2: Contratos, consultas y alta segura desde el servidor

**Files:**
- Create: `src/lib/supabase/privileged.ts` (`server-only`, creación perezosa).
- Create: `src/lib/crane-operators/management-schemas.ts` y pruebas.
- Create: `src/lib/crane-operators/management-queries.ts` y pruebas relevantes.
- Create: `src/lib/crane-operators/provisioning.ts` y pruebas con fetch simulado.
- Extend: consultas/contratos de actividad solo si hace falta un orden explícito por envío.

- [x] Esquemas estrictos: alta `{name,email,password,equipmentId}`, acceso `{userId,active,equipmentId}`, filtros `{q,active,page}`. Nombre no vacío y hasta 120; email válido; contraseña sin trim de al menos 6 caracteres y hasta 72 bytes UTF-8 (límite de Auth); UUID de equipo. Rechazar `role`, `actorId`, `userId` en alta y claves extra. Nunca devolver contraseña en DTO ni logs.
- [x] Consultas tipadas `listCraneOperators(client,filters)`, `getManagedCraneOperator(client,id)` y servicio `setCraneOperatorAccess(client,input)`. Normalizar páginas fuera de rango conservando filtros y total 0.
- [x] Implementar el alta para llamarse después de `requireStaff` y validación en la acción; comprobar la grúa con cliente de sesión antes de instanciar privilegios. Crear Auth con email confirmado y finalizar con el actor real. En fallo borrar solo el nuevo ID; error de duplicado no toca la cuenta existente. Fallo de limpieza informa ID y explicación segura.

```ts
type NewCraneOperator = { name: string; email: string; password: string; equipmentId: string }
type NewCraneOperatorResult = { userId: string; email: string }
// El cuerpo HTTP no puede elegir el actor ni el rol; la acción obtiene el actor de requireStaff().
```

- [x] Pruebas con dependencias explícitas y SDK real/fetch simulado: payload exacto, preflight sin alta, confirmación/finalización, duplicado sin borrado, fallo de finalización con compensación, fallo de limpieza con ID sin secretos, clave faltante y actor real separado del cuerpo. No red real en unitarios.
- [x] Agregar orden de actividad por `created_at` sin cambiar el orden histórico por servicio de las pantallas existentes; probarlo cuando se amplíe un helper compartido.
- [x] Ejecutar unitarios dirigidos, lint y typecheck; commit `feat: provision crane operators from authorized staff`; revisión de especificación y después calidad.

## Task 3: Módulo Gruistas, alta y actividad

**Files:**
- Create: `src/app/(crane-management)/crane-operators/{page,actions}.tsx|ts`, `new/page.tsx`, `[id]/page.tsx`, y layout de personal del grupo.
- Create: componentes pequeños y hook en `src/components/crane-operators/management/`.
- Modify: `src/components/app-shell/nav-items.ts`.
- Create: `tests/e2e/crane-operator-management.spec.ts` y fixture aislado si se necesita.
- Create: brief visual en `docs/diseno/2026-11-02-crane-operator-management.md` y referencia 17.

- [x] Antes del código UI, generar referencia con ImageGen a partir del listado/formularios existentes y documentar su dirección/procedencia. Conservar DESIGN.md, tokens, Inter, logo y componentes instalados.
- [x] Sidebar «Gruistas» para personal; layout, páginas, acciones y consultas usan `requireStaff`. Un gruista que intenta entrar recibe su portal y no puede ejecutar el alta ni modificar acceso.
- [x] Listado paginado y responsive con búsqueda, estado, grúa, remitos y último envío; CTA «Nuevo gruista» y fila «Ver actividad». Fichas de otros roles/IDs inválidos devuelven 404.
- [x] Formulario continuo Cuenta/Grúa con nombre, email, contraseña oculta y selector de grúa activa; botón «Crear gruista». Estado controlado, doble envío protegido, errores asociados y foco, contraseña fuera de URL/log/resultado. Guardar navega a la ficha. Grúa inactiva/ausente y email duplicado muestran recuperación clara.
- [x] Ficha con estado/grúa actual y formulario específico de acceso, sin selector de rol. Actividad por envío con fecha de servicio, grúa histórica, trabajo y estado; abre la revisión y archivos existentes. Cambiar grúa o desactivar no mueve ni elimina remitos.
- [x] E2E: staff `operador` crea cuenta, inicia sesión como gruista y envía remito, personal ve actividad, reasigna y desactiva, historial se conserva y acceso se bloquea. Segundo staff ve la ficha. Rechazar replay de acciones desde gruista e intentos de apuntar a cuentas de personal.
- [x] Capturas de listado, alta y ficha en móvil/escritorio, inspección en lote y como máximo una confirmación. Reviewers independientes de spec/calidad y finish visual; documentar sistema preservado. No fixtures en bases compartidas.
- [x] Commit `feat: add staff crane operator management module` después de pruebas dirigidas y revisión propia.

**Ajuste de estructura verificado durante E2E:** el `loading.tsx` preexistente de `(app)` inicia streaming antes de resolver `notFound`, lo que fija HTTP 200. Solo el módulo nuevo se aísla en `(crane-management)` para devolver 404 antes del streaming, con el mismo AppShell y `requireStaff`, el root layout compartido y las mismas URLs. Se conserva la carga de las rutas existentes.

## Task 4: Validación y producción

- [x] Check, compilación, integración completa y navegador completo; CLI/runner nativos si se afectan sus contratos. Revisión independiente final de permisos, alta y actividad; resolver hallazgos.
- [x] Comprobar limpieza de todos los stacks, volúmenes, redes, directorios y locks descartables. Conservar la cuenta `gruistatest` pedida expresamente por el usuario.
- [x] Actualizar guía operativa y registrar pruebas; no versionar capturas locales ni credenciales.
- [x] Configurar `SUPABASE_SECRET_KEY` únicamente en el servicio Railway existente, sin imprimir valor y sin redeploy previo al push (`skipDeploys: true`). Verificar presencia por nombre. No cambiar otros valores.
- [x] Dry-run y aplicación de la migración de producción sin seeds ni usuarios de prueba; los cuatro perfiles y asignaciones existentes se conservan. Integrar/pushear main sin force, observar SUCCESS del commit publicado y comprobar salud/login y lectura del módulo con las tres cuentas reales. Cerrar las sesiones de verificación; no crear más datos de prueba en producción.

## Evidencia de validación

- `npm run check`: lint y tipos correctos, 616 unitarias y 20 pruebas nativas de carga histórica.
- `npm run build`: compilación correcta de las tres rutas nuevas.
- Integración completa: 410 pruebas en 24 archivos, mediante stack descartable.
- Navegador completo: 87 pruebas con los dos workers predeterminados. Se corrigió una suposición de bandeja global vacía en una prueba heredada; ahora verifica el remito de su propio fixture. Ambos archivos de gruistas pasaron también juntos (12 pruebas).
- CLI de usuarios: 14 pruebas; controlador de stacks: 12 pruebas. Sin recursos, volúmenes, redes, directorios ni locks de pruebas restantes.
- Especificación y calidad aprobadas por etapa; revisión integrada final aprobada sobre `9da7b90..b7858ce` y la corrección de prueba `c15e65c`. Revisión visual independiente SHIP y documentación del sistema conservado.
- Railway: credencial privada configurada solo en el servidor con `skipDeploys: true`, verificada por nombre sin imprimirla. Migración `20261102120000` aplicada después del dry-run, sin seeds ni roles.

## Publicación verificada

- Integración fast-forward y push a `main`: `72b94d71ad62c8fc93737ea35d190ff9632dc5bf`.
- Railway: despliegue `42cd57ba-14e5-4a1d-ada9-c06a3a91b701`, observado en **SUCCESS** para ese commit exacto.
- Salud y login: HTTP 200. Las tres cuentas reales (`tcravero`, `adminstracion`, `jrojas`) conservaron rol `operador` activo y verificaron listado, alta y actividad en HTTP 200, con la gestión administrativa genérica denegada.
- `gruistatest` conservó `crane_operator` activo y su XCMG 70 TN; su portal respondió HTTP 200, la gestión lo redirigió al portal y la RPC de directorio fue denegada.
- Las cuatro sesiones de verificación se cerraron con alcance local. No se crearon cuentas, remitos ni archivos de prueba en producción. La consulta de perfiles y asignaciones confirmó las cuatro cuentas preexistentes sin cambios.
- Privilegios de finalización comprobados en producción: `anon=false`, `authenticated=false`, `service_role=true`.

Este registro documenta la primera publicación funcional; su cierre documental se publica sin cambios de código.
