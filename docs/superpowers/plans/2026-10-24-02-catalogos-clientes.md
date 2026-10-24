# Plan 2 · Catálogos y clientes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cargar y administrar los datos que alimentan las cotizaciones: datos de la empresa, firmantes, equipos (grúas), plantillas (mensual y por jornada, con los textos reales), y clientes con sus contactos y búsqueda sin acentos. Además se cierran los detalles que dejó la revisión del plan 1.

**Architecture:** Igual que el plan 1. Las lecturas se hacen en Server Components con el cliente de Supabase del servidor y las mutaciones en Server Actions que validan con Zod y devuelven un `EstadoFormulario`. Los formularios son client components con `useActionState`. La seguridad está en Postgres: RLS (activos leen y escriben; la empresa solo la modifica un admin), GRANTs explícitos por tabla y por columna, y CHECKs (CUIT válido). La búsqueda de clientes es una función SQL `buscar_clientes` con `unaccent`.

**Tech Stack:** el del plan 1 (Next.js 16.4.3, React 19, Supabase CLI 2.122, supabase-js 2.118, @supabase/ssr 0.12.7, Zod 4, Vitest 5, Playwright 1.64, shadcn 4.22.1).

**Diseño de referencia:** `docs/plans/2026-10-23-equipos-patagonicos-mvp-design.md`. **Plan anterior:** `docs/superpowers/plans/2026-10-23-01-fundaciones.md`.

**Convenciones (heredadas del plan 1):**
- UI y mensajes en castellano rioplatense.
- Commits Conventional Commits en castellano, terminando con `Co-Authored-By: Claude <noreply@anthropic.com>`.
- Comandos desde `/Users/guidoolguin/Desktop/equipos-patagonicos`.
- Después de cada migración: `npm run db:reset && npm run db:types` y commitear `src/lib/supabase/database.types.ts`.
- Por el revoke global del plan 1, **toda función nueva que deba ejecutar `authenticated` (RPC o usada en un CHECK) necesita `grant execute` explícito**.
- Si `npm install` deja el lock inconsistente (npm 11.6.2 en macOS), verificar con `npm ci --dry-run --ignore-scripts` y, si falla, correr `npm install --package-lock-only` hasta que no cambie entre dos pasadas.
- `[auth.email] enable_signup` queda en `true` (en la CLI apaga el proveedor email entero); el registro público se bloquea con `[auth] enable_signup = false`. No tocar.

**Recursos fuera del repo (los usa la Task 1):**
- Logo extraído del PDF real: `/private/tmp/claude-501/-Users-guidoolguin-Desktop-equipos-patagonicos/f204ed8f-2b7c-4e0e-845d-e3dc462cd7cb/scratchpad/assets/mensual/img-000.jpg` (437×95, fondo gris `#C0C1C8`).
- Colores de marca medidos sobre el logo: azul `#3D47CC` = `oklch(0.478 0.202 272.6)`, amarillo `#E6DC1F` = `oklch(0.875 0.181 106.2)`.

---

## Estructura de archivos al terminar el plan

```
public/logo-equipos-patagonicos.png       logo con fondo transparente
src/app/icon.png                          favicon (gancho del logo)
src/app/not-found.tsx                     404 en castellano
src/app/(app)/error.tsx                   error boundary en castellano
src/app/(app)/clientes/actions.ts         crear/actualizar cliente, estado, contactos
src/app/(app)/clientes/page.tsx           lista + búsqueda
src/app/(app)/clientes/nuevo/page.tsx
src/app/(app)/clientes/[id]/page.tsx      ficha + contactos
src/app/(app)/configuracion/actions.ts    empresa, firmantes, equipos, plantillas
src/app/(app)/configuracion/page.tsx      índice de configuración
src/app/(app)/configuracion/empresa/page.tsx
src/app/(app)/configuracion/firmantes/page.tsx
src/app/(app)/configuracion/equipos/page.tsx
src/app/(app)/configuracion/plantillas/page.tsx
src/app/(app)/configuracion/plantillas/[id]/page.tsx
src/components/formulario/campo.tsx | mensaje-formulario.tsx | formulario-accion.tsx | dialogo-formulario.tsx | boton-estado.tsx
src/components/clientes/campos-cliente.tsx | cliente-form.tsx | contactos.tsx | tabla-clientes.tsx
src/components/configuracion/empresa-form.tsx | firmantes.tsx | equipos.tsx | plantillas.tsx
src/lib/auth/errores.ts(+test)            esSesionInvalida y mensajeErrorLogin
src/lib/formularios.ts(+test)             EstadoFormulario, leerCampos, falloValidacion, falloBase, exito
src/lib/validacion.ts                     piezas Zod reutilizables (CUIT, email, números, uuid)
src/lib/plantillas/variables.ts(+test)    variables {{...}} de las plantillas
src/lib/plantillas/contenido.ts(+test)    esquemas de bloques e ítems (jsonb)
src/lib/clientes/esquemas.ts(+test)
src/lib/catalogos/esquemas.ts(+test)
supabase/migrations/20261024090000_ajustes_profiles.sql
supabase/migrations/20261024100000_catalogos.sql
supabase/migrations/20261024100100_datos_iniciales.sql
supabase/migrations/20261024110000_clientes.sql
supabase/seed.sql                         clientes de ejemplo (solo local)
tests/integration/profiles.test.ts | catalogos.test.ts | clientes.test.ts
tests/e2e/helpers.ts | clientes.spec.ts | configuracion.spec.ts
```

---

### Task 1: Marca, logo y ajustes de la base de UI

**Files:**
- Create: `public/logo-equipos-patagonicos.png`, `src/app/icon.png`, `src/app/not-found.tsx`, `src/app/(app)/error.tsx`
- Delete: `public/file.svg`, `public/globe.svg`, `public/next.svg`, `public/vercel.svg`, `public/window.svg`, `src/app/favicon.ico`
- Modify: `src/app/globals.css`, `src/components/ui/sonner.tsx`, `src/components/ui/sheet.tsx`, `src/app/layout.tsx`, `src/app/login/page.tsx`, `src/components/app-shell/app-shell.tsx`, `src/app/(app)/page.tsx`, `src/app/(app)/cotizaciones/page.tsx`, `src/app/(app)/presupuestos/page.tsx`, `src/app/(app)/clientes/page.tsx`, `src/app/(app)/configuracion/page.tsx`, `package.json`, `README.md`

- [ ] **Step 1: Logo y favicon**

```bash
LOGO=/private/tmp/claude-501/-Users-guidoolguin-Desktop-equipos-patagonicos/f204ed8f-2b7c-4e0e-845d-e3dc462cd7cb/scratchpad/assets/mensual/img-000.jpg
magick "$LOGO" -fuzz 12% -transparent "#C0C1C8" public/logo-equipos-patagonicos.png
magick "$LOGO" -crop 92x95+0+0 +repage -fuzz 12% -transparent "#C0C1C8" -resize 64x64 -background none -gravity center -extent 64x64 src/app/icon.png
git rm -q public/file.svg public/globe.svg public/next.svg public/vercel.svg public/window.svg src/app/favicon.ico
```

Abrir los dos PNG con la herramienta de lectura de imágenes. El logo tiene que verse sin el recuadro gris, y el ícono tiene que mostrar el gancho amarillo sobre azul. Si quedan restos grises en los bordes, subir `-fuzz` a 18% y regenerar. Si el gancho queda cortado, ajustar el ancho del `-crop` (entre 85 y 100).

- [ ] **Step 2: Colores de marca**

En `src/app/globals.css`, dentro de `:root`, reemplazar los valores de `--primary`, `--ring` y `--brand-yellow` que dejó el plan 1:

```css
  --primary: oklch(0.478 0.202 272.6);
  --ring: oklch(0.478 0.202 272.6);
  --brand-yellow: oklch(0.875 0.181 106.2);
```

- [ ] **Step 3: Toaster sin next-themes y textos accesibles en castellano**

La app no tiene ThemeProvider, así que el Toaster queda en tema claro fijo. En `src/components/ui/sonner.tsx`, borrar `import { useTheme } from "next-themes"` y la línea `const { theme = "system" } = useTheme()`, y reemplazar `theme={theme as ToasterProps["theme"]}` por `theme="light"`. Después:

```bash
grep -rn "next-themes" src || npm uninstall next-themes
```

En `src/components/ui/sheet.tsx`, reemplazar `<span className="sr-only">Close</span>` por `<span className="sr-only">Cerrar</span>`.

- [ ] **Step 4: Títulos por página**

En `src/app/layout.tsx`, reemplazar el `metadata` por:

```tsx
export const metadata: Metadata = {
  title: { default: 'Equipos Patagónicos', template: '%s · Equipos Patagónicos' },
  description: 'Administración y logística',
}
```

En `src/app/login/page.tsx`, el metadata pasa a `{ title: 'Ingresar' }`. Agregar `import type { Metadata } from 'next'` y `export const metadata: Metadata = { title: '…' }` en cada página de `(app)`, con estos títulos: `src/app/(app)/page.tsx` → `'Inicio'`; `cotizaciones/page.tsx` → `'Cotizaciones'`; `presupuestos/page.tsx` → `'Presupuestos'`; `clientes/page.tsx` → `'Clientes'`; `configuracion/page.tsx` → `'Configuración'`.

- [ ] **Step 5: Logo en el login y en el shell**

`src/app/login/page.tsx`: reemplazar el bloque `<div className="text-center">…</div>` por:

```tsx
        <div className="flex flex-col items-center gap-2 text-center">
          <Image
            src="/logo-equipos-patagonicos.png"
            alt="Equipos Patagónicos"
            width={437}
            height={95}
            priority
            className="h-12 w-auto"
          />
          <p className="text-sm text-muted-foreground">Administración y logística</p>
        </div>
```

con `import Image from 'next/image'` arriba.

`src/components/app-shell/app-shell.tsx` completo:

```tsx
import Image from 'next/image'
import Link from 'next/link'
import type { UsuarioActual } from '@/lib/auth'
import { MobileNav } from './mobile-nav'
import { SidebarNav } from './sidebar-nav'
import { UserMenu } from './user-menu'

function Logo({ className }: { className?: string }) {
  return (
    <Image
      src="/logo-equipos-patagonicos.png"
      alt="Equipos Patagónicos"
      width={437}
      height={95}
      priority
      className={className}
    />
  )
}

export function AppShell({ usuario, children }: { usuario: UsuarioActual; children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh">
      <aside className="hidden w-60 shrink-0 border-r bg-muted/30 p-4 md:block">
        <Link href="/" className="mb-6 block px-3" aria-label="Ir al inicio">
          <Logo className="h-9 w-auto" />
        </Link>
        <SidebarNav />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-2 border-b px-4">
          <div className="flex items-center gap-2">
            <MobileNav />
            <Link href="/" className="md:hidden" aria-label="Ir al inicio">
              <Logo className="h-7 w-auto" />
            </Link>
          </div>
          <UserMenu nombre={usuario.nombre} email={usuario.email} />
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Páginas de error y 404**

```tsx
// src/app/(app)/error.tsx
'use client'

import { Button } from '@/components/ui/button'

export default function ErrorSeccion({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <section className="max-w-lg space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Algo salió mal</h1>
      <p className="text-muted-foreground">
        No pudimos cargar esta sección. Probá de nuevo; si el problema sigue, avisale al administrador.
      </p>
      {error.digest ? <p className="text-xs text-muted-foreground">Código: {error.digest}</p> : null}
      <Button onClick={reset}>Reintentar</Button>
    </section>
  )
}
```

```tsx
// src/app/not-found.tsx
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function NoEncontrado() {
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <div className="max-w-sm space-y-4 text-center">
        <h1 className="text-xl font-semibold">No encontramos esta página</h1>
        <p className="text-sm text-muted-foreground">Puede que el enlace esté mal o que el registro ya no exista.</p>
        <Button asChild>
          <Link href="/">Volver al inicio</Link>
        </Button>
      </div>
    </main>
  )
}
```

- [ ] **Step 7: Typecheck reproducible, versión de Node y README**

En `package.json`:

```json
"typecheck": "next typegen && tsc --noEmit",
```

y agregar al primer nivel:

```json
"engines": { "node": ">=22.12.0" },
```

En `README.md`, reemplazar la sección "Requisitos" por:

```markdown
## Requisitos

- Node.js 22.12 o superior (recomendado 24 LTS)
- Docker (para Supabase local)
- Navegador de Playwright para los E2E: `npx playwright install chromium`
```

- [ ] **Step 8: Verificar y commit**

```bash
rm -rf .next && npm run check && npm run build && npm run test:e2e
```

Expected: todo en verde (los E2E del plan 1 siguen pasando).

```bash
git add -A
git commit -m "feat: logo, colores de marca, títulos por página y páginas de error

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Errores de autenticación y cierre de sesión

**Files:**
- Create: `src/lib/auth/errores.ts`, `src/lib/auth/errores.test.ts`
- Modify: `src/lib/auth.ts`, `src/lib/supabase/proxy.ts`, `src/app/login/actions.ts`, `src/components/app-shell/user-menu.tsx`

- [ ] **Step 1: Tests**

```ts
// src/lib/auth/errores.test.ts
import {
  AuthApiError,
  AuthInvalidJwtError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
} from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { esSesionInvalida, mensajeErrorLogin } from './errores'

describe('esSesionInvalida', () => {
  it('trata como sin sesión los errores 4xx de Auth y la sesión faltante', () => {
    expect(esSesionInvalida(new AuthSessionMissingError())).toBe(true)
    expect(esSesionInvalida(new AuthInvalidJwtError('jwt inválido'))).toBe(true)
    expect(esSesionInvalida(new AuthApiError('refresh revocado', 400, 'refresh_token_not_found'))).toBe(true)
  })

  it('no confunde Auth caído o limitado con falta de sesión', () => {
    expect(esSesionInvalida(new AuthApiError('demasiados', 429, 'over_request_rate_limit'))).toBe(false)
    expect(esSesionInvalida(new AuthApiError('error interno', 500, 'unexpected_failure'))).toBe(false)
    expect(esSesionInvalida(new AuthRetryableFetchError('fetch failed', 0))).toBe(false)
  })
})

describe('mensajeErrorLogin', () => {
  it('credenciales incorrectas', () => {
    expect(mensajeErrorLogin(new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'))).toBe(
      'Email o contraseña incorrectos',
    )
  })

  it('demasiados intentos', () => {
    expect(mensajeErrorLogin(new AuthApiError('Too many', 429, 'over_request_rate_limit'))).toBe(
      'Demasiados intentos seguidos. Esperá unos minutos y volvé a probar.',
    )
  })

  it('Auth caído o sin red', () => {
    const esperado = 'No pudimos conectar con el servidor. Probá de nuevo en un momento.'
    expect(mensajeErrorLogin(new AuthRetryableFetchError('fetch failed', 0))).toBe(esperado)
    expect(mensajeErrorLogin(new AuthApiError('boom', 503, 'unexpected_failure'))).toBe(esperado)
  })
})
```

```bash
npx vitest run src/lib/auth/errores.test.ts
```

Expected: FAIL porque no se puede resolver `./errores`.

- [ ] **Step 2: Implementar `errores.ts` y mover ahí `esSesionInvalida`**

```ts
// src/lib/auth/errores.ts
import {
  type AuthError,
  isAuthApiError,
  isAuthRetryableFetchError,
  isAuthSessionMissingError,
} from '@supabase/supabase-js'

/**
 * getClaims da error tanto si la sesión no sirve (token adulterado, o vencido con el refresh
 * revocado: 4xx de Auth) como si Auth no respondió (red caída, 5xx, 429). Lo primero equivale
 * a no tener sesión; lo segundo no dice nada de la sesión.
 */
export function esSesionInvalida(error: AuthError): boolean {
  return (
    isAuthSessionMissingError(error) ||
    error.name === 'AuthInvalidJwtError' ||
    (isAuthApiError(error) && error.status >= 400 && error.status < 500 && error.status !== 429)
  )
}

/** Mensaje para el formulario de login según el error de signInWithPassword. */
export function mensajeErrorLogin(error: AuthError): string {
  if (error.status === 429 || error.code === 'over_request_rate_limit') {
    return 'Demasiados intentos seguidos. Esperá unos minutos y volvé a probar.'
  }
  if (isAuthRetryableFetchError(error) || (error.status ?? 0) >= 500) {
    return 'No pudimos conectar con el servidor. Probá de nuevo en un momento.'
  }
  return 'Email o contraseña incorrectos'
}
```

En `src/lib/auth.ts`, borrar la función `esSesionInvalida` local (con su comentario), sacar del import de `@supabase/supabase-js` lo que ya no se use, y agregar `import { esSesionInvalida } from '@/lib/auth/errores'`.

```bash
npx vitest run src/lib/auth/errores.test.ts
```

Expected: PASS.

- [ ] **Step 3: El proxy no manda al login cuando Auth no responde**

En `src/lib/supabase/proxy.ts`, agregar `import { esSesionInvalida } from '@/lib/auth/errores'` y reemplazar:

```ts
  const { data } = await supabase.auth.getClaims()
```

por:

```ts
  const { data, error } = await supabase.auth.getClaims()
  // Si Auth no respondió no sabemos si hay sesión: se deja pasar y la página muestra el error
  // (mandar al login confundiría: el login diría "contraseña incorrecta").
  if (error && !esSesionInvalida(error)) return response
```

- [ ] **Step 4: Login con mensajes precisos y logout solo de este dispositivo**

En `src/app/login/actions.ts`:
- agregar `import { mensajeErrorLogin } from '@/lib/auth/errores'`;
- reemplazar `if (error) return { error: 'Email o contraseña incorrectos' }` por `if (error) return { error: mensajeErrorLogin(error) }`;
- reemplazar `await supabase.auth.signOut()` por `await supabase.auth.signOut({ scope: 'local' })`.

- [ ] **Step 5: Logout con un formulario real**

`src/components/app-shell/user-menu.tsx` completo. El `preventDefault` en `onSelect` mantiene el menú abierto para que el botón siga montado mientras el formulario se envía:

```tsx
'use client'

import { LogOut } from 'lucide-react'
import { cerrarSesion } from '@/app/login/actions'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const FORM_CERRAR_SESION = 'form-cerrar-sesion'

function iniciales(nombre: string) {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join('')
}

export function UserMenu({ nombre, email }: { nombre: string; email: string }) {
  return (
    <>
      <form id={FORM_CERRAR_SESION} action={cerrarSesion} className="hidden" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="gap-2" aria-label="Menú de usuario">
            <span className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {iniciales(nombre)}
            </span>
            <span className="hidden text-sm sm:inline">{nombre}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <p className="text-sm font-medium">{nombre}</p>
            <p className="truncate text-xs text-muted-foreground">{email}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild onSelect={(evento) => evento.preventDefault()}>
            <button type="submit" form={FORM_CERRAR_SESION} className="w-full">
              <LogOut className="size-4" aria-hidden />
              Cerrar sesión
            </button>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
```

- [ ] **Step 6: Verificar y commit**

```bash
npm run check && npm run test:e2e
git add -A
git commit -m "fix: mensajes de login según el error, logout local y proxy tolerante a Auth caído

Co-Authored-By: Claude <noreply@anthropic.com>"
```

Expected: check verde y `3 passed` en E2E (el test de logout sigue funcionando).

---

### Task 3: Permisos por columna en perfiles y regresión de funciones

**Files:**
- Create: `supabase/migrations/20261024090000_ajustes_profiles.sql`, `tests/integration/profiles.test.ts`
- Modify: `tests/integration/helpers.ts`

- [ ] **Step 1: Helper de conexión única para tests**

En `tests/integration/helpers.ts`, reemplazar la función `sql` por estas dos (`sql` queda con la misma firma):

```ts
/** Abre una conexión directa a la base local (como postgres) y la cierra al terminar. */
export async function conConexion<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

/** Ejecuta SQL directo contra la base local (como postgres). */
export async function sql<T extends pg.QueryResultRow = pg.QueryResultRow>(
  consulta: string,
  parametros: unknown[] = [],
): Promise<T[]> {
  return conConexion(async (client) => (await client.query<T>(consulta, parametros)).rows)
}
```

- [ ] **Step 2: Tests que fallan**

```ts
// tests/integration/profiles.test.ts
import { afterAll, describe, expect, it } from 'vitest'
import { adminClient, borrarUsuario, conConexion, crearUsuario, sql } from './helpers'

const creados: string[] = []

afterAll(async () => {
  for (const id of creados) await borrarUsuario(id)
})

describe('perfiles', () => {
  it('un admin no puede tocar columnas que no sean nombre, rol o activo', async () => {
    const admin = await crearUsuario({ activo: true, rol: 'admin' })
    creados.push(admin.id)

    const { error } = await admin.client
      .from('profiles')
      .update({ created_at: '2000-01-01T00:00:00Z' })
      .eq('id', admin.id)
    expect(error?.code).toBe('42501')
  })

  it('un admin no puede desactivarse ni quitarse el rol a sí mismo', async () => {
    const admin = await crearUsuario({ activo: true, rol: 'admin' })
    creados.push(admin.id)

    const desactivar = await admin.client.from('profiles').update({ activo: false }).eq('id', admin.id)
    expect(desactivar.error?.message).toMatch(/No podés desactivarte/)

    const degradar = await admin.client.from('profiles').update({ rol: 'operador' }).eq('id', admin.id)
    expect(degradar.error?.message).toMatch(/No podés desactivarte/)

    const [perfil] = await sql<{ activo: boolean; rol: string }>(
      'select activo, rol from public.profiles where id = $1',
      [admin.id],
    )
    expect(perfil).toEqual({ activo: true, rol: 'admin' })
  })

  it('un admin sí puede cambiar su propio nombre', async () => {
    const admin = await crearUsuario({ activo: true, rol: 'admin' })
    creados.push(admin.id)

    const { error } = await admin.client.from('profiles').update({ nombre: 'Nombre nuevo' }).eq('id', admin.id)
    expect(error).toBeNull()
  })

  it('un usuario creado sin email ni nombre igual tiene nombre', async () => {
    const { data, error } = await adminClient().auth.admin.createUser({
      phone: `+54911${Math.floor(10_000_000 + Math.random() * 89_999_999)}`,
      phone_confirm: true,
    })
    if (error) throw error
    creados.push(data.user.id)

    const [perfil] = await sql<{ nombre: string }>('select nombre from public.profiles where id = $1', [data.user.id])
    expect(perfil.nombre).toBe('Usuario sin nombre')
  })

  it('una función nueva en public o private no la ejecutan anon ni authenticated sin GRANT', async () => {
    const permisos = await conConexion(async (client) => {
      await client.query('begin')
      try {
        await client.query(`create function public.tmp_regresion() returns int language sql as 'select 1'`)
        await client.query(`create function private.tmp_regresion() returns int language sql as 'select 1'`)
        const { rows } = await client.query<{ rol: string; esquema: string; puede: boolean }>(`
          select r.rol, e.esquema, has_function_privilege(r.rol, e.esquema || '.tmp_regresion()', 'execute') as puede
          from (values ('anon'), ('authenticated')) as r(rol)
          cross join (values ('public'), ('private')) as e(esquema)
        `)
        return rows
      } finally {
        await client.query('rollback')
      }
    })
    expect(permisos.filter((p) => p.puede)).toEqual([])
  })
})
```

```bash
npm run test:int -- tests/integration/profiles.test.ts
```

Expected: FAIL en los tres primeros casos y en el de usuario sin email (el de funciones ya debería pasar).

- [ ] **Step 3: Migración**

```sql
-- supabase/migrations/20261024090000_ajustes_profiles.sql
-- Perfiles: UPDATE solo de nombre/rol/activo, un admin no puede degradarse a sí mismo,
-- y el nombre nunca queda vacío.

revoke update on public.profiles from authenticated;
grant update (nombre, rol, activo) on public.profiles to authenticated;

create or replace function private.proteger_autodegradacion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id = (select auth.uid())
     and old.rol = 'admin' and old.activo
     and (new.rol <> 'admin' or not new.activo) then
    raise exception 'No podés desactivarte ni quitarte el rol de administrador'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger profiles_proteger_autodegradacion
  before update on public.profiles
  for each row execute function private.proteger_autodegradacion();

create or replace function private.crear_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, nombre)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'nombre', ''), new.email, 'Usuario sin nombre')
  );
  return new;
end;
$$;
```

- [ ] **Step 4: Aplicar, regenerar tipos y correr**

```bash
npm run db:reset && npm run db:types && npm run test:int
```

Expected: PASS (todos los archivos de integración).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261024090000_ajustes_profiles.sql tests/integration src/lib/supabase/database.types.ts
git commit -m "fix: UPDATE de perfiles por columna y sin autodegradación del admin

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Utilidades de formularios y validación (TDD)

**Files:**
- Create: `src/lib/formularios.ts`, `src/lib/formularios.test.ts`, `src/lib/validacion.ts`

- [ ] **Step 1: Tests**

```ts
// src/lib/formularios.test.ts
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { exito, falloBase, falloValidacion, leerCampos, valorCampo } from './formularios'

describe('leerCampos', () => {
  it('lee los campos pedidos y usa "" para los que faltan o son archivos', () => {
    const fd = new FormData()
    fd.set('nombre', 'Julio')
    fd.set('archivo', new Blob(['x']))
    expect(leerCampos(fd, ['nombre', 'cargo', 'archivo'] as const)).toEqual({ nombre: 'Julio', cargo: '', archivo: '' })
  })
})

describe('falloValidacion', () => {
  it('devuelve el primer mensaje de cada campo y conserva lo que escribió el usuario', () => {
    const esquema = z.object({ nombre: z.string().min(1, 'Ingresá el nombre'), email: z.email('Email inválido') })
    const valores = { nombre: '', email: 'x' }
    const resultado = esquema.safeParse(valores)
    if (resultado.success) throw new Error('debería fallar')

    expect(falloValidacion(resultado.error, valores)).toEqual({
      ok: false,
      mensaje: 'Revisá los datos marcados',
      errores: { nombre: 'Ingresá el nombre', email: 'Email inválido' },
      valores,
    })
  })
})

describe('falloBase', () => {
  const valores = { cuit: '30719529670' }

  it('traduce los códigos de Postgres a mensajes', () => {
    expect(falloBase({ code: '23505', message: 'dup' }, valores).mensaje).toBe('Ya existe un registro con esos datos')
    expect(falloBase({ code: '42501', message: 'rls' }, valores).mensaje).toBe(
      'No tenés permiso para hacer esta operación',
    )
    expect(falloBase({ code: 'P0001', message: 'Mensaje de la regla' }, valores).mensaje).toBe('Mensaje de la regla')
    expect(falloBase({ code: 'XX000', message: 'raro' }, valores).mensaje).toBe(
      'No se pudo guardar. Probá de nuevo en un momento.',
    )
  })

  it('marca el campo cuando el duplicado tiene un campo asociado', () => {
    const resultado = falloBase({ code: '23505', message: 'dup' }, valores, {
      campo: 'cuit',
      mensaje: 'Ya existe un cliente con ese CUIT',
    })
    expect(resultado.errores).toEqual({ cuit: 'Ya existe un cliente con ese CUIT' })
    expect(resultado.valores).toEqual(valores)
  })
})

describe('exito', () => {
  it('arma un estado ok', () => {
    expect(exito('Guardado')).toEqual({ ok: true, mensaje: 'Guardado', errores: {} })
  })
})

describe('valorCampo', () => {
  it('prioriza lo que envió el usuario, después el valor inicial y por último ""', () => {
    const estado = { ok: false, mensaje: null, errores: {}, valores: { nombre: 'Escrito' } }
    expect(valorCampo(estado, { nombre: 'Inicial', cargo: 'Jefe' }, 'nombre')).toBe('Escrito')
    expect(valorCampo({ ok: false, mensaje: null, errores: {} }, { cargo: 'Jefe' }, 'cargo')).toBe('Jefe')
    expect(valorCampo({ ok: false, mensaje: null, errores: {} }, undefined, 'cargo')).toBe('')
  })
})
```

```bash
npx vitest run src/lib/formularios.test.ts
```

Expected: FAIL porque no se puede resolver `./formularios`.

- [ ] **Step 2: Implementar `formularios.ts`**

```ts
// src/lib/formularios.ts
import type { ZodError } from 'zod'

export type EstadoFormulario = {
  ok: boolean
  mensaje: string | null
  errores: Partial<Record<string, string>>
  /** Lo que envió el usuario: se vuelve a mostrar si la acción falla (React resetea el form). */
  valores?: Record<string, string>
}

export type AccionFormulario = (estado: EstadoFormulario, formData: FormData) => Promise<EstadoFormulario>

export const ESTADO_INICIAL: EstadoFormulario = { ok: false, mensaje: null, errores: {} }

export function leerCampos<const K extends string>(formData: FormData, campos: readonly K[]): Record<K, string> {
  const datos = {} as Record<K, string>
  for (const campo of campos) {
    const valor = formData.get(campo)
    datos[campo] = typeof valor === 'string' ? valor : ''
  }
  return datos
}

export function falloValidacion(error: ZodError, valores: Record<string, string>): EstadoFormulario {
  const errores: Record<string, string> = {}
  for (const issue of error.issues) {
    const campo = String(issue.path[0] ?? '')
    if (campo && !errores[campo]) errores[campo] = issue.message
  }
  return { ok: false, mensaje: 'Revisá los datos marcados', errores, valores }
}

type ErrorBase = { code?: string; message: string }

export function mensajeErrorBase(error: ErrorBase): string {
  switch (error.code) {
    case '23505':
      return 'Ya existe un registro con esos datos'
    case '23514':
      return 'Algún dato no es válido'
    case '42501':
      return 'No tenés permiso para hacer esta operación'
    case 'P0001':
      return error.message
    default:
      return 'No se pudo guardar. Probá de nuevo en un momento.'
  }
}

/** Error de Postgres/PostgREST. Si es un duplicado y se indica el campo, el error va a ese campo. */
export function falloBase(
  error: ErrorBase,
  valores: Record<string, string>,
  duplicado?: { campo: string; mensaje: string },
): EstadoFormulario {
  if (error.code === '23505' && duplicado) {
    return { ok: false, mensaje: duplicado.mensaje, errores: { [duplicado.campo]: duplicado.mensaje }, valores }
  }
  return { ok: false, mensaje: mensajeErrorBase(error), errores: {}, valores }
}

export function exito(mensaje: string): EstadoFormulario {
  return { ok: true, mensaje, errores: {} }
}

export function valorCampo(
  estado: EstadoFormulario,
  inicial: Partial<Record<string, string | null>> | undefined,
  campo: string,
): string {
  return estado.valores?.[campo] ?? inicial?.[campo] ?? ''
}
```

```bash
npx vitest run src/lib/formularios.test.ts
```

Expected: PASS.

- [ ] **Step 3: Piezas de validación reutilizables**

Se prueban a través de los esquemas de la Task 9.

```ts
// src/lib/validacion.ts
import { z } from 'zod'
import { normalizarCuit, validarCuit } from '@/lib/cuit'
import { parsePrecio } from '@/lib/format/montos'

export function textoRequerido(mensaje: string, max = 200) {
  return z.string().trim().min(1, mensaje).max(max, `Máximo ${max} caracteres`)
}

export function textoOpcional(max = 200) {
  return z.string().trim().max(max, `Máximo ${max} caracteres`)
}

export const emailOpcional = z
  .string()
  .trim()
  .max(200, 'Máximo 200 caracteres')
  .refine((valor) => valor === '' || z.email().safeParse(valor).success, 'El email no es válido')

/** CUIT opcional: acepta dígitos con guiones, puntos o espacios; vacío → null; guarda solo dígitos. */
export const cuitOpcional = z
  .string()
  .trim()
  .refine((valor) => /^[\d\s.-]*$/.test(valor), 'El CUIT no es válido')
  .transform(normalizarCuit)
  .refine((cuit) => cuit === '' || validarCuit(cuit), 'El CUIT no es válido')
  .transform((cuit) => (cuit === '' ? null : cuit))

/** Número positivo opcional escrito al estilo argentino ("60,5"); vacío → null. */
export function numeroPositivoOpcional(mensaje: string) {
  return z
    .string()
    .trim()
    .transform((valor, ctx) => {
      if (valor === '') return null
      const numero = parsePrecio(valor)
      if (numero === null || numero <= 0) {
        ctx.addIssue({ code: 'custom', message: mensaje })
        return z.NEVER
      }
      return numero
    })
}

export function esUuid(valor: string): boolean {
  return z.uuid().safeParse(valor).success
}
```

- [ ] **Step 4: Verificar y commit**

```bash
npm run check
git add src/lib/formularios.ts src/lib/formularios.test.ts src/lib/validacion.ts
git commit -m "feat: utilidades de formularios y validación

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Variables y contenido de plantillas (TDD)

**Files:**
- Create: `src/lib/plantillas/variables.ts`, `src/lib/plantillas/variables.test.ts`, `src/lib/plantillas/contenido.ts`, `src/lib/plantillas/contenido.test.ts`

Las plantillas guardan texto con **formato mínimo**: una línea normal es un párrafo, `- ` al principio es una viñeta de nivel 1, `  - ` (dos espacios) es una viñeta de nivel 2 y `**texto**` es negrita. También pueden llevar **variables** `{{nombre}}`, que se reemplazan al generar la cotización (plan 3). Este plan solo define las variables y los esquemas del contenido; el render es del plan 3.

- [ ] **Step 1: Tests de variables**

```ts
// src/lib/plantillas/variables.test.ts
import { describe, expect, it } from 'vitest'
import { resolverVariables, variablesDesconocidas, variablesUsadas } from './variables'

describe('variablesUsadas', () => {
  it('lista cada variable una sola vez, admitiendo espacios dentro de las llaves', () => {
    expect(variablesUsadas('Grúa de {{capacidad}} TN en {{ ubicacion }}; {{capacidad}} TN')).toEqual([
      'capacidad',
      'ubicacion',
    ])
  })
})

describe('variablesDesconocidas', () => {
  it('detecta nombres que no están en el catálogo', () => {
    expect(variablesDesconocidas('{{capacidad}} y {{capasidad}} y {{otra_cosa}}')).toEqual(['capasidad', 'otra_cosa'])
  })
})

describe('resolverVariables', () => {
  it('reemplaza las variables con valor y reporta las faltantes sin tocarlas', () => {
    const resultado = resolverVariables('Grúa de {{capacidad}} TN en {{ubicacion}}. Pago: {{forma_pago}}', {
      capacidad: '70',
      ubicacion: '   ',
    })
    expect(resultado).toEqual({
      texto: 'Grúa de 70 TN en {{ubicacion}}. Pago: {{forma_pago}}',
      faltantes: ['ubicacion', 'forma_pago'],
    })
  })

  it('no interpreta los "$" del valor como patrones de reemplazo', () => {
    expect(resolverVariables('Precio: {{forma_pago}}', { forma_pago: '$ 1.950.000 $&' }).texto).toBe(
      'Precio: $ 1.950.000 $&',
    )
  })

  it('deja intactas las variables desconocidas y no las reporta como faltantes', () => {
    expect(resolverVariables('{{desconocida}}', {})).toEqual({ texto: '{{desconocida}}', faltantes: [] })
  })
})
```

```bash
npx vitest run src/lib/plantillas/variables.test.ts
```

Expected: FAIL porque no se puede resolver `./variables`.

- [ ] **Step 2: Implementar variables**

```ts
// src/lib/plantillas/variables.ts
/** Variables que pueden usar las plantillas. La clave es el nombre entre llaves: {{capacidad}}. */
export const VARIABLES = {
  numero: 'Número de cotización',
  capacidad: 'Capacidad del equipo (TN)',
  equipo_descripcion: 'Descripción del equipo ofrecido',
  ubicacion: 'Lugar del servicio',
  horario: 'Horario',
  plazo_entrega: 'Plazo de entrega',
  duracion_estimada: 'Tiempo estimado de contratación',
  forma_pago: 'Forma de pago',
  disponibilidad: 'Disponibilidad',
  validez_dias: 'Validez (días)',
  indice_base: 'Mes base del índice FADEEAC',
  proxima_actualizacion: 'Próxima actualización de tarifas',
} as const

export type NombreVariable = keyof typeof VARIABLES

const PATRON_VARIABLE = /\{\{\s*([a-z_]+)\s*\}\}/g

export function esVariable(nombre: string): nombre is NombreVariable {
  return Object.hasOwn(VARIABLES, nombre)
}

export function variablesUsadas(texto: string): string[] {
  return [...new Set(Array.from(texto.matchAll(PATRON_VARIABLE), (m) => m[1]))]
}

export function variablesDesconocidas(texto: string): string[] {
  return variablesUsadas(texto).filter((nombre) => !esVariable(nombre))
}

/** Reemplaza las variables conocidas que tienen valor; las vacías quedan como {{x}} y se informan. */
export function resolverVariables(
  texto: string,
  valores: Partial<Record<NombreVariable, string>>,
): { texto: string; faltantes: NombreVariable[] } {
  const faltantes = new Set<NombreVariable>()
  const resultado = texto.replace(PATRON_VARIABLE, (original, nombre: string) => {
    if (!esVariable(nombre)) return original
    const valor = valores[nombre]?.trim()
    if (!valor) {
      faltantes.add(nombre)
      return original
    }
    return valor
  })
  return { texto: resultado, faltantes: [...faltantes] }
}
```

```bash
npx vitest run src/lib/plantillas/variables.test.ts
```

Expected: PASS.

- [ ] **Step 3: Tests del contenido (jsonb)**

```ts
// src/lib/plantillas/contenido.test.ts
import { describe, expect, it } from 'vitest'
import { FORMATOS, UNIDADES, leerBloques, leerItemsPlantilla } from './contenido'

describe('leerBloques', () => {
  it('acepta una lista de {titulo, contenido}', () => {
    expect(leerBloques([{ titulo: 'Alcance', contenido: '- Item' }])).toEqual([{ titulo: 'Alcance', contenido: '- Item' }])
  })

  it('rechaza datos con otra forma', () => {
    expect(() => leerBloques([{ titulo: 1 }])).toThrow()
    expect(() => leerBloques({})).toThrow()
  })
})

describe('leerItemsPlantilla', () => {
  it('acepta ítems con unidad válida y cantidad positiva', () => {
    const items = [{ seccion: 'Precios Jornada', descripcion: 'Jornada', unidad: 'JORNADA', cantidad: 1 }]
    expect(leerItemsPlantilla(items)).toEqual(items)
  })

  it('rechaza unidades desconocidas', () => {
    expect(() => leerItemsPlantilla([{ seccion: '', descripcion: 'x', unidad: 'LITRO', cantidad: 1 }])).toThrow()
  })
})

describe('catálogos', () => {
  it('expone los formatos y las unidades del diseño', () => {
    expect(Object.keys(FORMATOS)).toEqual(['mensual', 'jornada'])
    expect(UNIDADES).toEqual(['UNIDAD', 'JORNADA', 'HORA', 'SEMANA', 'MES', 'VIAJE'])
  })
})
```

- [ ] **Step 4: Implementar contenido**

```ts
// src/lib/plantillas/contenido.ts
import { z } from 'zod'

export const FORMATOS = { mensual: 'Mensual', jornada: 'Por jornada' } as const
export type Formato = keyof typeof FORMATOS

export const UNIDADES = ['UNIDAD', 'JORNADA', 'HORA', 'SEMANA', 'MES', 'VIAJE'] as const
export type Unidad = (typeof UNIDADES)[number]

export const esquemaBloque = z.object({ titulo: z.string(), contenido: z.string() })
export type Bloque = z.infer<typeof esquemaBloque>

export const esquemaItemPlantilla = z.object({
  seccion: z.string(),
  descripcion: z.string(),
  unidad: z.enum(UNIDADES),
  cantidad: z.number().positive(),
})
export type ItemPlantilla = z.infer<typeof esquemaItemPlantilla>

/** Valida el jsonb `bloques` de plantillas/cotizaciones. Lanza si no tiene la forma esperada. */
export function leerBloques(valor: unknown): Bloque[] {
  return z.array(esquemaBloque).parse(valor)
}

export function leerItemsPlantilla(valor: unknown): ItemPlantilla[] {
  return z.array(esquemaItemPlantilla).parse(valor)
}
```

```bash
npx vitest run src/lib/plantillas
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run check
git add src/lib/plantillas
git commit -m "feat: variables y esquemas del contenido de plantillas

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: Migración de catálogos

**Files:**
- Create: `supabase/migrations/20261024100000_catalogos.sql`, `tests/integration/catalogos.test.ts`

- [ ] **Step 1: Migración**

```sql
-- supabase/migrations/20261024100000_catalogos.sql
-- Catálogos: datos de la empresa (fila única), firmantes, equipos y plantillas de cotización.

create table public.empresa_config (
  id boolean primary key default true check (id),
  razon_social text not null check (btrim(razon_social) <> ''),
  cuit text check (cuit is null or cuit ~ '^\d{11}$'),
  direccion text not null default '',
  ciudad text not null default '',
  provincia text not null default '',
  telefono text not null default '',
  email text not null default '',
  web text not null default '',
  indice_base text not null default '',
  proxima_actualizacion text not null default '',
  updated_at timestamptz not null default now()
);

comment on table public.empresa_config is
  'Fila única con los datos del membrete y los valores por defecto de las cotizaciones (índice base, próxima actualización).';

create table public.firmantes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (btrim(nombre) <> ''),
  cargo text not null default '',
  telefono text not null default '',
  email text not null default '',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.equipos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (btrim(nombre) <> ''),
  capacidad_tn numeric(6, 1) check (capacidad_tn > 0),
  marca text not null default '',
  modelo text not null default '',
  identificacion text not null default '',
  descripcion text not null default '',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.equipos.identificacion is 'Número interno o dominio, como figura en los partes.';
comment on column public.equipos.descripcion is 'Texto de "Equipo ofrecido" en las cotizaciones.';

create table public.plantillas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (btrim(nombre) <> ''),
  formato text not null check (formato in ('mensual', 'jornada')),
  asunto text not null default '',
  intro text not null default '',
  bloques jsonb not null default '[]' check (jsonb_typeof(bloques) = 'array'),
  items jsonb not null default '[]' check (jsonb_typeof(items) = 'array'),
  validez_dias integer not null default 30 check (validez_dias between 1 and 365),
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.plantillas.bloques is 'Lista de {titulo, contenido}. Formato mínimo y variables {{x}}: ver src/lib/plantillas.';
comment on column public.plantillas.items is 'Ítems precargados sin precio: {seccion, descripcion, unidad, cantidad}.';

create trigger empresa_config_set_updated_at before update on public.empresa_config
  for each row execute function private.set_updated_at();
create trigger firmantes_set_updated_at before update on public.firmantes
  for each row execute function private.set_updated_at();
create trigger equipos_set_updated_at before update on public.equipos
  for each row execute function private.set_updated_at();
create trigger plantillas_set_updated_at before update on public.plantillas
  for each row execute function private.set_updated_at();

alter table public.empresa_config enable row level security;
alter table public.firmantes enable row level security;
alter table public.equipos enable row level security;
alter table public.plantillas enable row level security;

grant select on public.empresa_config to authenticated;
grant update (razon_social, cuit, direccion, ciudad, provincia, telefono, email, web, indice_base, proxima_actualizacion)
  on public.empresa_config to authenticated;
grant select, insert, update on public.firmantes, public.equipos, public.plantillas to authenticated;

create policy "usuarios activos ven la empresa" on public.empresa_config
  for select to authenticated using ((select private.es_usuario_activo()));
create policy "solo un admin modifica la empresa" on public.empresa_config
  for update to authenticated
  using ((select private.es_admin()))
  with check ((select private.es_admin()));

-- Firmantes, equipos y plantillas: los usuarios activos ven, crean y modifican.
-- No se borran: se desactivan (las cotizaciones los referencian).
create policy "usuarios activos ven firmantes" on public.firmantes
  for select to authenticated using ((select private.es_usuario_activo()));
create policy "usuarios activos crean firmantes" on public.firmantes
  for insert to authenticated with check ((select private.es_usuario_activo()));
create policy "usuarios activos modifican firmantes" on public.firmantes
  for update to authenticated
  using ((select private.es_usuario_activo()))
  with check ((select private.es_usuario_activo()));

create policy "usuarios activos ven equipos" on public.equipos
  for select to authenticated using ((select private.es_usuario_activo()));
create policy "usuarios activos crean equipos" on public.equipos
  for insert to authenticated with check ((select private.es_usuario_activo()));
create policy "usuarios activos modifican equipos" on public.equipos
  for update to authenticated
  using ((select private.es_usuario_activo()))
  with check ((select private.es_usuario_activo()));

create policy "usuarios activos ven plantillas" on public.plantillas
  for select to authenticated using ((select private.es_usuario_activo()));
create policy "usuarios activos crean plantillas" on public.plantillas
  for insert to authenticated with check ((select private.es_usuario_activo()));
create policy "usuarios activos modifican plantillas" on public.plantillas
  for update to authenticated
  using ((select private.es_usuario_activo()))
  with check ((select private.es_usuario_activo()));
```

- [ ] **Step 2: Aplicar y regenerar tipos**

```bash
npm run db:reset && npm run db:types
```

- [ ] **Step 3: Tests de integración**

```ts
// tests/integration/catalogos.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { borrarUsuario, crearUsuario, sql } from './helpers'

const MARCA = `test-${crypto.randomUUID().slice(0, 8)}`
const creados: string[] = []
let admin: Awaited<ReturnType<typeof crearUsuario>>
let operador: Awaited<ReturnType<typeof crearUsuario>>
let inactivo: Awaited<ReturnType<typeof crearUsuario>>

beforeAll(async () => {
  admin = await crearUsuario({ activo: true, rol: 'admin' })
  operador = await crearUsuario({ activo: true, rol: 'operador' })
  inactivo = await crearUsuario({ activo: false })
  creados.push(admin.id, operador.id, inactivo.id)
})

afterAll(async () => {
  await sql('delete from public.firmantes where nombre like $1', [`%${MARCA}%`])
  await sql('delete from public.equipos where nombre like $1', [`%${MARCA}%`])
  await sql('delete from public.plantillas where nombre like $1', [`%${MARCA}%`])
  for (const id of creados) await borrarUsuario(id)
})

describe('empresa_config', () => {
  it('es una fila única', async () => {
    await expect(sql(`insert into public.empresa_config (id, razon_social) values (false, 'Otra')`)).rejects.toThrow()
  })

  it('la ve un usuario activo, no uno inactivo', async () => {
    const visto = await operador.client.from('empresa_config').select('razon_social')
    expect(visto.error).toBeNull()
    expect(visto.data).toHaveLength(1)

    const oculto = await inactivo.client.from('empresa_config').select('razon_social')
    expect(oculto.data).toEqual([])
  })

  it('solo un admin la modifica', async () => {
    const [{ telefono: original }] = await sql<{ telefono: string }>('select telefono from public.empresa_config')

    const porOperador = await operador.client.from('empresa_config').update({ telefono: '1' }).eq('id', true).select()
    expect(porOperador.data ?? []).toEqual([])

    const porAdmin = await admin.client.from('empresa_config').update({ telefono: '0299 - 1234567' }).eq('id', true).select()
    expect(porAdmin.error).toBeNull()
    expect(porAdmin.data?.[0]?.telefono).toBe('0299 - 1234567')

    await sql('update public.empresa_config set telefono = $1', [original])
  })
})

describe('firmantes, equipos y plantillas', () => {
  it('un usuario activo crea y modifica; uno inactivo no', async () => {
    const creado = await operador.client
      .from('firmantes')
      .insert({ nombre: `Firmante ${MARCA}`, cargo: 'Logística' })
      .select('id')
      .single()
    expect(creado.error).toBeNull()

    const modificado = await operador.client
      .from('firmantes')
      .update({ activo: false })
      .eq('id', creado.data!.id)
      .select('activo')
      .single()
    expect(modificado.data?.activo).toBe(false)

    const rechazado = await inactivo.client.from('firmantes').insert({ nombre: `Intruso ${MARCA}` })
    expect(rechazado.error?.code).toBe('42501')
  })

  it('nadie puede borrar (se desactivan)', async () => {
    const { data } = await operador.client
      .from('equipos')
      .insert({ nombre: `Equipo ${MARCA}`, capacidad_tn: 40 })
      .select('id')
      .single()
    const borrado = await admin.client.from('equipos').delete().eq('id', data!.id)
    expect(borrado.error?.code).toBe('42501')
  })

  it('valida capacidad positiva y nombre de plantilla único', async () => {
    const capacidad = await operador.client.from('equipos').insert({ nombre: `Equipo ${MARCA} 2`, capacidad_tn: 0 })
    expect(capacidad.error?.code).toBe('23514')

    const nombre = `Plantilla ${MARCA}`
    await operador.client.from('plantillas').insert({ nombre, formato: 'mensual' })
    const repetida = await operador.client.from('plantillas').insert({ nombre, formato: 'jornada' })
    expect(repetida.error?.code).toBe('23505')
  })
})
```

```bash
npm run test:int -- tests/integration/catalogos.test.ts
```

Expected: FAIL solo en los casos de `empresa_config` que esperan una fila (todavía no hay datos: los carga la Task 7). Los demás pasan.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261024100000_catalogos.sql tests/integration/catalogos.test.ts src/lib/supabase/database.types.ts
git commit -m "feat: tablas de catálogos con RLS (empresa, firmantes, equipos, plantillas)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: Datos iniciales (empresa, firmantes, equipos y plantillas reales)

**Files:**
- Create: `supabase/migrations/20261024100100_datos_iniciales.sql`
- Modify: `tests/integration/catalogos.test.ts`

Los textos salen de las dos cotizaciones reales, con las partes que cambian reemplazadas por variables y con algunos typos corregidos (`299 299 601 9931` → `299 601 9931`, "realizaran"). Movilización y desmovilización pasan a la unidad `VIAJE` y el pick-up por jornada a `JORNADA`, porque en el PDF figuraban como `HORA` por error de carga. El usuario va a validar estos textos (pendiente 6 del diseño).

- [ ] **Step 1: Migración**

```sql
-- supabase/migrations/20261024100100_datos_iniciales.sql
-- Datos reales de Equipos Patagónicos tomados de las cotizaciones 112523 (mensual) y 112711 (por jornada).

insert into public.empresa_config
  (razon_social, direccion, ciudad, provincia, telefono, email, web, indice_base, proxima_actualizacion)
values
  ('Equipos Patagónicos', 'T. Planas 5168', 'Neuquén', 'Neuquén', '0299 - 6019931',
   'equipos@equipospatagonicos.com.ar', 'www.equipospatagonicos.com.ar', 'junio 2026', 'noviembre de 2026');

insert into public.firmantes (nombre, cargo, telefono, email) values
  ('Julio Rojas', 'Contrataciones / Logística', '299-6019931', ''),
  ('Thomas Cravero', 'Contrataciones / Logística', '299 418 3985', 'tcravero@equipospatagonicos.com.ar');

insert into public.equipos (nombre, capacidad_tn, marca, modelo, descripcion) values
  ('Grúa telescópica XCMG 70 TN', 70, 'XCMG', '70 TN',
   'Grúa Telescópica marca XCMG modelo 70 TN, sobre camión con 60,5 m de pluma telescópica, control computarizado, certificada por Normas OAA, en buen estado.'),
  ('Grúa telescópica XCMG QY70K-1 40 TN', 40, 'XCMG', 'QY70K-1',
   'Grúa Telescópica marca XCMG modelo QY70K-1 de 40 TN, sobre camión con pluma telescópica, control computarizado, certificada por Normas OAA, en buen estado.');

insert into public.plantillas (nombre, formato, asunto, intro, bloques, items, validez_dias) values
(
  'Mensual - Grúa con operador',
  'mensual',
  '',
  '',
  $json$[
    {
      "titulo": "CONDICIONES PARTICULARES DEL SERVICIO DE GRÚAS CON OPERADOR",
      "contenido": "- El precio corresponde a una jornada de {{horario}}, grúa de {{capacidad}} TN con operador calificado para realizar servicios en {{ubicacion}}.\n- Contratación mensual / semanal / jornada.\n- Equipo ofrecido:\n  - {{equipo_descripcion}}\n- Las tarifas no contemplan personal de supervisión ni de eslingado.\n- El servicio contempla el equipo, elementos de izaje y mantenimiento preventivo para el equipo.\n- El estado del suelo tiene que encontrarse en buenas condiciones para que las grúas puedan desplazarse, como así también estar lo suficientemente compactado y nivelado para que estas unidades puedan maniobrar, posicionarse y estacionarse.\n- Las piezas deberán estar situadas bajo el gancho.\n- Elementos de izaje: se deberá enviar con 48 hs de anticipación al inicio del servicio un listado con el detalle de los elementos requeridos.\n- Unidades sujetas a disponibilidad.\n- Plazo de entrega: {{plazo_entrega}}.\n- Tarifas sin IVA.\n- Condiciones de pago: {{forma_pago}}."
    },
    {
      "titulo": "CONDICIONES PARA LA CONTRATACIÓN DE SERVICIOS",
      "contenido": "- **Coordinación operativa:** para coordinar el servicio comunicarse con la Coordinación Operativa con 72 hs de anticipación a los siguientes contactos: Tel. 299 601 9931; mail: equipos@equipospatagonicos.com.ar\n- **Documentación:** el Cliente deberá proveer un listado de la documentación requerida con 72 hs de anticipación al servicio al siguiente contacto: Tel. 299 418 3985; mail: tcravero@equipospatagonicos.com.ar\n- Los caminos de acceso y el acondicionamiento del lugar donde se realizará el servicio son responsabilidad del Cliente."
    },
    {
      "titulo": "RENEGOCIACIÓN DE TARIFAS",
      "contenido": "La presente cotización es válida por {{validez_dias}} días. El servicio tendrá una actualización con frecuencia cuatrimestral, manteniendo monitoreada de todas formas la evolución de los costos e índices.\nComo base de las tarifas se utilizará el índice de Costos de Transporte de Cargas FADEEAC (ICTF), con base en {{indice_base}}.\nLa próxima actualización se realizará en {{proxima_actualizacion}}."
    }
  ]$json$::jsonb,
  $json$[
    {"seccion": "", "descripcion": "Alquiler mensual Grúa {{capacidad}} TN", "unidad": "UNIDAD", "cantidad": 1},
    {"seccion": "", "descripcion": "Alquiler semanal Grúa {{capacidad}} TN", "unidad": "UNIDAD", "cantidad": 1},
    {"seccion": "", "descripcion": "Jornada (lunes a sábado)", "unidad": "JORNADA", "cantidad": 1},
    {"seccion": "", "descripcion": "Jornada adicional (feriado y domingo)", "unidad": "JORNADA", "cantidad": 1},
    {"seccion": "", "descripcion": "Hora adicional (lunes a viernes)", "unidad": "HORA", "cantidad": 1},
    {"seccion": "", "descripcion": "Hora adicional (feriado y domingo)", "unidad": "HORA", "cantidad": 1},
    {"seccion": "", "descripcion": "Servicio pick up – movilización gruista por jornada", "unidad": "JORNADA", "cantidad": 1},
    {"seccion": "", "descripcion": "Movilización", "unidad": "VIAJE", "cantidad": 1},
    {"seccion": "", "descripcion": "Desmovilización", "unidad": "VIAJE", "cantidad": 1}
  ]$json$::jsonb,
  30
),
(
  'Por jornada - Grúa con operador',
  'jornada',
  'Cotización N° {{numero}} alquiler de 1 (una) Grúa Telescópica capacidad {{capacidad}} TN con operador.',
  'Por medio del presente cotizamos el servicio de alquiler de 1 (una) Grúa Telescópica de {{capacidad}} TN para prestar servicios de izajes en {{ubicacion}}.',
  $json$[
    {"titulo": "Equipo ofrecido", "contenido": "{{equipo_descripcion}}"},
    {
      "titulo": "Alcance",
      "contenido": "El servicio contempla el equipo, elementos de izajes, mantenimiento preventivo para el equipo y toda la documentación necesaria para realizar el trabajo.\nHorario de {{horario}}. Prestación mínima 8 hs.\nTiempo estimado de contratación: {{duracion_estimada}}."
    },
    {
      "titulo": "",
      "contenido": "**Forma de pago:** {{forma_pago}}.\n**Disponibilidad:** {{disponibilidad}}.\nSaludos cordiales."
    }
  ]$json$::jsonb,
  $json$[
    {"seccion": "Precios Jornada", "descripcion": "Alquiler jornada de Grúa Telescópica de {{capacidad}} TN (lunes a sábado)", "unidad": "JORNADA", "cantidad": 1},
    {"seccion": "Precios Jornada", "descripcion": "Movilización y desmovilización de Grúa Telescópica", "unidad": "VIAJE", "cantidad": 1},
    {"seccion": "Precios Jornada Adicional", "descripcion": "Jornadas diarias (8 hs) adicionales, domingos y feriados", "unidad": "JORNADA", "cantidad": 1}
  ]$json$::jsonb,
  30
);
```

- [ ] **Step 2: Tests de los datos iniciales**

Agregar al final de `tests/integration/catalogos.test.ts` (y sumar los imports de `@/lib/plantillas/contenido` y `@/lib/plantillas/variables`):

```ts
import { leerBloques, leerItemsPlantilla } from '@/lib/plantillas/contenido'
import { variablesDesconocidas } from '@/lib/plantillas/variables'

describe('datos iniciales', () => {
  it('cargan la empresa, los dos firmantes y los dos equipos', async () => {
    const [empresa] = await sql<{ razon_social: string; ciudad: string }>(
      'select razon_social, ciudad from public.empresa_config',
    )
    expect(empresa).toEqual({ razon_social: 'Equipos Patagónicos', ciudad: 'Neuquén' })

    const firmantes = await sql<{ nombre: string }>(
      `select nombre from public.firmantes where nombre in ('Julio Rojas', 'Thomas Cravero') order by nombre`,
    )
    expect(firmantes.map((f) => f.nombre)).toEqual(['Julio Rojas', 'Thomas Cravero'])

    const equipos = await sql<{ capacidad_tn: string }>(
      `select capacidad_tn from public.equipos where nombre like 'Grúa telescópica XCMG%' order by capacidad_tn`,
    )
    expect(equipos.map((e) => Number(e.capacidad_tn))).toEqual([40, 70])
  })

  it('las dos plantillas tienen contenido válido y solo usan variables conocidas', async () => {
    const plantillas = await sql<{ nombre: string; formato: string; asunto: string; intro: string; bloques: unknown; items: unknown }>(
      `select nombre, formato, asunto, intro, bloques, items from public.plantillas
       where nombre in ('Mensual - Grúa con operador', 'Por jornada - Grúa con operador') order by formato`,
    )
    expect(plantillas.map((p) => p.formato)).toEqual(['jornada', 'mensual'])

    for (const plantilla of plantillas) {
      const bloques = leerBloques(plantilla.bloques)
      const items = leerItemsPlantilla(plantilla.items)
      const textos = [plantilla.asunto, plantilla.intro, ...bloques.flatMap((b) => [b.titulo, b.contenido]), ...items.map((i) => i.descripcion)]
      expect(variablesDesconocidas(textos.join('\n'))).toEqual([])
    }
  })
})
```

- [ ] **Step 3: Aplicar y correr**

```bash
npm run db:reset && npm run db:types && npm run test:int
```

Expected: PASS (todos).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261024100100_datos_iniciales.sql tests/integration/catalogos.test.ts src/lib/supabase/database.types.ts
git commit -m "feat: datos iniciales de empresa, firmantes, equipos y plantillas reales

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: Migración de clientes, contactos y búsqueda

**Files:**
- Create: `supabase/migrations/20261024110000_clientes.sql`, `tests/integration/clientes.test.ts`

- [ ] **Step 1: Tests que fallan**

```ts
// tests/integration/clientes.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { anonClient, borrarUsuario, crearUsuario, sql } from './helpers'

const MARCA = `t${crypto.randomUUID().slice(0, 8)}`
const CUIT_DE_PRUEBA = '33693450239' // AFIP: válido y fuera de los datos de ejemplo
const creados: string[] = []
let activo: Awaited<ReturnType<typeof crearUsuario>>
let inactivo: Awaited<ReturnType<typeof crearUsuario>>

async function limpiar() {
  await sql('delete from public.clientes where razon_social like $1 or cuit = $2', [`%${MARCA}%`, CUIT_DE_PRUEBA])
}

beforeAll(async () => {
  await limpiar()
  activo = await crearUsuario({ activo: true, rol: 'operador' })
  inactivo = await crearUsuario({ activo: false })
  creados.push(activo.id, inactivo.id)
})

afterAll(async () => {
  await limpiar()
  for (const id of creados) await borrarUsuario(id)
})

describe('clientes', () => {
  it('un usuario activo crea un cliente y queda registrado quién lo creó', async () => {
    const { data, error } = await activo.client
      .from('clientes')
      .insert({ razon_social: `Milicic ${MARCA} S.A.` })
      .select('id, created_by, activo')
      .single()
    expect(error).toBeNull()
    expect(data).toMatchObject({ created_by: activo.id, activo: true })
  })

  it('un usuario inactivo no ve ni crea clientes', async () => {
    const visto = await inactivo.client.from('clientes').select('id')
    expect(visto.data).toEqual([])
    const creado = await inactivo.client.from('clientes').insert({ razon_social: `Intruso ${MARCA}` })
    expect(creado.error?.code).toBe('42501')
  })

  it('la base rechaza un CUIT inválido y uno repetido', async () => {
    const invalido = await activo.client.from('clientes').insert({ razon_social: `Malo ${MARCA}`, cuit: '30719529671' })
    expect(invalido.error?.code).toBe('23514')

    const primero = await activo.client.from('clientes').insert({ razon_social: `Uno ${MARCA}`, cuit: CUIT_DE_PRUEBA })
    expect(primero.error).toBeNull()
    const repetido = await activo.client.from('clientes').insert({ razon_social: `Dos ${MARCA}`, cuit: CUIT_DE_PRUEBA })
    expect(repetido.error?.code).toBe('23505')
  })

  it('varios clientes pueden no tener CUIT', async () => {
    const a = await activo.client.from('clientes').insert({ razon_social: `Sin CUIT A ${MARCA}` })
    const b = await activo.client.from('clientes').insert({ razon_social: `Sin CUIT B ${MARCA}` })
    expect(a.error).toBeNull()
    expect(b.error).toBeNull()
  })

  it('los clientes no se borran (se desactivan)', async () => {
    const { data } = await activo.client.from('clientes').insert({ razon_social: `Borrable ${MARCA}` }).select('id').single()
    const borrado = await activo.client.from('clientes').delete().eq('id', data!.id)
    expect(borrado.error?.code).toBe('42501')
  })
})

describe('contactos', () => {
  it('se crean, modifican y borran; se borran con el cliente', async () => {
    const { data: cliente } = await activo.client
      .from('clientes')
      .insert({ razon_social: `Con contactos ${MARCA}` })
      .select('id')
      .single()

    const { data: contacto, error } = await activo.client
      .from('contactos')
      .insert({ cliente_id: cliente!.id, nombre: 'Yanina Colman', email: 'yanina.colman@milicic.com.ar' })
      .select('id')
      .single()
    expect(error).toBeNull()

    const modificado = await activo.client.from('contactos').update({ cargo: 'Compras' }).eq('id', contacto!.id).select('cargo').single()
    expect(modificado.data?.cargo).toBe('Compras')

    const borrado = await activo.client.from('contactos').delete().eq('id', contacto!.id)
    expect(borrado.error).toBeNull()
  })
})

describe('buscar_clientes', () => {
  beforeAll(async () => {
    const { data } = await activo.client
      .from('clientes')
      .insert({ razon_social: `VÉRTICE SERVICIOS ${MARCA} S.R.L.` })
      .select('id')
      .single()
    await activo.client.from('contactos').insert({ cliente_id: data!.id, nombre: `Ñandú ${MARCA}` })
  })

  async function buscar(texto: string) {
    const { data, error } = await activo.client.rpc('buscar_clientes', { texto, limite: 50 })
    if (error) throw error
    return data.map((c) => c.razon_social)
  }

  it('ignora acentos y mayúsculas', async () => {
    expect(await buscar(`vertice servicios ${MARCA}`)).toEqual([`VÉRTICE SERVICIOS ${MARCA} S.R.L.`])
  })

  it('encuentra por nombre de contacto', async () => {
    expect(await buscar(`nandu ${MARCA}`)).toEqual([`VÉRTICE SERVICIOS ${MARCA} S.R.L.`])
  })

  it('encuentra por CUIT con o sin guiones', async () => {
    expect(await buscar('33-69345023')).toContain(`Uno ${MARCA}`)
    expect(await buscar('3369345023')).toContain(`Uno ${MARCA}`)
  })

  it('trata % y _ como texto, no como comodines', async () => {
    expect(await buscar('%')).toEqual([])
    expect(await buscar('_')).toEqual([])
  })

  it('sin texto devuelve clientes, activos primero', async () => {
    const { data } = await activo.client.rpc('buscar_clientes', { texto: '', limite: 200 })
    expect(data!.length).toBeGreaterThan(0)
    const indiceInactivo = data!.findIndex((c) => !c.activo)
    if (indiceInactivo >= 0) expect(data!.slice(indiceInactivo).every((c) => !c.activo)).toBe(true)
  })

  it('anon no puede ejecutarla', async () => {
    const { error } = await anonClient().rpc('buscar_clientes', { texto: 'x' })
    expect(error).not.toBeNull()
  })
})
```

- [ ] **Step 2: Migración**

```sql
-- supabase/migrations/20261024110000_clientes.sql
-- Clientes con contactos y búsqueda sin acentos (razón social, CUIT y nombre de contacto).

create or replace function private.cuit_valido(cuit text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  pesos constant integer[] := array[5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  suma integer := 0;
  resto integer;
begin
  if cuit is null then
    return true;
  end if;
  if cuit !~ '^\d{11}$' or left(cuit, 2) not in ('20', '23', '24', '25', '26', '27', '30', '33', '34') then
    return false;
  end if;
  for i in 1..10 loop
    suma := suma + pesos[i] * substr(cuit, i, 1)::integer;
  end loop;
  resto := suma % 11;
  if resto = 1 then
    return false;
  end if;
  return (case when resto = 0 then 0 else 11 - resto end) = substr(cuit, 11, 1)::integer;
end;
$$;

-- La usa el CHECK de clientes, que se evalúa con los permisos de quien inserta.
grant execute on function private.cuit_valido(text) to authenticated;

create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  razon_social text not null check (btrim(razon_social) <> ''),
  cuit text check (private.cuit_valido(cuit)),
  condicion_iva text check (condicion_iva in ('responsable_inscripto', 'monotributo', 'exento', 'consumidor_final')),
  direccion text not null default '',
  localidad text not null default '',
  provincia text not null default '',
  telefono text not null default '',
  email text not null default '',
  condicion_pago text not null default '',
  notas text not null default '',
  activo boolean not null default true,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.clientes.cuit is 'Solo dígitos (11). Opcional para cotizar a prospectos; único cuando está cargado.';

create unique index clientes_cuit_unico on public.clientes (cuit) where cuit is not null;

create table public.contactos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  nombre text not null check (btrim(nombre) <> ''),
  cargo text not null default '',
  email text not null default '',
  telefono text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index contactos_cliente_id on public.contactos (cliente_id);

create trigger clientes_set_updated_at before update on public.clientes
  for each row execute function private.set_updated_at();
create trigger contactos_set_updated_at before update on public.contactos
  for each row execute function private.set_updated_at();

alter table public.clientes enable row level security;
alter table public.contactos enable row level security;

grant select, insert, update on public.clientes to authenticated;
grant select, insert, update, delete on public.contactos to authenticated;

create policy "usuarios activos ven clientes" on public.clientes
  for select to authenticated using ((select private.es_usuario_activo()));
create policy "usuarios activos crean clientes" on public.clientes
  for insert to authenticated with check ((select private.es_usuario_activo()));
create policy "usuarios activos modifican clientes" on public.clientes
  for update to authenticated
  using ((select private.es_usuario_activo()))
  with check ((select private.es_usuario_activo()));

create policy "usuarios activos ven contactos" on public.contactos
  for select to authenticated using ((select private.es_usuario_activo()));
create policy "usuarios activos crean contactos" on public.contactos
  for insert to authenticated with check ((select private.es_usuario_activo()));
create policy "usuarios activos modifican contactos" on public.contactos
  for update to authenticated
  using ((select private.es_usuario_activo()))
  with check ((select private.es_usuario_activo()));
create policy "usuarios activos borran contactos" on public.contactos
  for delete to authenticated using ((select private.es_usuario_activo()));

-- SECURITY INVOKER: corre con los permisos (y la RLS) de quien la llama.
create or replace function public.buscar_clientes(texto text default '', limite integer default 50)
returns setof public.clientes
language sql
stable
security invoker
set search_path = ''
as $$
  with consulta as (
    select
      extensions.unaccent(lower(btrim(coalesce(texto, '')))) as normalizado,
      regexp_replace(coalesce(texto, ''), '\D', '', 'g') as digitos
  ),
  patron as (
    select
      normalizado,
      digitos,
      '%' || replace(replace(replace(normalizado, '\', '\\'), '%', '\%'), '_', '\_') || '%' as como
    from consulta
  )
  select c.*
  from public.clientes c, patron p
  where p.normalizado = ''
     or extensions.unaccent(lower(c.razon_social)) like p.como
     or (length(p.digitos) >= 3 and c.cuit like '%' || p.digitos || '%')
     or exists (
       select 1 from public.contactos k
       where k.cliente_id = c.id and extensions.unaccent(lower(k.nombre)) like p.como
     )
  order by c.activo desc, c.razon_social
  limit least(greatest(coalesce(limite, 50), 1), 200);
$$;

grant execute on function public.buscar_clientes(text, integer) to authenticated;
```

- [ ] **Step 3: Aplicar y correr**

```bash
npm run db:reset && npm run db:types && npm run test:int
```

Expected: PASS (todos). Si "ignora acentos" falla con un error de permisos sobre `unaccent`, agregar a la migración `grant usage on schema extensions to authenticated;` y `grant execute on function extensions.unaccent(text) to authenticated;` y volver a correr.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261024110000_clientes.sql tests/integration/clientes.test.ts src/lib/supabase/database.types.ts
git commit -m "feat: clientes y contactos con CUIT validado en la base y búsqueda sin acentos

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: Esquemas de clientes y catálogos (TDD)

**Files:**
- Create: `src/lib/clientes/esquemas.ts`, `src/lib/clientes/esquemas.test.ts`, `src/lib/catalogos/esquemas.ts`, `src/lib/catalogos/esquemas.test.ts`

- [ ] **Step 1: Tests**

```ts
// src/lib/clientes/esquemas.test.ts
import { describe, expect, it } from 'vitest'
import { CAMPOS_CLIENTE, esquemaCliente, esquemaContacto } from './esquemas'

function cliente(datos: Partial<Record<(typeof CAMPOS_CLIENTE)[number], string>>) {
  const vacio = Object.fromEntries(CAMPOS_CLIENTE.map((c) => [c, ''])) as Record<(typeof CAMPOS_CLIENTE)[number], string>
  return { ...vacio, ...datos }
}

describe('esquemaCliente', () => {
  it('acepta un prospecto solo con razón social y normaliza los opcionales', () => {
    const resultado = esquemaCliente.parse(cliente({ razon_social: '  Milicic S.A.  ' }))
    expect(resultado).toMatchObject({ razon_social: 'Milicic S.A.', cuit: null, condicion_iva: null, email: '' })
  })

  it('guarda el CUIT solo con dígitos', () => {
    expect(esquemaCliente.parse(cliente({ razon_social: 'Vértice', cuit: '30-71952967-0' })).cuit).toBe('30719529670')
  })

  it.each([
    ['30-71952967-1', 'dígito verificador'],
    ['abc', 'letras'],
    ['30-71952967', 'incompleto'],
  ])('rechaza el CUIT %s (%s)', (cuit) => {
    const resultado = esquemaCliente.safeParse(cliente({ razon_social: 'X', cuit }))
    expect(resultado.success).toBe(false)
    expect(resultado.error?.issues[0]?.message).toBe('El CUIT no es válido')
  })

  it('exige razón social y valida email y condición de IVA', () => {
    const resultado = esquemaCliente.safeParse(cliente({ email: 'no-es-email', condicion_iva: 'otra' }))
    const campos = resultado.error?.issues.map((i) => i.path[0])
    expect(campos).toEqual(expect.arrayContaining(['razon_social', 'email', 'condicion_iva']))
  })
})

describe('esquemaContacto', () => {
  it('exige nombre y valida el email', () => {
    expect(esquemaContacto.safeParse({ nombre: '', cargo: '', email: '', telefono: '' }).success).toBe(false)
    expect(esquemaContacto.safeParse({ nombre: 'Yanina', cargo: '', email: 'mal', telefono: '' }).success).toBe(false)
    expect(esquemaContacto.parse({ nombre: ' Yanina ', cargo: '', email: '', telefono: '' }).nombre).toBe('Yanina')
  })
})
```

```ts
// src/lib/catalogos/esquemas.test.ts
import { describe, expect, it } from 'vitest'
import { esquemaEmpresa, esquemaEquipo, esquemaFirmante, esquemaNombrePlantilla } from './esquemas'

describe('esquemaEmpresa', () => {
  const base = {
    razon_social: 'Equipos Patagónicos',
    cuit: '',
    direccion: 'T. Planas 5168',
    ciudad: 'Neuquén',
    provincia: 'Neuquén',
    telefono: '0299 - 6019931',
    email: 'equipos@equipospatagonicos.com.ar',
    web: 'www.equipospatagonicos.com.ar',
    indice_base: 'junio 2026',
    proxima_actualizacion: 'noviembre de 2026',
  }

  it('acepta los datos reales con CUIT vacío', () => {
    expect(esquemaEmpresa.parse(base).cuit).toBeNull()
  })

  it('exige razón social y valida CUIT y email', () => {
    const resultado = esquemaEmpresa.safeParse({ ...base, razon_social: ' ', cuit: '1', email: 'x' })
    expect(resultado.error?.issues.map((i) => i.path[0])).toEqual(expect.arrayContaining(['razon_social', 'cuit', 'email']))
  })
})

describe('esquemaFirmante', () => {
  it('exige nombre', () => {
    expect(esquemaFirmante.safeParse({ nombre: '', cargo: '', telefono: '', email: '' }).success).toBe(false)
  })
})

describe('esquemaEquipo', () => {
  const base = { nombre: 'Grúa 70 TN', capacidad_tn: '', marca: '', modelo: '', identificacion: '', descripcion: '' }

  it('interpreta la capacidad al estilo argentino y la deja opcional', () => {
    expect(esquemaEquipo.parse({ ...base, capacidad_tn: '60,5' }).capacidad_tn).toBe(60.5)
    expect(esquemaEquipo.parse(base).capacidad_tn).toBeNull()
  })

  it('rechaza capacidades no positivas o ilegibles', () => {
    for (const capacidad_tn of ['0', '-3', 'mucho']) {
      const resultado = esquemaEquipo.safeParse({ ...base, capacidad_tn })
      expect(resultado.error?.issues[0]?.message).toBe('Ingresá una capacidad en toneladas mayor a 0')
    }
  })
})

describe('esquemaNombrePlantilla', () => {
  it('exige un nombre de hasta 100 caracteres', () => {
    expect(esquemaNombrePlantilla.safeParse({ nombre: '' }).success).toBe(false)
    expect(esquemaNombrePlantilla.safeParse({ nombre: 'x'.repeat(101) }).success).toBe(false)
    expect(esquemaNombrePlantilla.parse({ nombre: ' Mensual ' }).nombre).toBe('Mensual')
  })
})
```

```bash
npx vitest run src/lib/clientes src/lib/catalogos
```

Expected: FAIL porque no se resuelven `./esquemas`.

- [ ] **Step 2: Implementar**

```ts
// src/lib/clientes/esquemas.ts
import { z } from 'zod'
import { cuitOpcional, emailOpcional, textoOpcional, textoRequerido } from '@/lib/validacion'

export const CONDICIONES_IVA = {
  responsable_inscripto: 'Responsable inscripto',
  monotributo: 'Monotributo',
  exento: 'Exento',
  consumidor_final: 'Consumidor final',
} as const

const VALORES_IVA = ['responsable_inscripto', 'monotributo', 'exento', 'consumidor_final'] as const

export const CAMPOS_CLIENTE = [
  'razon_social',
  'cuit',
  'condicion_iva',
  'direccion',
  'localidad',
  'provincia',
  'telefono',
  'email',
  'condicion_pago',
  'notas',
] as const
export type CampoCliente = (typeof CAMPOS_CLIENTE)[number]

export const esquemaCliente = z.object({
  razon_social: textoRequerido('Ingresá la razón social'),
  cuit: cuitOpcional,
  condicion_iva: z
    .union([z.enum(VALORES_IVA, { error: 'Elegí una condición de IVA válida' }), z.literal('')])
    .transform((valor) => (valor === '' ? null : valor)),
  direccion: textoOpcional(),
  localidad: textoOpcional(100),
  provincia: textoOpcional(100),
  telefono: textoOpcional(100),
  email: emailOpcional,
  condicion_pago: textoOpcional(),
  notas: textoOpcional(2000),
})

export const CAMPOS_CONTACTO = ['nombre', 'cargo', 'email', 'telefono'] as const
export type CampoContacto = (typeof CAMPOS_CONTACTO)[number]

export const esquemaContacto = z.object({
  nombre: textoRequerido('Ingresá el nombre', 150),
  cargo: textoOpcional(150),
  email: emailOpcional,
  telefono: textoOpcional(100),
})
```

```ts
// src/lib/catalogos/esquemas.ts
import { z } from 'zod'
import { cuitOpcional, emailOpcional, numeroPositivoOpcional, textoOpcional, textoRequerido } from '@/lib/validacion'

export const CAMPOS_EMPRESA = [
  'razon_social',
  'cuit',
  'direccion',
  'ciudad',
  'provincia',
  'telefono',
  'email',
  'web',
  'indice_base',
  'proxima_actualizacion',
] as const
export type CampoEmpresa = (typeof CAMPOS_EMPRESA)[number]

export const esquemaEmpresa = z.object({
  razon_social: textoRequerido('Ingresá la razón social'),
  cuit: cuitOpcional,
  direccion: textoOpcional(),
  ciudad: textoOpcional(100),
  provincia: textoOpcional(100),
  telefono: textoOpcional(100),
  email: emailOpcional,
  web: textoOpcional(),
  indice_base: textoOpcional(100),
  proxima_actualizacion: textoOpcional(100),
})

export const CAMPOS_FIRMANTE = ['nombre', 'cargo', 'telefono', 'email'] as const
export type CampoFirmante = (typeof CAMPOS_FIRMANTE)[number]

export const esquemaFirmante = z.object({
  nombre: textoRequerido('Ingresá el nombre', 150),
  cargo: textoOpcional(150),
  telefono: textoOpcional(100),
  email: emailOpcional,
})

export const CAMPOS_EQUIPO = ['nombre', 'capacidad_tn', 'marca', 'modelo', 'identificacion', 'descripcion'] as const
export type CampoEquipo = (typeof CAMPOS_EQUIPO)[number]

export const esquemaEquipo = z.object({
  nombre: textoRequerido('Ingresá el nombre del equipo', 150),
  capacidad_tn: numeroPositivoOpcional('Ingresá una capacidad en toneladas mayor a 0'),
  marca: textoOpcional(100),
  modelo: textoOpcional(100),
  identificacion: textoOpcional(100),
  descripcion: textoOpcional(2000),
})

export const esquemaNombrePlantilla = z.object({
  nombre: textoRequerido('Ingresá el nombre de la plantilla', 100),
})
```

```bash
npx vitest run src/lib/clientes src/lib/catalogos
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
npm run check
git add src/lib/clientes src/lib/catalogos
git commit -m "feat: esquemas de validación de clientes y catálogos

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 10: Componentes de formulario y pantallas de clientes

**Files:**
- Create: `src/components/ui/{textarea,native-select,dialog,alert-dialog,table}.tsx` (shadcn)
- Create: `src/components/formulario/campo.tsx`, `mensaje-formulario.tsx`, `formulario-accion.tsx`, `dialogo-formulario.tsx`, `boton-estado.tsx`
- Create: `src/components/clientes/campos-cliente.tsx`, `cliente-form.tsx`, `contactos.tsx`, `tabla-clientes.tsx`
- Create: `src/app/(app)/clientes/actions.ts`, `src/app/(app)/clientes/nuevo/page.tsx`, `src/app/(app)/clientes/[id]/page.tsx`
- Modify: `src/app/(app)/clientes/page.tsx`

- [ ] **Step 1: Componentes de shadcn**

```bash
npx --yes shadcn@4.22.1 add --yes textarea native-select dialog alert-dialog table
grep -n 'sr-only">Close' src/components/ui/dialog.tsx
```

En `src/components/ui/dialog.tsx`, reemplazar `<span className="sr-only">Close</span>` por `<span className="sr-only">Cerrar</span>`. Verificar el lock (ver Convenciones).

- [ ] **Step 2: Componentes de formulario**

```tsx
// src/components/formulario/campo.tsx
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export function Campo({
  id,
  etiqueta,
  error,
  ayuda,
  className,
  children,
}: {
  id: string
  etiqueta: string
  error?: string
  ayuda?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id}>{etiqueta}</Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : ayuda ? (
        <p className="text-xs text-muted-foreground">{ayuda}</p>
      ) : null}
    </div>
  )
}
```

```tsx
// src/components/formulario/mensaje-formulario.tsx
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { EstadoFormulario } from '@/lib/formularios'

/** Muestra el error general del formulario. Los éxitos se avisan con un toast. */
export function MensajeFormulario({ estado }: { estado: EstadoFormulario }) {
  if (estado.ok || !estado.mensaje) return null
  return (
    <Alert variant="destructive">
      <AlertDescription>{estado.mensaje}</AlertDescription>
    </Alert>
  )
}
```

```tsx
// src/components/formulario/formulario-accion.tsx
'use client'

import { useActionState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ESTADO_INICIAL, type AccionFormulario, type EstadoFormulario } from '@/lib/formularios'
import { cn } from '@/lib/utils'
import { MensajeFormulario } from './mensaje-formulario'

/**
 * Formulario conectado a una Server Action: muestra errores, conserva lo escrito si falla,
 * avisa el éxito con un toast y deshabilita el botón mientras guarda.
 */
export function FormularioAccion({
  accion,
  textoBoton,
  className,
  soloLectura = false,
  alGuardar,
  children,
}: {
  accion: AccionFormulario
  textoBoton: string
  className?: string
  soloLectura?: boolean
  alGuardar?: () => void
  children: (estado: EstadoFormulario) => React.ReactNode
}) {
  const [estado, despachar, pendiente] = useActionState(
    async (previo: EstadoFormulario, formData: FormData) => {
      const resultado = await accion(previo, formData)
      if (resultado.ok) {
        if (resultado.mensaje) toast.success(resultado.mensaje)
        alGuardar?.()
      }
      return resultado
    },
    ESTADO_INICIAL,
  )

  return (
    <form action={despachar} noValidate className="space-y-4">
      <fieldset disabled={soloLectura || pendiente} className={cn('min-w-0', className)}>
        {children(estado)}
      </fieldset>
      <MensajeFormulario estado={estado} />
      {soloLectura ? null : (
        <Button type="submit" disabled={pendiente}>
          {pendiente ? 'Guardando…' : textoBoton}
        </Button>
      )}
    </form>
  )
}
```

```tsx
// src/components/formulario/dialogo-formulario.tsx
'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import type { AccionFormulario, EstadoFormulario } from '@/lib/formularios'
import { FormularioAccion } from './formulario-accion'

/** Diálogo con un formulario adentro. Se cierra solo cuando la acción sale bien. */
export function DialogoFormulario({
  titulo,
  descripcion,
  disparador,
  accion,
  textoBoton,
  children,
}: {
  titulo: string
  descripcion?: string
  disparador: React.ReactNode
  accion: AccionFormulario
  textoBoton: string
  children: (estado: EstadoFormulario) => React.ReactNode
}) {
  const [abierto, setAbierto] = useState(false)

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>{disparador}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {descripcion ? <DialogDescription>{descripcion}</DialogDescription> : null}
        </DialogHeader>
        {/* Se monta solo abierto: cada apertura arranca con el estado limpio. */}
        {abierto ? (
          <FormularioAccion
            accion={accion}
            textoBoton={textoBoton}
            className="space-y-4"
            alGuardar={() => setAbierto(false)}
          >
            {children}
          </FormularioAccion>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
```

```tsx
// src/components/formulario/boton-estado.tsx
import { Button } from '@/components/ui/button'

/** Botón Activar/Desactivar que envía una Server Action ya ligada al registro. */
export function BotonEstado({
  activo,
  accion,
  etiqueta,
}: {
  activo: boolean
  accion: () => Promise<void>
  etiqueta: string
}) {
  return (
    <form action={accion}>
      <Button type="submit" variant="ghost" size="sm" aria-label={`${activo ? 'Desactivar' : 'Activar'} ${etiqueta}`}>
        {activo ? 'Desactivar' : 'Activar'}
      </Button>
    </form>
  )
}
```

- [ ] **Step 3: Server Actions de clientes**

```ts
// src/app/(app)/clientes/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUsuario } from '@/lib/auth'
import { CAMPOS_CLIENTE, CAMPOS_CONTACTO, esquemaCliente, esquemaContacto } from '@/lib/clientes/esquemas'
import {
  exito,
  falloBase,
  falloValidacion,
  leerCampos,
  mensajeErrorBase,
  type EstadoFormulario,
} from '@/lib/formularios'
import { createClient } from '@/lib/supabase/server'
import { esUuid } from '@/lib/validacion'

const CUIT_REPETIDO = { campo: 'cuit', mensaje: 'Ya existe un cliente con ese CUIT' }

function exigirUuid(...ids: string[]) {
  if (!ids.every(esUuid)) throw new Error('Identificador inválido')
}

export async function crearCliente(_previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  await requireUsuario()
  const valores = leerCampos(formData, CAMPOS_CLIENTE)
  const datos = esquemaCliente.safeParse(valores)
  if (!datos.success) return falloValidacion(datos.error, valores)

  const supabase = await createClient()
  const { data, error } = await supabase.from('clientes').insert(datos.data).select('id').single()
  if (error) return falloBase(error, valores, CUIT_REPETIDO)

  revalidatePath('/clientes')
  redirect(`/clientes/${data.id}`)
}

export async function actualizarCliente(
  id: string,
  _previo: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await requireUsuario()
  exigirUuid(id)
  const valores = leerCampos(formData, CAMPOS_CLIENTE)
  const datos = esquemaCliente.safeParse(valores)
  if (!datos.success) return falloValidacion(datos.error, valores)

  const supabase = await createClient()
  const { error } = await supabase.from('clientes').update(datos.data).eq('id', id)
  if (error) return falloBase(error, valores, CUIT_REPETIDO)

  revalidatePath('/clientes')
  revalidatePath(`/clientes/${id}`)
  return exito('Cliente guardado')
}

export async function cambiarEstadoCliente(id: string, activo: boolean): Promise<void> {
  await requireUsuario()
  exigirUuid(id)
  const supabase = await createClient()
  const { error } = await supabase.from('clientes').update({ activo }).eq('id', id)
  if (error) throw new Error(mensajeErrorBase(error))
  revalidatePath('/clientes')
  revalidatePath(`/clientes/${id}`)
}

export async function crearContacto(
  clienteId: string,
  _previo: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await requireUsuario()
  exigirUuid(clienteId)
  const valores = leerCampos(formData, CAMPOS_CONTACTO)
  const datos = esquemaContacto.safeParse(valores)
  if (!datos.success) return falloValidacion(datos.error, valores)

  const supabase = await createClient()
  const { error } = await supabase.from('contactos').insert({ ...datos.data, cliente_id: clienteId })
  if (error) return falloBase(error, valores)

  revalidatePath(`/clientes/${clienteId}`)
  return exito('Contacto agregado')
}

export async function actualizarContacto(
  clienteId: string,
  contactoId: string,
  _previo: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await requireUsuario()
  exigirUuid(clienteId, contactoId)
  const valores = leerCampos(formData, CAMPOS_CONTACTO)
  const datos = esquemaContacto.safeParse(valores)
  if (!datos.success) return falloValidacion(datos.error, valores)

  const supabase = await createClient()
  const { error } = await supabase
    .from('contactos')
    .update(datos.data)
    .eq('id', contactoId)
    .eq('cliente_id', clienteId)
  if (error) return falloBase(error, valores)

  revalidatePath(`/clientes/${clienteId}`)
  return exito('Contacto guardado')
}

export async function borrarContacto(clienteId: string, contactoId: string): Promise<void> {
  await requireUsuario()
  exigirUuid(clienteId, contactoId)
  const supabase = await createClient()
  const { error } = await supabase.from('contactos').delete().eq('id', contactoId).eq('cliente_id', clienteId)
  if (error) throw new Error(mensajeErrorBase(error))
  revalidatePath(`/clientes/${clienteId}`)
}
```

- [ ] **Step 4: Componentes de clientes**

```tsx
// src/components/clientes/campos-cliente.tsx
import { Campo } from '@/components/formulario/campo'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { CONDICIONES_IVA, type CampoCliente } from '@/lib/clientes/esquemas'
import { valorCampo, type EstadoFormulario } from '@/lib/formularios'

export type ValoresCliente = Partial<Record<CampoCliente, string | null>>

export function CamposCliente({ estado, inicial }: { estado: EstadoFormulario; inicial?: ValoresCliente }) {
  const valor = (campo: CampoCliente) => valorCampo(estado, inicial, campo)
  const error = (campo: CampoCliente) => estado.errores[campo]
  const texto = (campo: CampoCliente, etiqueta: string, props: React.ComponentProps<typeof Input> = {}) => (
    <Campo id={campo} etiqueta={etiqueta} error={error(campo)}>
      <Input id={campo} name={campo} defaultValue={valor(campo)} aria-invalid={Boolean(error(campo))} {...props} />
    </Campo>
  )

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Campo id="razon_social" etiqueta="Razón social" error={error('razon_social')} className="sm:col-span-2">
        <Input
          id="razon_social"
          name="razon_social"
          defaultValue={valor('razon_social')}
          aria-invalid={Boolean(error('razon_social'))}
          autoComplete="organization"
        />
      </Campo>
      <Campo id="cuit" etiqueta="CUIT" error={error('cuit')} ayuda="Opcional para cotizar. Con o sin guiones.">
        <Input id="cuit" name="cuit" inputMode="numeric" defaultValue={valor('cuit')} aria-invalid={Boolean(error('cuit'))} />
      </Campo>
      <Campo id="condicion_iva" etiqueta="Condición frente al IVA" error={error('condicion_iva')}>
        <NativeSelect id="condicion_iva" name="condicion_iva" defaultValue={valor('condicion_iva')} className="w-full">
          <NativeSelectOption value="">Sin especificar</NativeSelectOption>
          {Object.entries(CONDICIONES_IVA).map(([clave, etiqueta]) => (
            <NativeSelectOption key={clave} value={clave}>
              {etiqueta}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Campo>
      {texto('email', 'Email', { type: 'email', autoComplete: 'email' })}
      {texto('telefono', 'Teléfono', { type: 'tel' })}
      {texto('direccion', 'Dirección')}
      {texto('localidad', 'Localidad')}
      {texto('provincia', 'Provincia')}
      {texto('condicion_pago', 'Condición de pago habitual', { placeholder: 'Ej.: 30 - 45 días F.F.' })}
      <Campo id="notas" etiqueta="Notas" error={error('notas')} className="sm:col-span-2">
        <Textarea id="notas" name="notas" rows={3} defaultValue={valor('notas')} />
      </Campo>
    </div>
  )
}
```

```tsx
// src/components/clientes/cliente-form.tsx
'use client'

import { FormularioAccion } from '@/components/formulario/formulario-accion'
import type { AccionFormulario } from '@/lib/formularios'
import { CamposCliente, type ValoresCliente } from './campos-cliente'

export function ClienteForm({
  accion,
  inicial,
  textoBoton,
}: {
  accion: AccionFormulario
  inicial?: ValoresCliente
  textoBoton: string
}) {
  return (
    <FormularioAccion accion={accion} textoBoton={textoBoton} className="max-w-3xl">
      {(estado) => <CamposCliente estado={estado} inicial={inicial} />}
    </FormularioAccion>
  )
}
```

```tsx
// src/components/clientes/contactos.tsx
'use client'

import { Mail, Pencil, Phone, Plus, Trash2 } from 'lucide-react'
import { Campo } from '@/components/formulario/campo'
import { DialogoFormulario } from '@/components/formulario/dialogo-formulario'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { CampoContacto } from '@/lib/clientes/esquemas'
import { valorCampo, type AccionFormulario, type EstadoFormulario } from '@/lib/formularios'

export type ContactoConAcciones = {
  id: string
  nombre: string
  cargo: string
  email: string
  telefono: string
  actualizar: AccionFormulario
  borrar: () => Promise<void>
}

function CamposContacto({ estado, inicial }: { estado: EstadoFormulario; inicial?: Partial<Record<CampoContacto, string>> }) {
  const campo = (nombre: CampoContacto, etiqueta: string, props: React.ComponentProps<typeof Input> = {}) => (
    <Campo id={`contacto-${nombre}`} etiqueta={etiqueta} error={estado.errores[nombre]}>
      <Input
        id={`contacto-${nombre}`}
        name={nombre}
        defaultValue={valorCampo(estado, inicial, nombre)}
        aria-invalid={Boolean(estado.errores[nombre])}
        {...props}
      />
    </Campo>
  )
  return (
    <div className="space-y-4">
      {campo('nombre', 'Nombre')}
      {campo('cargo', 'Cargo')}
      {campo('email', 'Email', { type: 'email' })}
      {campo('telefono', 'Teléfono', { type: 'tel' })}
    </div>
  )
}

function BorrarContacto({ nombre, accion }: { nombre: string; accion: () => Promise<void> }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Borrar a ${nombre}`}>
          <Trash2 className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Borrar a {nombre}?</AlertDialogTitle>
          <AlertDialogDescription>Se quita el contacto de este cliente. No se puede deshacer.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          {/* Botón común (no AlertDialogAction): si el diálogo se cerrara al hacer clic, el form se desmontaría antes de enviarse. */}
          <form action={accion}>
            <Button type="submit" variant="destructive">
              Borrar
            </Button>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function Contactos({ contactos, crear }: { contactos: ContactoConAcciones[]; crear: AccionFormulario }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Contactos</h2>
        <DialogoFormulario
          titulo="Nuevo contacto"
          accion={crear}
          textoBoton="Guardar contacto"
          disparador={
            <Button variant="outline" size="sm">
              <Plus className="size-4" aria-hidden />
              Agregar contacto
            </Button>
          }
        >
          {(estado) => <CamposContacto estado={estado} />}
        </DialogoFormulario>
      </div>

      {contactos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin contactos. El contacto es el &quot;Atte.&quot; de la cotización.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {contactos.map((contacto) => (
            <li key={contacto.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <p className="font-medium">{contacto.nombre}</p>
                <p className="flex flex-wrap gap-x-4 text-sm text-muted-foreground">
                  {contacto.cargo ? <span>{contacto.cargo}</span> : null}
                  {contacto.email ? (
                    <a className="inline-flex items-center gap-1 hover:underline" href={`mailto:${contacto.email}`}>
                      <Mail className="size-3" aria-hidden />
                      {contacto.email}
                    </a>
                  ) : null}
                  {contacto.telefono ? (
                    <a className="inline-flex items-center gap-1 hover:underline" href={`tel:${contacto.telefono}`}>
                      <Phone className="size-3" aria-hidden />
                      {contacto.telefono}
                    </a>
                  ) : null}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <DialogoFormulario
                  titulo={`Editar a ${contacto.nombre}`}
                  accion={contacto.actualizar}
                  textoBoton="Guardar contacto"
                  disparador={
                    <Button variant="ghost" size="icon" aria-label={`Editar a ${contacto.nombre}`}>
                      <Pencil className="size-4" />
                    </Button>
                  }
                >
                  {(estado) => <CamposContacto estado={estado} inicial={contacto} />}
                </DialogoFormulario>
                <BorrarContacto nombre={contacto.nombre} accion={contacto.borrar} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
```

```tsx
// src/components/clientes/tabla-clientes.tsx
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCuit } from '@/lib/cuit'

type FilaCliente = { id: string; razon_social: string; cuit: string | null; localidad: string; activo: boolean }

export function TablaClientes({ clientes }: { clientes: FilaCliente[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Razón social</TableHead>
          <TableHead>CUIT</TableHead>
          <TableHead className="hidden sm:table-cell">Localidad</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {clientes.map((cliente) => (
          <TableRow key={cliente.id}>
            <TableCell className="font-medium">
              <Link href={`/clientes/${cliente.id}`} className="hover:underline">
                {cliente.razon_social}
              </Link>
              {cliente.activo ? null : (
                <Badge variant="secondary" className="ml-2">
                  Inactivo
                </Badge>
              )}
            </TableCell>
            <TableCell className="tabular-nums">{cliente.cuit ? formatCuit(cliente.cuit) : '—'}</TableCell>
            <TableCell className="hidden sm:table-cell">{cliente.localidad || '—'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
```

- [ ] **Step 5: Páginas**

```tsx
// src/app/(app)/clientes/page.tsx
import { Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { TablaClientes } from '@/components/clientes/tabla-clientes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Clientes' }

export default async function ClientesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = '' } = await searchParams
  const supabase = await createClient()
  const { data: clientes, error } = await supabase.rpc('buscar_clientes', { texto: q, limite: 200 })
  if (error) throw error

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
        <Button asChild>
          <Link href="/clientes/nuevo">
            <Plus className="size-4" aria-hidden />
            Nuevo cliente
          </Link>
        </Button>
      </div>

      <form role="search" className="flex max-w-md gap-2">
        <Input name="q" defaultValue={q} placeholder="Razón social, CUIT o contacto" aria-label="Buscar clientes" />
        <Button type="submit" variant="secondary">
          Buscar
        </Button>
      </form>

      {clientes.length === 0 ? (
        <p className="text-muted-foreground">
          {q ? `No hay clientes que coincidan con "${q}".` : 'Todavía no hay clientes cargados.'}
        </p>
      ) : (
        <TablaClientes clientes={clientes} />
      )}
    </section>
  )
}
```

```tsx
// src/app/(app)/clientes/nuevo/page.tsx
import type { Metadata } from 'next'
import { ClienteForm } from '@/components/clientes/cliente-form'
import { crearCliente } from '../actions'

export const metadata: Metadata = { title: 'Nuevo cliente' }

export default function NuevoClientePage() {
  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Nuevo cliente</h1>
      <ClienteForm accion={crearCliente} textoBoton="Crear cliente" />
    </section>
  )
}
```

```tsx
// src/app/(app)/clientes/[id]/page.tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ClienteForm } from '@/components/clientes/cliente-form'
import { Contactos } from '@/components/clientes/contactos'
import { BotonEstado } from '@/components/formulario/boton-estado'
import { Badge } from '@/components/ui/badge'
import { formatCuit } from '@/lib/cuit'
import { createClient } from '@/lib/supabase/server'
import { esUuid } from '@/lib/validacion'
import { actualizarCliente, actualizarContacto, borrarContacto, cambiarEstadoCliente, crearContacto } from '../actions'

export const metadata: Metadata = { title: 'Cliente' }

export default async function ClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!esUuid(id)) notFound()

  const supabase = await createClient()
  const { data: cliente, error } = await supabase
    .from('clientes')
    .select('*, contactos(id, nombre, cargo, email, telefono)')
    .eq('id', id)
    .order('nombre', { referencedTable: 'contactos' })
    .maybeSingle()
  if (error) throw error
  if (!cliente) notFound()

  const contactos = cliente.contactos.map((contacto) => ({
    ...contacto,
    actualizar: actualizarContacto.bind(null, id, contacto.id),
    borrar: borrarContacto.bind(null, id, contacto.id),
  }))

  return (
    <section className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{cliente.razon_social}</h1>
          {cliente.activo ? null : <Badge variant="secondary">Inactivo</Badge>}
        </div>
        <BotonEstado
          activo={cliente.activo}
          etiqueta={cliente.razon_social}
          accion={cambiarEstadoCliente.bind(null, id, !cliente.activo)}
        />
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Datos</h2>
        <ClienteForm
          accion={actualizarCliente.bind(null, id)}
          inicial={{ ...cliente, cuit: cliente.cuit ? formatCuit(cliente.cuit) : '' }}
          textoBoton="Guardar cambios"
        />
      </section>

      <Contactos contactos={contactos} crear={crearContacto.bind(null, id)} />
    </section>
  )
}
```

- [ ] **Step 6: Verificar a mano y commit**

```bash
npm run check && npm run build
```

Levantar `npm run dev` con un usuario creado (`npm run usuario:crear …`) y recorrer: crear un cliente con CUIT inválido (aparece el error y no se pierde lo escrito), crear uno válido, editar, agregar/editar/borrar contactos, buscar "vertice" sin acento y desactivar. Matar el dev server.

```bash
git add -A
git commit -m "feat: pantallas de clientes con contactos y búsqueda

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 11: Configuración — índice, empresa y firmantes

**Files:**
- Create: `src/app/(app)/configuracion/actions.ts`, `src/app/(app)/configuracion/empresa/page.tsx`, `src/app/(app)/configuracion/firmantes/page.tsx`, `src/components/configuracion/empresa-form.tsx`, `src/components/configuracion/firmantes.tsx`
- Modify: `src/app/(app)/configuracion/page.tsx`

- [ ] **Step 1: Server Actions de configuración**

```ts
// src/app/(app)/configuracion/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { requireUsuario } from '@/lib/auth'
import {
  CAMPOS_EMPRESA,
  CAMPOS_EQUIPO,
  CAMPOS_FIRMANTE,
  esquemaEmpresa,
  esquemaEquipo,
  esquemaFirmante,
  esquemaNombrePlantilla,
} from '@/lib/catalogos/esquemas'
import {
  exito,
  falloBase,
  falloValidacion,
  leerCampos,
  mensajeErrorBase,
  type EstadoFormulario,
} from '@/lib/formularios'
import { createClient } from '@/lib/supabase/server'
import { esUuid } from '@/lib/validacion'

function exigirUuid(id: string) {
  if (!esUuid(id)) throw new Error('Identificador inválido')
}

export async function actualizarEmpresa(_previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const usuario = await requireUsuario()
  const valores = leerCampos(formData, CAMPOS_EMPRESA)
  if (usuario.rol !== 'admin') return { ok: false, mensaje: 'Solo un administrador puede cambiar estos datos', errores: {}, valores }
  const datos = esquemaEmpresa.safeParse(valores)
  if (!datos.success) return falloValidacion(datos.error, valores)

  const supabase = await createClient()
  const { error } = await supabase.from('empresa_config').update(datos.data).eq('id', true)
  if (error) return falloBase(error, valores)

  revalidatePath('/configuracion/empresa')
  return exito('Datos de la empresa guardados')
}

export async function crearFirmante(_previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  await requireUsuario()
  const valores = leerCampos(formData, CAMPOS_FIRMANTE)
  const datos = esquemaFirmante.safeParse(valores)
  if (!datos.success) return falloValidacion(datos.error, valores)

  const supabase = await createClient()
  const { error } = await supabase.from('firmantes').insert(datos.data)
  if (error) return falloBase(error, valores)

  revalidatePath('/configuracion/firmantes')
  return exito('Firmante agregado')
}

export async function actualizarFirmante(
  id: string,
  _previo: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await requireUsuario()
  exigirUuid(id)
  const valores = leerCampos(formData, CAMPOS_FIRMANTE)
  const datos = esquemaFirmante.safeParse(valores)
  if (!datos.success) return falloValidacion(datos.error, valores)

  const supabase = await createClient()
  const { error } = await supabase.from('firmantes').update(datos.data).eq('id', id)
  if (error) return falloBase(error, valores)

  revalidatePath('/configuracion/firmantes')
  return exito('Firmante guardado')
}

export async function cambiarEstadoFirmante(id: string, activo: boolean): Promise<void> {
  await requireUsuario()
  exigirUuid(id)
  const supabase = await createClient()
  const { error } = await supabase.from('firmantes').update({ activo }).eq('id', id)
  if (error) throw new Error(mensajeErrorBase(error))
  revalidatePath('/configuracion/firmantes')
}

export async function crearEquipo(_previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  await requireUsuario()
  const valores = leerCampos(formData, CAMPOS_EQUIPO)
  const datos = esquemaEquipo.safeParse(valores)
  if (!datos.success) return falloValidacion(datos.error, valores)

  const supabase = await createClient()
  const { error } = await supabase.from('equipos').insert(datos.data)
  if (error) return falloBase(error, valores)

  revalidatePath('/configuracion/equipos')
  return exito('Equipo agregado')
}

export async function actualizarEquipo(
  id: string,
  _previo: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await requireUsuario()
  exigirUuid(id)
  const valores = leerCampos(formData, CAMPOS_EQUIPO)
  const datos = esquemaEquipo.safeParse(valores)
  if (!datos.success) return falloValidacion(datos.error, valores)

  const supabase = await createClient()
  const { error } = await supabase.from('equipos').update(datos.data).eq('id', id)
  if (error) return falloBase(error, valores)

  revalidatePath('/configuracion/equipos')
  return exito('Equipo guardado')
}

export async function cambiarEstadoEquipo(id: string, activo: boolean): Promise<void> {
  await requireUsuario()
  exigirUuid(id)
  const supabase = await createClient()
  const { error } = await supabase.from('equipos').update({ activo }).eq('id', id)
  if (error) throw new Error(mensajeErrorBase(error))
  revalidatePath('/configuracion/equipos')
}

export async function renombrarPlantilla(
  id: string,
  _previo: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await requireUsuario()
  exigirUuid(id)
  const valores = leerCampos(formData, ['nombre'] as const)
  const datos = esquemaNombrePlantilla.safeParse(valores)
  if (!datos.success) return falloValidacion(datos.error, valores)

  const supabase = await createClient()
  const { error } = await supabase.from('plantillas').update(datos.data).eq('id', id)
  if (error) return falloBase(error, valores, { campo: 'nombre', mensaje: 'Ya existe una plantilla con ese nombre' })

  revalidatePath('/configuracion/plantillas')
  revalidatePath(`/configuracion/plantillas/${id}`)
  return exito('Plantilla renombrada')
}

export async function cambiarEstadoPlantilla(id: string, activa: boolean): Promise<void> {
  await requireUsuario()
  exigirUuid(id)
  const supabase = await createClient()
  const { error } = await supabase.from('plantillas').update({ activa }).eq('id', id)
  if (error) throw new Error(mensajeErrorBase(error))
  revalidatePath('/configuracion/plantillas')
}
```

- [ ] **Step 2: Índice de configuración**

```tsx
// src/app/(app)/configuracion/page.tsx
import { Building2, FileStack, PenLine, Truck } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const metadata: Metadata = { title: 'Configuración' }

const SECCIONES = [
  { href: '/configuracion/empresa', titulo: 'Empresa', descripcion: 'Membrete, contacto e índice de actualización vigente.', icono: Building2 },
  { href: '/configuracion/firmantes', titulo: 'Firmantes', descripcion: 'Quiénes firman las cotizaciones.', icono: PenLine },
  { href: '/configuracion/equipos', titulo: 'Equipos', descripcion: 'Grúas que se ofrecen en las cotizaciones.', icono: Truck },
  { href: '/configuracion/plantillas', titulo: 'Plantillas', descripcion: 'Textos e ítems de las cotizaciones mensual y por jornada.', icono: FileStack },
]

export default function ConfiguracionPage() {
  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Configuración</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {SECCIONES.map(({ href, titulo, descripcion, icono: Icono }) => (
          <Link key={href} href={href} className="rounded-xl focus-visible:outline-2 focus-visible:outline-ring">
            <Card className="h-full transition-colors hover:bg-muted/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Icono className="size-4 text-primary" aria-hidden />
                  {titulo}
                </CardTitle>
                <CardDescription>{descripcion}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Empresa**

```tsx
// src/components/configuracion/empresa-form.tsx
'use client'

import { Campo } from '@/components/formulario/campo'
import { FormularioAccion } from '@/components/formulario/formulario-accion'
import { Input } from '@/components/ui/input'
import type { CampoEmpresa } from '@/lib/catalogos/esquemas'
import { valorCampo, type AccionFormulario } from '@/lib/formularios'

const CAMPOS: { campo: CampoEmpresa; etiqueta: string; ayuda?: string }[] = [
  { campo: 'razon_social', etiqueta: 'Razón social' },
  { campo: 'cuit', etiqueta: 'CUIT' },
  { campo: 'direccion', etiqueta: 'Dirección' },
  { campo: 'ciudad', etiqueta: 'Ciudad', ayuda: 'Se usa en la fecha de las cotizaciones: "Neuquén, 22 de octubre de 2026."' },
  { campo: 'provincia', etiqueta: 'Provincia' },
  { campo: 'telefono', etiqueta: 'Teléfono' },
  { campo: 'email', etiqueta: 'Email' },
  { campo: 'web', etiqueta: 'Web' },
  { campo: 'indice_base', etiqueta: 'Mes base del índice FADEEAC', ayuda: 'Ej.: junio 2026' },
  { campo: 'proxima_actualizacion', etiqueta: 'Próxima actualización de tarifas', ayuda: 'Ej.: noviembre de 2026' },
]

export function EmpresaForm({
  accion,
  inicial,
  soloLectura,
}: {
  accion: AccionFormulario
  inicial: Partial<Record<CampoEmpresa, string | null>>
  soloLectura: boolean
}) {
  return (
    <FormularioAccion accion={accion} textoBoton="Guardar" soloLectura={soloLectura} className="grid max-w-3xl gap-4 sm:grid-cols-2">
      {(estado) =>
        CAMPOS.map(({ campo, etiqueta, ayuda }) => (
          <Campo key={campo} id={campo} etiqueta={etiqueta} ayuda={ayuda} error={estado.errores[campo]}>
            <Input id={campo} name={campo} defaultValue={valorCampo(estado, inicial, campo)} aria-invalid={Boolean(estado.errores[campo])} />
          </Campo>
        ))
      }
    </FormularioAccion>
  )
}
```

```tsx
// src/app/(app)/configuracion/empresa/page.tsx
import type { Metadata } from 'next'
import { EmpresaForm } from '@/components/configuracion/empresa-form'
import { requireUsuario } from '@/lib/auth'
import { formatCuit } from '@/lib/cuit'
import { createClient } from '@/lib/supabase/server'
import { actualizarEmpresa } from '../actions'

export const metadata: Metadata = { title: 'Empresa' }

export default async function EmpresaPage() {
  const usuario = await requireUsuario()
  const supabase = await createClient()
  const { data: empresa, error } = await supabase.from('empresa_config').select('*').single()
  if (error) throw error

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Empresa</h1>
        {usuario.rol === 'admin' ? null : (
          <p className="text-sm text-muted-foreground">Solo un administrador puede modificar estos datos.</p>
        )}
      </div>
      <EmpresaForm
        accion={actualizarEmpresa}
        inicial={{ ...empresa, cuit: empresa.cuit ? formatCuit(empresa.cuit) : '' }}
        soloLectura={usuario.rol !== 'admin'}
      />
    </section>
  )
}
```

- [ ] **Step 4: Firmantes**

```tsx
// src/components/configuracion/firmantes.tsx
'use client'

import { Pencil, Plus } from 'lucide-react'
import { Campo } from '@/components/formulario/campo'
import { DialogoFormulario } from '@/components/formulario/dialogo-formulario'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { CampoFirmante } from '@/lib/catalogos/esquemas'
import { valorCampo, type AccionFormulario, type EstadoFormulario } from '@/lib/formularios'

export type FirmanteConAcciones = {
  id: string
  nombre: string
  cargo: string
  telefono: string
  email: string
  activo: boolean
  actualizar: AccionFormulario
  boton: React.ReactNode
}

function CamposFirmante({ estado, inicial }: { estado: EstadoFormulario; inicial?: Partial<Record<CampoFirmante, string>> }) {
  const campo = (nombre: CampoFirmante, etiqueta: string) => (
    <Campo id={`firmante-${nombre}`} etiqueta={etiqueta} error={estado.errores[nombre]}>
      <Input
        id={`firmante-${nombre}`}
        name={nombre}
        defaultValue={valorCampo(estado, inicial, nombre)}
        aria-invalid={Boolean(estado.errores[nombre])}
      />
    </Campo>
  )
  return (
    <div className="space-y-4">
      {campo('nombre', 'Nombre')}
      {campo('cargo', 'Cargo')}
      {campo('telefono', 'Teléfono')}
      {campo('email', 'Email')}
    </div>
  )
}

export function Firmantes({ firmantes, crear }: { firmantes: FirmanteConAcciones[]; crear: AccionFormulario }) {
  return (
    <div className="space-y-4">
      <DialogoFormulario
        titulo="Nuevo firmante"
        accion={crear}
        textoBoton="Guardar firmante"
        disparador={
          <Button>
            <Plus className="size-4" aria-hidden />
            Nuevo firmante
          </Button>
        }
      >
        {(estado) => <CamposFirmante estado={estado} />}
      </DialogoFormulario>

      <ul className="divide-y rounded-md border">
        {firmantes.map((firmante) => (
          <li key={firmante.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
            <div>
              <p className="font-medium">
                {firmante.nombre}
                {firmante.activo ? null : (
                  <Badge variant="secondary" className="ml-2">
                    Inactivo
                  </Badge>
                )}
              </p>
              <p className="text-sm text-muted-foreground">
                {[firmante.cargo, firmante.telefono, firmante.email].filter(Boolean).join(' · ')}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <DialogoFormulario
                titulo={`Editar a ${firmante.nombre}`}
                accion={firmante.actualizar}
                textoBoton="Guardar firmante"
                disparador={
                  <Button variant="ghost" size="icon" aria-label={`Editar a ${firmante.nombre}`}>
                    <Pencil className="size-4" />
                  </Button>
                }
              >
                {(estado) => <CamposFirmante estado={estado} inicial={firmante} />}
              </DialogoFormulario>
              {firmante.boton}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

```tsx
// src/app/(app)/configuracion/firmantes/page.tsx
import type { Metadata } from 'next'
import { Firmantes } from '@/components/configuracion/firmantes'
import { BotonEstado } from '@/components/formulario/boton-estado'
import { createClient } from '@/lib/supabase/server'
import { actualizarFirmante, cambiarEstadoFirmante, crearFirmante } from '../actions'

export const metadata: Metadata = { title: 'Firmantes' }

export default async function FirmantesPage() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('firmantes')
    .select('id, nombre, cargo, telefono, email, activo')
    .order('activo', { ascending: false })
    .order('nombre')
  if (error) throw error

  const firmantes = data.map((firmante) => ({
    ...firmante,
    actualizar: actualizarFirmante.bind(null, firmante.id),
    boton: (
      <BotonEstado
        activo={firmante.activo}
        etiqueta={firmante.nombre}
        accion={cambiarEstadoFirmante.bind(null, firmante.id, !firmante.activo)}
      />
    ),
  }))

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Firmantes</h1>
        <p className="text-sm text-muted-foreground">Nombre, cargo y teléfono que aparecen al pie de cada cotización.</p>
      </div>
      <Firmantes firmantes={firmantes} crear={crearFirmante} />
    </section>
  )
}
```

- [ ] **Step 5: Verificar y commit**

```bash
npm run check && npm run build
git add -A
git commit -m "feat: configuración de empresa y firmantes

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 12: Configuración — equipos y plantillas

**Files:**
- Create: `src/components/configuracion/equipos.tsx`, `src/components/configuracion/plantillas.tsx`, `src/app/(app)/configuracion/equipos/page.tsx`, `src/app/(app)/configuracion/plantillas/page.tsx`, `src/app/(app)/configuracion/plantillas/[id]/page.tsx`

- [ ] **Step 1: Equipos**

```tsx
// src/components/configuracion/equipos.tsx
'use client'

import { Pencil, Plus } from 'lucide-react'
import { Campo } from '@/components/formulario/campo'
import { DialogoFormulario } from '@/components/formulario/dialogo-formulario'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { CampoEquipo } from '@/lib/catalogos/esquemas'
import { valorCampo, type AccionFormulario, type EstadoFormulario } from '@/lib/formularios'

export type EquipoConAcciones = {
  id: string
  nombre: string
  capacidad_tn: string
  marca: string
  modelo: string
  identificacion: string
  descripcion: string
  activo: boolean
  actualizar: AccionFormulario
  boton: React.ReactNode
}

function CamposEquipo({ estado, inicial }: { estado: EstadoFormulario; inicial?: Partial<Record<CampoEquipo, string>> }) {
  const campo = (nombre: CampoEquipo, etiqueta: string, props: React.ComponentProps<typeof Input> = {}) => (
    <Campo id={`equipo-${nombre}`} etiqueta={etiqueta} error={estado.errores[nombre]}>
      <Input
        id={`equipo-${nombre}`}
        name={nombre}
        defaultValue={valorCampo(estado, inicial, nombre)}
        aria-invalid={Boolean(estado.errores[nombre])}
        {...props}
      />
    </Campo>
  )
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">{campo('nombre', 'Nombre')}</div>
      {campo('capacidad_tn', 'Capacidad (TN)', { inputMode: 'decimal' })}
      {campo('identificacion', 'N° interno o dominio')}
      {campo('marca', 'Marca')}
      {campo('modelo', 'Modelo')}
      <Campo
        id="equipo-descripcion"
        etiqueta="Descripción para la cotización"
        error={estado.errores.descripcion}
        ayuda='Es el texto de "Equipo ofrecido".'
        className="sm:col-span-2"
      >
        <Textarea id="equipo-descripcion" name="descripcion" rows={4} defaultValue={valorCampo(estado, inicial, 'descripcion')} />
      </Campo>
    </div>
  )
}

export function Equipos({ equipos, crear }: { equipos: EquipoConAcciones[]; crear: AccionFormulario }) {
  return (
    <div className="space-y-4">
      <DialogoFormulario
        titulo="Nuevo equipo"
        accion={crear}
        textoBoton="Guardar equipo"
        disparador={
          <Button>
            <Plus className="size-4" aria-hidden />
            Nuevo equipo
          </Button>
        }
      >
        {(estado) => <CamposEquipo estado={estado} />}
      </DialogoFormulario>

      <ul className="divide-y rounded-md border">
        {equipos.map((equipo) => (
          <li key={equipo.id} className="flex flex-wrap items-start justify-between gap-2 p-3">
            <div className="min-w-0 max-w-2xl">
              <p className="font-medium">
                {equipo.nombre}
                {equipo.activo ? null : (
                  <Badge variant="secondary" className="ml-2">
                    Inactivo
                  </Badge>
                )}
              </p>
              <p className="text-sm text-muted-foreground">
                {[equipo.capacidad_tn ? `${equipo.capacidad_tn} TN` : '', equipo.marca, equipo.modelo, equipo.identificacion]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {equipo.descripcion ? <p className="mt-1 text-sm">{equipo.descripcion}</p> : null}
            </div>
            <div className="flex items-center gap-1">
              <DialogoFormulario
                titulo={`Editar ${equipo.nombre}`}
                accion={equipo.actualizar}
                textoBoton="Guardar equipo"
                disparador={
                  <Button variant="ghost" size="icon" aria-label={`Editar ${equipo.nombre}`}>
                    <Pencil className="size-4" />
                  </Button>
                }
              >
                {(estado) => <CamposEquipo estado={estado} inicial={equipo} />}
              </DialogoFormulario>
              {equipo.boton}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

```tsx
// src/app/(app)/configuracion/equipos/page.tsx
import type { Metadata } from 'next'
import { Equipos } from '@/components/configuracion/equipos'
import { BotonEstado } from '@/components/formulario/boton-estado'
import { createClient } from '@/lib/supabase/server'
import { actualizarEquipo, cambiarEstadoEquipo, crearEquipo } from '../actions'

export const metadata: Metadata = { title: 'Equipos' }

/** "60.5" (numeric de Postgres) → "60,5" para mostrar y editar. */
function capacidadTexto(valor: number | null): string {
  return valor === null ? '' : String(valor).replace('.', ',')
}

export default async function EquiposPage() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('equipos')
    .select('id, nombre, capacidad_tn, marca, modelo, identificacion, descripcion, activo')
    .order('activo', { ascending: false })
    .order('capacidad_tn', { ascending: false, nullsFirst: false })
  if (error) throw error

  const equipos = data.map((equipo) => ({
    ...equipo,
    capacidad_tn: capacidadTexto(equipo.capacidad_tn),
    actualizar: actualizarEquipo.bind(null, equipo.id),
    boton: (
      <BotonEstado
        activo={equipo.activo}
        etiqueta={equipo.nombre}
        accion={cambiarEstadoEquipo.bind(null, equipo.id, !equipo.activo)}
      />
    ),
  }))

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Equipos</h1>
        <p className="text-sm text-muted-foreground">La descripción de cada equipo se usa como &quot;Equipo ofrecido&quot; en las cotizaciones.</p>
      </div>
      <Equipos equipos={equipos} crear={crearEquipo} />
    </section>
  )
}
```

- [ ] **Step 2: Plantillas (lista y vista)**

```tsx
// src/components/configuracion/plantillas.tsx
'use client'

import { Pencil } from 'lucide-react'
import Link from 'next/link'
import { Campo } from '@/components/formulario/campo'
import { DialogoFormulario } from '@/components/formulario/dialogo-formulario'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { valorCampo, type AccionFormulario } from '@/lib/formularios'

export type PlantillaConAcciones = {
  id: string
  nombre: string
  formato: string
  activa: boolean
  renombrar: AccionFormulario
  boton: React.ReactNode
}

export function Plantillas({ plantillas }: { plantillas: PlantillaConAcciones[] }) {
  return (
    <ul className="divide-y rounded-md border">
      {plantillas.map((plantilla) => (
        <li key={plantilla.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/configuracion/plantillas/${plantilla.id}`} className="font-medium hover:underline">
              {plantilla.nombre}
            </Link>
            <Badge variant="outline">{plantilla.formato}</Badge>
            {plantilla.activa ? null : <Badge variant="secondary">Inactiva</Badge>}
          </div>
          <div className="flex items-center gap-1">
            <DialogoFormulario
              titulo="Renombrar plantilla"
              accion={plantilla.renombrar}
              textoBoton="Guardar nombre"
              disparador={
                <Button variant="ghost" size="icon" aria-label={`Renombrar ${plantilla.nombre}`}>
                  <Pencil className="size-4" />
                </Button>
              }
            >
              {(estado) => (
                <Campo id="plantilla-nombre" etiqueta="Nombre" error={estado.errores.nombre}>
                  <Input
                    id="plantilla-nombre"
                    name="nombre"
                    defaultValue={valorCampo(estado, { nombre: plantilla.nombre }, 'nombre')}
                    aria-invalid={Boolean(estado.errores.nombre)}
                  />
                </Campo>
              )}
            </DialogoFormulario>
            {plantilla.boton}
          </div>
        </li>
      ))}
    </ul>
  )
}
```

```tsx
// src/app/(app)/configuracion/plantillas/page.tsx
import type { Metadata } from 'next'
import { Plantillas } from '@/components/configuracion/plantillas'
import { BotonEstado } from '@/components/formulario/boton-estado'
import { FORMATOS, type Formato } from '@/lib/plantillas/contenido'
import { createClient } from '@/lib/supabase/server'
import { cambiarEstadoPlantilla, renombrarPlantilla } from '../actions'

export const metadata: Metadata = { title: 'Plantillas' }

export default async function PlantillasPage() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('plantillas')
    .select('id, nombre, formato, activa')
    .order('activa', { ascending: false })
    .order('nombre')
  if (error) throw error

  const plantillas = data.map((plantilla) => ({
    ...plantilla,
    formato: FORMATOS[plantilla.formato as Formato] ?? plantilla.formato,
    renombrar: renombrarPlantilla.bind(null, plantilla.id),
    boton: (
      <BotonEstado
        activo={plantilla.activa}
        etiqueta={plantilla.nombre}
        accion={cambiarEstadoPlantilla.bind(null, plantilla.id, !plantilla.activa)}
      />
    ),
  }))

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Plantillas</h1>
        <p className="text-sm text-muted-foreground">
          Los textos se editan desde una cotización con &quot;Guardar como plantilla&quot; (próxima etapa).
        </p>
      </div>
      <Plantillas plantillas={plantillas} />
    </section>
  )
}
```

```tsx
// src/app/(app)/configuracion/plantillas/[id]/page.tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { FORMATOS, leerBloques, leerItemsPlantilla, type Formato } from '@/lib/plantillas/contenido'
import { createClient } from '@/lib/supabase/server'
import { esUuid } from '@/lib/validacion'

export const metadata: Metadata = { title: 'Plantilla' }

export default async function PlantillaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!esUuid(id)) notFound()

  const supabase = await createClient()
  const { data: plantilla, error } = await supabase.from('plantillas').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  if (!plantilla) notFound()

  const bloques = leerBloques(plantilla.bloques)
  const items = leerItemsPlantilla(plantilla.items)

  return (
    <section className="max-w-4xl space-y-6">
      <div className="space-y-2">
        <Link href="/configuracion/plantillas" className="text-sm text-muted-foreground hover:underline">
          ← Plantillas
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{plantilla.nombre}</h1>
          <Badge variant="outline">{FORMATOS[plantilla.formato as Formato] ?? plantilla.formato}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">Validez: {plantilla.validez_dias} días.</p>
      </div>

      {plantilla.asunto ? (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground">Asunto</h2>
          <p className="whitespace-pre-wrap">{plantilla.asunto}</p>
        </div>
      ) : null}
      {plantilla.intro ? (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground">Introducción</h2>
          <p className="whitespace-pre-wrap">{plantilla.intro}</p>
        </div>
      ) : null}

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Ítems precargados</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sección</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead>Unidad</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, indice) => (
              <TableRow key={indice}>
                <TableCell>{item.seccion || '—'}</TableCell>
                <TableCell>{item.descripcion}</TableCell>
                <TableCell>{item.unidad}</TableCell>
                <TableCell className="text-right tabular-nums">{item.cantidad}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Bloques de texto</h2>
        {bloques.map((bloque, indice) => (
          <article key={indice} className="space-y-1 rounded-md border p-4">
            {bloque.titulo ? <h3 className="font-semibold">{bloque.titulo}</h3> : null}
            <p className="whitespace-pre-wrap text-sm">{bloque.contenido}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Verificar y commit**

```bash
npm run check && npm run build
git add -A
git commit -m "feat: configuración de equipos y vista de plantillas

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 13: Datos de ejemplo, E2E y cierre

**Files:**
- Modify: `supabase/seed.sql`, `README.md`
- Create: `tests/e2e/helpers.ts`, `tests/e2e/clientes.spec.ts`, `tests/e2e/configuracion.spec.ts`

- [ ] **Step 1: Clientes de ejemplo para desarrollo local**

`supabase/seed.sql` completo (solo corre en local con `db:reset`; producción no lo usa):

```sql
-- Datos de ejemplo para desarrollo local (no se aplican en producción).
insert into public.clientes (razon_social, cuit, localidad, provincia) values
  ('VERTICE SERVICIOS INTEGRALES S.R.L.', '30719529670', 'Neuquén', 'Neuquén'),
  ('Milicic S.A.', null, 'Neuquén', 'Neuquén');

insert into public.contactos (cliente_id, nombre, email)
select id, 'Yanina Colman', 'yanina.colman@milicic.com.ar'
from public.clientes where razon_social = 'Milicic S.A.';
```

```bash
npm run db:reset
```

- [ ] **Step 2: Helper de login para E2E**

```ts
// tests/e2e/helpers.ts
import { expect, type Page } from '@playwright/test'
import { E2E_EMAIL, E2E_PASSWORD } from './credenciales'

export async function iniciarSesion(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(E2E_EMAIL)
  await page.getByLabel('Contraseña').fill(E2E_PASSWORD)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByRole('heading', { name: 'Inicio' })).toBeVisible()
}

/** Sufijo único por corrida para no chocar con datos de corridas anteriores. */
export function sufijoUnico() {
  return Date.now().toString(36)
}
```

- [ ] **Step 3: E2E de clientes**

```ts
// tests/e2e/clientes.spec.ts
import { expect, test } from '@playwright/test'
import { iniciarSesion, sufijoUnico } from './helpers'

test('alta de cliente: valida el CUIT sin perder lo escrito, agrega un contacto y se encuentra sin acentos', async ({ page }) => {
  const sufijo = sufijoUnico()
  const razonSocial = `Grúas Ñandú ${sufijo} S.A.`

  await iniciarSesion(page)
  await page.getByRole('link', { name: 'Clientes' }).click()
  await page.getByRole('link', { name: 'Nuevo cliente' }).click()

  await page.getByLabel('Razón social').fill(razonSocial)
  await page.getByLabel('CUIT').fill('30-71952967-1')
  await page.getByRole('button', { name: 'Crear cliente' }).click()
  await expect(page.getByText('El CUIT no es válido')).toBeVisible()
  await expect(page.getByLabel('Razón social')).toHaveValue(razonSocial)

  await page.getByLabel('CUIT').fill('')
  await page.getByRole('button', { name: 'Crear cliente' }).click()
  await expect(page.getByRole('heading', { name: razonSocial })).toBeVisible()

  await page.getByRole('button', { name: 'Agregar contacto' }).click()
  const dialogo = page.getByRole('dialog')
  await dialogo.getByLabel('Nombre').fill('Yanina Colman')
  await dialogo.getByLabel('Email').fill('yanina@ejemplo.com')
  await dialogo.getByRole('button', { name: 'Guardar contacto' }).click()
  await expect(dialogo).toBeHidden()
  await expect(page.getByText('Yanina Colman')).toBeVisible()

  await page.goto(`/clientes?q=${encodeURIComponent(`gruas nandu ${sufijo}`)}`)
  await expect(page.getByRole('link', { name: razonSocial })).toBeVisible()
})

test('el CUIT de un cliente existente no se puede repetir', async ({ page }) => {
  await iniciarSesion(page)
  await page.goto('/clientes/nuevo')
  await page.getByLabel('Razón social').fill(`Duplicado ${sufijoUnico()}`)
  await page.getByLabel('CUIT').fill('30-71952967-0')
  await page.getByRole('button', { name: 'Crear cliente' }).click()
  await expect(page.getByText('Ya existe un cliente con ese CUIT').first()).toBeVisible()
})

test('un cliente se puede desactivar y volver a activar', async ({ page }) => {
  const razonSocial = `Para desactivar ${sufijoUnico()}`
  await iniciarSesion(page)
  await page.goto('/clientes/nuevo')
  await page.getByLabel('Razón social').fill(razonSocial)
  await page.getByRole('button', { name: 'Crear cliente' }).click()
  await expect(page.getByRole('heading', { name: razonSocial })).toBeVisible()

  await page.getByRole('button', { name: `Desactivar ${razonSocial}` }).click()
  await expect(page.getByText('Inactivo')).toBeVisible()
  await page.getByRole('button', { name: `Activar ${razonSocial}` }).click()
  await expect(page.getByText('Inactivo')).toBeHidden()
})
```

- [ ] **Step 4: E2E de configuración**

```ts
// tests/e2e/configuracion.spec.ts
import { expect, test } from '@playwright/test'
import { iniciarSesion, sufijoUnico } from './helpers'

test('firmantes: alta y edición', async ({ page }) => {
  const nombre = `Firmante ${sufijoUnico()}`
  await iniciarSesion(page)
  await page.goto('/configuracion/firmantes')

  await page.getByRole('button', { name: 'Nuevo firmante' }).click()
  const alta = page.getByRole('dialog')
  await alta.getByLabel('Nombre').fill(nombre)
  await alta.getByLabel('Cargo').fill('Contrataciones / Logística')
  await alta.getByRole('button', { name: 'Guardar firmante' }).click()
  await expect(alta).toBeHidden()
  await expect(page.getByText(nombre)).toBeVisible()

  await page.getByRole('button', { name: `Editar a ${nombre}` }).click()
  const edicion = page.getByRole('dialog')
  await edicion.getByLabel('Teléfono').fill('299 000 0000')
  await edicion.getByRole('button', { name: 'Guardar firmante' }).click()
  await expect(edicion).toBeHidden()
  await expect(page.getByText('299 000 0000')).toBeVisible()
})

test('equipos: valida la capacidad y acepta decimales con coma', async ({ page }) => {
  const nombre = `Grúa prueba ${sufijoUnico()}`
  await iniciarSesion(page)
  await page.goto('/configuracion/equipos')

  await page.getByRole('button', { name: 'Nuevo equipo' }).click()
  const dialogo = page.getByRole('dialog')
  await dialogo.getByLabel('Nombre').fill(nombre)
  await dialogo.getByLabel('Capacidad (TN)').fill('0')
  await dialogo.getByRole('button', { name: 'Guardar equipo' }).click()
  await expect(dialogo.getByText('Ingresá una capacidad en toneladas mayor a 0')).toBeVisible()

  await dialogo.getByLabel('Capacidad (TN)').fill('60,5')
  await dialogo.getByRole('button', { name: 'Guardar equipo' }).click()
  await expect(dialogo).toBeHidden()
  await expect(page.getByText(nombre)).toBeVisible()
  await expect(page.getByText('60,5 TN')).toBeVisible()
})

test('plantillas iniciales: mensual y por jornada con sus textos', async ({ page }) => {
  await iniciarSesion(page)
  await page.goto('/configuracion/plantillas')
  await expect(page.getByRole('link', { name: 'Por jornada - Grúa con operador' })).toBeVisible()

  await page.getByRole('link', { name: 'Mensual - Grúa con operador' }).click()
  await expect(page.getByText('CONDICIONES PARTICULARES DEL SERVICIO DE GRÚAS CON OPERADOR')).toBeVisible()
  await expect(page.getByText('Alquiler mensual Grúa {{capacidad}} TN')).toBeVisible()
})

test('empresa: muestra los datos reales', async ({ page }) => {
  await iniciarSesion(page)
  await page.goto('/configuracion/empresa')
  await expect(page.getByLabel('Razón social')).toHaveValue('Equipos Patagónicos')
  await expect(page.getByLabel('Ciudad')).toHaveValue('Neuquén')
})
```

- [ ] **Step 5: README**

En `README.md`, agregar después de la sección "Puesta en marcha local":

```markdown
`db:reset` carga los datos reales de la empresa (firmantes, equipos y plantillas, en una migración) y, solo en local, dos clientes de ejemplo (`supabase/seed.sql`).
```

- [ ] **Step 6: Verificación completa y commit**

```bash
npm run db:reset && npm run check && npm run test:int && npm run build && npm run test:e2e
```

Expected: todo en verde. Los E2E son 3 del plan 1 más 7 nuevos (`10 passed`).

```bash
git add -A
git commit -m "test: E2E de clientes y configuración, y datos de ejemplo para local

Co-Authored-By: Claude <noreply@anthropic.com>"
```
