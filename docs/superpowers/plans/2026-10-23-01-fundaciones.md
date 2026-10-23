# Plan 1 · Fundaciones — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar andando la base de la app: proyecto Next.js 16 con Supabase local, login con sesión, base de seguridad (RLS, grants, perfiles inactivos por defecto), layout con navegación y las utilidades de dominio (montos, fechas, CUIT), todo con tests.

**Architecture:** Next.js App Router con Server Components y Server Actions. Supabase (Postgres, Auth y Storage) corre localmente con la CLI y Docker. La sesión se maneja con `@supabase/ssr`: `src/proxy.ts` refresca la sesión y redirige a `/login`, y en el servidor siempre se valida con `auth.getClaims()`. La seguridad vive en Postgres: RLS en todas las tablas y la función `private.es_usuario_activo()`.

**Tech Stack:** Next.js 16.4.3, React 19, TypeScript, Tailwind v4, shadcn/ui 4.22.1, Supabase CLI 2.122.0, @supabase/supabase-js 2.118.0, @supabase/ssr 0.12.7, Zod 4, Vitest 5.0.5, Playwright 1.64.1, pg 8.23.1, @types/node 24.

> **Desvío registrado (Task 2):** el scaffold trae `@types/node@^20`, pero Vitest 5.0.5 declara el peer `@types/node: ^22.0.0 || >=24.0.0`, así que `npm install -D vitest@5.0.5` falla con `ERESOLVE`. Se subió a `@types/node@^24.19.2`. Vitest 5.0.5 además pide Node `^22.12.0 || ^24.0.0 || >=26.0.0` (`engines`): los tipos quedan alineados con Node 24 LTS, a tener en cuenta al elegir la imagen de Node para Railway (plan 6). En local se usa Node 25, que funciona pero queda fuera de ese rango.

**Diseño de referencia:** `docs/plans/2026-10-23-equipos-patagonicos-mvp-design.md`.

**Hoja de ruta (planes siguientes, cada uno se escribe sobre el código real del anterior):**
1. Fundaciones (este plan)
2. Catálogos y clientes: empresa, firmantes, equipos, plantillas, clientes y contactos
3. Cotizaciones: modelo, editor, variables, PDF, enviar, aprobar, duplicar, cargar existentes y presupuesto directo
4. Presupuestos y documentos: OC, remitos, facturas, OP, archivos y saldos
5. Inicio (colas de trabajo) y búsqueda global
6. Deploy (Railway + Supabase Cloud) y backups

**Convenciones:**
- La UI y los mensajes de error van en castellano rioplatense; los identificadores del dominio, en castellano (`cotizaciones`, `clientes`).
- Los commits siguen Conventional Commits con la descripción en castellano y terminan con la línea `Co-Authored-By: Claude <noreply@anthropic.com>`.
- Todos los comandos se corren desde la raíz del repo: `/Users/guidoolguin/Desktop/equipos-patagonicos`.

---

## Estructura de archivos al terminar el plan

```
.env.example                      variables necesarias (sin valores)
README.md                         cómo levantar el proyecto
package.json                      scripts: dev, build, lint, typecheck, test, test:int, test:e2e, check, db:*, env:local
vitest.config.mts                 proyectos "unit" (src/**/*.test.ts) e "integration" (tests/integration)
playwright.config.ts              E2E contra `npm run dev`
scripts/
  env-local.mjs                   genera .env.local desde `supabase status`
  crear-usuario.mjs               crea un usuario activo (admin u operador)
supabase/
  config.toml                     signup apagado, site_url local
  seed.sql                        vacío por ahora
  migrations/20261023120000_base.sql
src/
  proxy.ts                        refresca la sesión y protege rutas
  app/
    layout.tsx                    raíz: lang es-AR, Toaster
    globals.css                   tema (color de marca)
    login/page.tsx | login-form.tsx | actions.ts
    sin-acceso/page.tsx           usuario autenticado pero inactivo
    (app)/layout.tsx              exige usuario activo y arma el shell
    (app)/page.tsx                Inicio
    (app)/cotizaciones/page.tsx | presupuestos/page.tsx | clientes/page.tsx | configuracion/page.tsx
    api/health/route.ts
  components/
    ui/…                          shadcn
    app-shell/nav-items.ts | sidebar-nav.tsx | mobile-nav.tsx | user-menu.tsx | app-shell.tsx | seccion-pendiente.tsx
  lib/
    env.ts                        variables públicas validadas con Zod
    auth.ts                       getEstadoSesion / requireUsuario
    auth/destino.ts(+test)        valida el `next` del login (evita open redirect)
    format/montos.ts(+test)       formato y parseo de montos es-AR
    format/fechas.ts(+test)       fechas en letras y "hoy" en Argentina
    cuit.ts(+test)                normalizar, validar y formatear CUIT
    supabase/server.ts | client.ts | proxy.ts | database.types.ts (generado)
tests/
  integration/setup.ts | helpers.ts | base.test.ts
  e2e/global-setup.ts | credenciales.ts | auth.spec.ts
```

---

### Task 1: Scaffold de Next.js

**Files:**
- Create: todo lo que genera `create-next-app` (`package.json`, `src/app/*`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `.gitignore`, `public/*`)
- Modify: `.gitignore`

- [ ] **Step 1: Generar el proyecto en un directorio temporal**

`create-next-app` no acepta un directorio con `docs/`, así que se genera aparte y se copia:

```bash
SCAFFOLD="$(mktemp -d)/ep-app"
npx --yes create-next-app@16.4.3 "$SCAFFOLD" --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --skip-install --disable-git --yes
rsync -a --exclude .git --exclude node_modules "$SCAFFOLD"/ ./
ls
```

Expected: aparecen `package.json`, `src/`, `public/`, `next.config.ts`, `tsconfig.json`, junto a `docs/`. Si algún flag es rechazado, correr `npx create-next-app@16.4.3 --help` y usar el equivalente; el resultado tiene que ser TypeScript + Tailwind + ESLint + App Router + `src/` + alias `@/*`.

- [ ] **Step 2: Fijar el nombre del paquete e instalar**

En `package.json`, poner `"name": "equipos-patagonicos"` y `"private": true`. Después:

```bash
npm install
```

- [ ] **Step 3: Agregar entradas al `.gitignore`**

Agregar al final de `.gitignore`:

```gitignore
# supabase local
supabase/.temp
supabase/.branches

# tests
/test-results
/playwright-report
/blob-report
/playwright/.cache
```

Verificar que `.gitignore` ya ignora `.env*` (create-next-app lo incluye). Si solo ignora `.env*.local`, agregar `.env*` y la excepción `!.env.example`.

- [ ] **Step 4: Verificar que compila**

```bash
npm run build
```

Expected: `✓ Compiled successfully` y termina sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 16 con TypeScript, Tailwind y ESLint

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Vitest y scripts de calidad

**Files:**
- Create: `vitest.config.mts`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Instalar Vitest**

```bash
npm install -D vitest@5.0.5
```

- [ ] **Step 2: Crear `vitest.config.mts`**

```ts
import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          setupFiles: ['tests/integration/setup.ts'],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
})
```

- [ ] **Step 3: Agregar scripts en `package.json`**

Dentro de `"scripts"` (se conservan `dev`, `build`, `start` y `lint` generados):

```json
"typecheck": "tsc --noEmit",
"test": "vitest run --project unit",
"test:watch": "vitest --project unit",
"test:int": "vitest run --project integration",
"check": "npm run lint && npm run typecheck && npm run test"
```

- [ ] **Step 4: Verificar**

```bash
npx vitest run --project unit --passWithNoTests && npm run typecheck
```

Expected: `No test files found, exiting with code 0` (o equivalente) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: configurar Vitest con proyectos unit e integration

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: shadcn/ui y tema de marca

**Files:**
- Create: `components.json`, `src/lib/utils.ts`, `src/components/ui/*`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Inicializar shadcn**

```bash
npx --yes shadcn@4.22.1 init --help
npx --yes shadcn@4.22.1 init --yes --defaults
```

Si `--defaults` no existe en esta versión, usar los flags que muestra `--help` para aceptar los valores por defecto. La librería de primitivas es Radix si lo pregunta, y el color base, `neutral`. Expected: se crean `components.json` y `src/lib/utils.ts` y se modifica `src/app/globals.css`.

- [ ] **Step 2: Agregar los componentes del shell y del login**

```bash
npx --yes shadcn@4.22.1 add --yes button input label card sonner sheet separator dropdown-menu badge alert
```

Expected: archivos en `src/components/ui/` y `lucide-react`, `sonner` y `next-themes` (u otras dependencias que pida) agregadas a `package.json`.

Verificar que las primitivas sean Radix: `grep -l "radix" src/components/ui/button.tsx src/components/ui/dropdown-menu.tsx`. El código de las tareas 11 y 12 usa la prop `asChild` de Radix. Si shadcn instaló Base UI (sin `asChild`), reinicializar eligiendo Radix. Si no se puede, adaptar en esas tareas cada `asChild` a la prop `render` de Base UI, sin cambiar el comportamiento.

- [ ] **Step 3: Color de marca**

El logo de Equipos Patagónicos es azul con amarillo. En `src/app/globals.css`, dentro del bloque `:root` que generó shadcn, reemplazar los valores de `--primary`, `--primary-foreground` y `--ring` por:

```css
  --primary: oklch(0.45 0.15 264);
  --primary-foreground: oklch(0.985 0 0);
  --ring: oklch(0.45 0.15 264);
```

Y agregar al final de `:root`:

```css
  --brand-yellow: oklch(0.85 0.17 90);
```

- [ ] **Step 4: Verificar**

```bash
npm run build && npm run lint
```

Expected: build y lint sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: agregar shadcn/ui y color de marca

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Formato y parseo de montos (TDD)

**Files:**
- Create: `src/lib/format/montos.ts`
- Test: `src/lib/format/montos.test.ts`

- [ ] **Step 1: Escribir los tests**

```ts
// src/lib/format/montos.test.ts
import { describe, expect, it } from 'vitest'
import { formatMoneda, formatMontoJornada, formatMontoTabla, parsePrecio } from './montos'

describe('formatMontoTabla', () => {
  it('usa punto de miles y coma decimal con 2 decimales, como la tabla mensual', () => {
    expect(formatMontoTabla(39_000_000)).toBe('39.000.000,00')
    expect(formatMontoTabla(260_000)).toBe('260.000,00')
    expect(formatMontoTabla(5_000)).toBe('5.000,00')
    expect(formatMontoTabla(1_234.5)).toBe('1.234,50')
  })
})

describe('formatMontoJornada', () => {
  it('formatea sin decimales con "$ " y ".-" como la cotización por jornada', () => {
    expect(formatMontoJornada(1_950_000)).toBe('$ 1.950.000.-')
    expect(formatMontoJornada(2_530_000)).toBe('$ 2.530.000.-')
  })

  it('redondea los centavos', () => {
    expect(formatMontoJornada(1_000.6)).toBe('$ 1.001.-')
  })
})

describe('formatMoneda', () => {
  it('formatea montos de pantalla con signo y 2 decimales', () => {
    expect(formatMoneda(1_950_000.5)).toBe('$ 1.950.000,50')
  })
})

describe('parsePrecio', () => {
  it.each([
    ['39.000.000', 39_000_000],
    ['39000000', 39_000_000],
    ['39.000.000,00', 39_000_000],
    ['1.950.000,50', 1_950_000.5],
    ['2,5', 2.5],
    ['2.5', 2.5],
    ['1.950', 1_950],
    ['$ 1.950.000', 1_950_000],
    ['$ 1.950.000.-', 1_950_000],
    ['2.530.000-', 2_530_000],
    ['  260.000  ', 260_000],
    ['0', 0],
  ])('interpreta %j como %d', (entrada, esperado) => {
    expect(parsePrecio(entrada)).toBe(esperado)
  })

  it.each(['', '   ', 'abc', '-5', '1.95.000', '1,2,3', '12a'])('rechaza %j', (entrada) => {
    expect(parsePrecio(entrada)).toBeNull()
  })
})
```

- [ ] **Step 2: Correr y ver que fallan**

```bash
npx vitest run src/lib/format/montos.test.ts
```

Expected: FAIL porque no se puede resolver `./montos`.

- [ ] **Step 3: Implementar**

```ts
// src/lib/format/montos.ts
const conDecimales = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: 'always',
})

const sinDecimales = new Intl.NumberFormat('es-AR', {
  maximumFractionDigits: 0,
  useGrouping: 'always',
})

/** "39.000.000,00": columnas Precio y Total de la cotización mensual. */
export function formatMontoTabla(monto: number): string {
  return conDecimales.format(monto)
}

/** "$ 1.950.000.-": precios de la cotización por jornada. */
export function formatMontoJornada(monto: number): string {
  return `$ ${sinDecimales.format(Math.round(monto))}.-`
}

/** "$ 1.950.000,50": montos en pantalla (facturas, órdenes de pago). */
export function formatMoneda(monto: number): string {
  return `$ ${conDecimales.format(monto)}`
}

/**
 * Interpreta un precio escrito o pegado al estilo argentino.
 * El punto es separador de miles salvo que haya un único punto seguido de 1 o 2 dígitos ("2.5").
 * Devuelve null si el texto no es un monto válido (no admite negativos).
 */
export function parsePrecio(entrada: string): number | null {
  let s = entrada
    .trim()
    .replace(/^\$\s*/, '')
    .replace(/\.-$/, '')
    .replace(/-$/, '')
    .replace(/\s+/g, '')

  if (s === '') return null

  if (s.includes(',')) {
    if (!/^(\d{1,3}(\.\d{3})+|\d+),\d+$/.test(s)) return null
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (s.includes('.')) {
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
    else if (!/^\d+\.\d{1,2}$/.test(s)) return null
  } else if (!/^\d+$/.test(s)) {
    return null
  }

  const n = Number(s)
  return Number.isFinite(n) ? n : null
}
```

- [ ] **Step 4: Correr y ver que pasan**

```bash
npx vitest run src/lib/format/montos.test.ts
```

Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/format/montos.ts src/lib/format/montos.test.ts
git commit -m "feat: formato y parseo de montos es-AR

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Fechas en letras y "hoy" en Argentina (TDD)

**Files:**
- Create: `src/lib/format/fechas.ts`
- Test: `src/lib/format/fechas.test.ts`

Las fechas del dominio son strings `YYYY-MM-DD` (columnas `date` de Postgres). Nunca se convierten con `new Date('YYYY-MM-DD')`, porque eso las interpreta en UTC y corre el día.

- [ ] **Step 1: Escribir los tests**

```ts
// src/lib/format/fechas.test.ts
import { describe, expect, it } from 'vitest'
import {
  diasEntre,
  encabezadoFecha,
  fechaEnLetras,
  formatFechaCorta,
  hoyArgentina,
  sumarDias,
} from './fechas'

describe('fechaEnLetras', () => {
  it('escribe la fecha como en las cotizaciones', () => {
    expect(fechaEnLetras('2026-10-22')).toBe('22 de octubre de 2026')
    expect(fechaEnLetras('2026-07-15')).toBe('15 de julio de 2026')
    expect(fechaEnLetras('2026-08-01')).toBe('1 de agosto de 2026')
  })

  it('rechaza fechas mal formadas', () => {
    expect(() => fechaEnLetras('22/10/2026')).toThrow('Fecha inválida')
    expect(() => fechaEnLetras('2026-13-01')).toThrow('Fecha inválida')
  })
})

describe('encabezadoFecha', () => {
  it('arma "Ciudad, fecha." como el encabezado del PDF', () => {
    expect(encabezadoFecha('Neuquén', '2026-10-22')).toBe('Neuquén, 22 de octubre de 2026.')
  })
})

describe('formatFechaCorta', () => {
  it('usa dd/mm/aaaa', () => {
    expect(formatFechaCorta('2026-07-24')).toBe('24/07/2026')
  })
})

describe('hoyArgentina', () => {
  it('a las 22:30 de Argentina (01:30 UTC del día siguiente) sigue siendo el mismo día', () => {
    expect(hoyArgentina(new Date('2026-10-23T01:30:00Z'))).toBe('2026-10-22')
  })

  it('a las 00:00 de Argentina ya es el día siguiente', () => {
    expect(hoyArgentina(new Date('2026-10-23T03:00:00Z'))).toBe('2026-10-23')
  })
})

describe('sumarDias y diasEntre', () => {
  it('suma días cruzando meses y años', () => {
    expect(sumarDias('2026-10-22', 30)).toBe('2026-11-21')
    expect(sumarDias('2026-12-20', 15)).toBe('2027-01-04')
    expect(sumarDias('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('cuenta días entre dos fechas', () => {
    expect(diasEntre('2026-10-22', '2026-11-21')).toBe(30)
    expect(diasEntre('2026-11-21', '2026-10-22')).toBe(-30)
  })
})
```

- [ ] **Step 2: Correr y ver que fallan**

```bash
npx vitest run src/lib/format/fechas.test.ts
```

Expected: FAIL porque no se puede resolver `./fechas`.

- [ ] **Step 3: Implementar**

```ts
// src/lib/format/fechas.ts
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const

export const ZONA_ARGENTINA = 'America/Argentina/Buenos_Aires'

const MS_POR_DIA = 86_400_000

function partes(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) throw new Error(`Fecha inválida: ${iso}`)
  const anio = Number(m[1])
  const mes = Number(m[2])
  const dia = Number(m[3])
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) throw new Error(`Fecha inválida: ${iso}`)
  return { anio, mes, dia }
}

function aUtc(iso: string): number {
  const { anio, mes, dia } = partes(iso)
  return Date.UTC(anio, mes - 1, dia)
}

/** "22 de octubre de 2026" */
export function fechaEnLetras(iso: string): string {
  const { anio, mes, dia } = partes(iso)
  return `${dia} de ${MESES[mes - 1]} de ${anio}`
}

/** "Neuquén, 22 de octubre de 2026." */
export function encabezadoFecha(ciudad: string, iso: string): string {
  return `${ciudad}, ${fechaEnLetras(iso)}.`
}

/** "24/07/2026" */
export function formatFechaCorta(iso: string): string {
  const { anio, mes, dia } = partes(iso)
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${anio}`
}

/** Fecha de hoy (YYYY-MM-DD) en hora argentina, sin importar la zona del servidor. */
export function hoyArgentina(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_ARGENTINA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora)
}

export function sumarDias(iso: string, dias: number): string {
  return new Date(aUtc(iso) + dias * MS_POR_DIA).toISOString().slice(0, 10)
}

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((aUtc(hasta) - aUtc(desde)) / MS_POR_DIA)
}
```

- [ ] **Step 4: Correr y ver que pasan**

```bash
npx vitest run src/lib/format/fechas.test.ts
```

Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/format/fechas.ts src/lib/format/fechas.test.ts
git commit -m "feat: fechas en letras y día actual en hora argentina

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: CUIT (TDD)

**Files:**
- Create: `src/lib/cuit.ts`
- Test: `src/lib/cuit.test.ts`

Algoritmo del dígito verificador: se multiplican los primeros 10 dígitos por los pesos `5,4,3,2,7,6,5,4,3,2` y se suman. Con `resto = suma % 11`: si el resto es 0, el DV es 0; si es 1, el CUIT es inválido; en cualquier otro caso, el DV es `11 − resto`.

- [ ] **Step 1: Escribir los tests**

```ts
// src/lib/cuit.test.ts
import { describe, expect, it } from 'vitest'
import { formatCuit, normalizarCuit, validarCuit } from './cuit'

describe('normalizarCuit', () => {
  it('deja solo los dígitos', () => {
    expect(normalizarCuit('30-71952967-0')).toBe('30719529670')
    expect(normalizarCuit(' 30 71952967 0 ')).toBe('30719529670')
  })
})

describe('validarCuit', () => {
  it.each([
    '30-71952967-0', // Vértice Servicios Integrales S.R.L. (cotización 112711)
    '30719529670',
    '33-69345023-9', // AFIP
  ])('acepta %s', (cuit) => {
    expect(validarCuit(cuit)).toBe(true)
  })

  it.each([
    ['30-71952967-1', 'dígito verificador incorrecto'],
    ['3071952967', 'menos de 11 dígitos'],
    ['307195296701', 'más de 11 dígitos'],
    ['11-71952967-0', 'prefijo inexistente'],
    ['', 'vacío'],
  ])('rechaza %s (%s)', (cuit) => {
    expect(validarCuit(cuit)).toBe(false)
  })
})

describe('formatCuit', () => {
  it('formatea como XX-XXXXXXXX-X', () => {
    expect(formatCuit('30719529670')).toBe('30-71952967-0')
    expect(formatCuit('30-71952967-0')).toBe('30-71952967-0')
  })

  it('devuelve la entrada sin tocar si no tiene 11 dígitos', () => {
    expect(formatCuit('123')).toBe('123')
  })
})
```

- [ ] **Step 2: Correr y ver que fallan**

```bash
npx vitest run src/lib/cuit.test.ts
```

Expected: FAIL porque no se puede resolver `./cuit`.

- [ ] **Step 3: Implementar**

```ts
// src/lib/cuit.ts
const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const
const PREFIJOS_VALIDOS = new Set(['20', '23', '24', '25', '26', '27', '30', '33', '34'])

export function normalizarCuit(entrada: string): string {
  return entrada.replace(/\D/g, '')
}

export function validarCuit(entrada: string): boolean {
  const cuit = normalizarCuit(entrada)
  if (cuit.length !== 11 || !PREFIJOS_VALIDOS.has(cuit.slice(0, 2))) return false

  const suma = PESOS.reduce((acc, peso, i) => acc + peso * Number(cuit[i]), 0)
  const resto = suma % 11
  if (resto === 1) return false
  const verificador = resto === 0 ? 0 : 11 - resto
  return verificador === Number(cuit[10])
}

/** "30-71952967-0". Si no tiene 11 dígitos devuelve la entrada sin cambios. */
export function formatCuit(entrada: string): string {
  const cuit = normalizarCuit(entrada)
  if (cuit.length !== 11) return entrada
  return `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}`
}
```

- [ ] **Step 4: Correr y ver que pasan**

```bash
npx vitest run src/lib/cuit.test.ts
```

Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/cuit.ts src/lib/cuit.test.ts
git commit -m "feat: validación y formato de CUIT

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: Supabase local

**Files:**
- Create: `supabase/config.toml`, `supabase/seed.sql`, `scripts/env-local.mjs`, `.env.example`
- Modify: `package.json` (scripts y devDependency)

- [ ] **Step 1: Instalar la CLI e inicializar**

```bash
npm install -D supabase@2.122.0
npx supabase init
```

Expected: se crean `supabase/config.toml` y `supabase/.gitignore`. Si pregunta por configuración de VS Code o IntelliJ, responder que no.

- [ ] **Step 2: Configurar `supabase/config.toml`**

Editar estos valores (las claves ya existen en el archivo generado):

```toml
project_id = "equipos-patagonicos"

[auth]
site_url = "http://localhost:3000"
additional_redirect_urls = ["http://localhost:3000"]
enable_signup = false

[auth.email]
enable_signup = false
enable_confirmations = false
```

Verificar que `[db.seed]` apunte a `./seed.sql` y crear `supabase/seed.sql` con:

```sql
-- Datos iniciales para desarrollo local. Se completan en el plan 2 (catálogos).
```

- [ ] **Step 3: Levantar Supabase**

```bash
npx supabase start
```

Expected: al final imprime `API URL: http://127.0.0.1:54321`, `DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres` y las keys. La primera vez descarga imágenes de Docker y puede tardar varios minutos.

- [ ] **Step 4: Script que genera `.env.local`**

```js
// scripts/env-local.mjs
// Genera .env.local con los datos del Supabase local (`npx supabase start` tiene que estar corriendo).
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const status = JSON.parse(
  execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }),
)

const primero = (...claves) => claves.map((c) => status[c]).find(Boolean)

const env = {
  NEXT_PUBLIC_SUPABASE_URL: primero('API_URL'),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: primero('PUBLISHABLE_KEY', 'ANON_KEY'),
  SUPABASE_SECRET_KEY: primero('SECRET_KEY', 'SERVICE_ROLE_KEY'),
  SUPABASE_DB_URL: primero('DB_URL'),
}

for (const [clave, valor] of Object.entries(env)) {
  if (!valor) throw new Error(`No encontré ${clave} en "supabase status"`)
}

writeFileSync(
  '.env.local',
  Object.entries(env)
    .map(([clave, valor]) => `${clave}=${valor}`)
    .join('\n') + '\n',
)
console.log('.env.local actualizado')
```

`.env.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
# Solo servidor y scripts: nunca con prefijo NEXT_PUBLIC
SUPABASE_SECRET_KEY=
# Solo tests de integración y scripts
SUPABASE_DB_URL=
```

- [ ] **Step 5: Scripts en `package.json`**

```json
"db:start": "supabase start",
"db:stop": "supabase stop",
"db:reset": "supabase db reset",
"db:types": "supabase gen types typescript --local > src/lib/supabase/database.types.ts",
"env:local": "node scripts/env-local.mjs"
```

- [ ] **Step 6: Generar y verificar `.env.local`**

```bash
npm run env:local && cut -d= -f1 .env.local && git check-ignore .env.local
```

Expected: imprime las 4 claves y `.env.local` (confirma que está ignorado por git).

- [ ] **Step 7: Commit**

```bash
git add supabase/config.toml supabase/.gitignore supabase/seed.sql scripts/env-local.mjs .env.example package.json package-lock.json
git commit -m "chore: Supabase local con registro público deshabilitado

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: Migración base de seguridad

**Files:**
- Create: `supabase/migrations/20261023120000_base.sql`
- Create (generado): `src/lib/supabase/database.types.ts`

- [ ] **Step 1: Escribir la migración**

```sql
-- supabase/migrations/20261023120000_base.sql
-- Base de seguridad: extensiones, privilegios por defecto, schema privado y perfiles de usuario.

-- Búsqueda sin acentos y por similitud (se usan desde el plan 2)
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Nada nuevo en public queda expuesto a anon/authenticated sin un GRANT explícito.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

-- Schema privado: no lo expone la API; aloja helpers de seguridad y triggers.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
alter default privileges for role postgres in schema private revoke execute on functions from public;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null,
  rol text not null default 'operador' check (rol in ('admin', 'operador')),
  activo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Usuarios de la app. Los crea un trigger al dar de alta el usuario en Auth y nacen inactivos.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

create or replace function private.crear_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, nombre)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'nombre', ''), new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.crear_profile();

create or replace function private.es_usuario_activo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and activo
  );
$$;

create or replace function private.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and activo and rol = 'admin'
  );
$$;

grant execute on function private.es_usuario_activo() to authenticated;
grant execute on function private.es_admin() to authenticated;

alter table public.profiles enable row level security;

grant select, update on public.profiles to authenticated;

create policy "usuarios activos ven los perfiles"
  on public.profiles for select to authenticated
  using ((select private.es_usuario_activo()));

create policy "solo un admin modifica perfiles"
  on public.profiles for update to authenticated
  using ((select private.es_admin()))
  with check ((select private.es_admin()));
```

- [ ] **Step 2: Aplicar la migración**

```bash
npm run db:reset
```

Expected: `Applying migration 20261023120000_base.sql...` y `Finished supabase db reset`.

- [ ] **Step 3: Generar los tipos**

```bash
npm run db:types && grep -c "profiles" src/lib/supabase/database.types.ts
```

Expected: un número mayor a 0. El archivo exporta `Database`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261023120000_base.sql src/lib/supabase/database.types.ts
git commit -m "feat: base de seguridad con perfiles inactivos por defecto y RLS

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: Tests de integración de la base de seguridad

**Files:**
- Create: `tests/integration/setup.ts`, `tests/integration/helpers.ts`, `tests/integration/base.test.ts`

- [ ] **Step 1: Instalar dependencias**

```bash
npm install @supabase/supabase-js@2.118.0 @supabase/ssr@0.12.7 zod@4.6.7 server-only
npm install -D pg@8.23.1 @types/pg
```

- [ ] **Step 2: Setup y helpers**

```ts
// tests/integration/setup.ts
try {
  process.loadEnvFile('.env.local')
} catch {
  throw new Error('Falta .env.local: corré `npm run db:start` y `npm run env:local`')
}
```

```ts
// tests/integration/helpers.ts
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'
import type { Database } from '@/lib/supabase/database.types'

const opcionesSinSesion = { auth: { persistSession: false, autoRefreshToken: false } }

function url(): string {
  const valor = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!valor) throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL')
  return valor
}

/** Cliente con la secret key: saltea RLS. Solo para preparar datos en los tests. */
export function adminClient() {
  return createClient<Database>(url(), process.env.SUPABASE_SECRET_KEY!, opcionesSinSesion)
}

/** Cliente con la publishable key, sin sesión (rol anon). */
export function anonClient() {
  return createClient<Database>(url(), process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, opcionesSinSesion)
}

export const PASSWORD_DE_PRUEBA = 'Prueba-1234-segura'

/** Crea un usuario de Auth, le fija activo/rol y devuelve un cliente con su sesión iniciada. */
export async function crearUsuario(opciones: { activo: boolean; rol?: 'admin' | 'operador' }) {
  const admin = adminClient()
  const email = `test-${crypto.randomUUID()}@equipos.test`

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD_DE_PRUEBA,
    email_confirm: true,
    user_metadata: { nombre: 'Usuario de prueba' },
  })
  if (error) throw error

  const { error: errorPerfil } = await admin
    .from('profiles')
    .update({ activo: opciones.activo, rol: opciones.rol ?? 'admin' })
    .eq('id', data.user.id)
  if (errorPerfil) throw errorPerfil

  const client = anonClient()
  const { error: errorLogin } = await client.auth.signInWithPassword({ email, password: PASSWORD_DE_PRUEBA })
  if (errorLogin) throw errorLogin

  return { id: data.user.id, email, client }
}

export async function borrarUsuario(id: string) {
  const { error } = await adminClient().auth.admin.deleteUser(id)
  if (error) throw error
}

/** Ejecuta SQL directo contra la base local (como postgres). */
export async function sql<T extends pg.QueryResultRow = pg.QueryResultRow>(
  consulta: string,
  parametros: unknown[] = [],
): Promise<T[]> {
  const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL })
  await client.connect()
  try {
    const resultado = await client.query<T>(consulta, parametros)
    return resultado.rows
  } finally {
    await client.end()
  }
}
```

- [ ] **Step 3: Escribir los tests**

```ts
// tests/integration/base.test.ts
import { afterAll, describe, expect, it } from 'vitest'
import { adminClient, anonClient, borrarUsuario, crearUsuario, sql } from './helpers'

const creados: string[] = []

afterAll(async () => {
  for (const id of creados) await borrarUsuario(id)
})

describe('base de seguridad', () => {
  it('todas las tablas de public tienen RLS activado', async () => {
    const filas = await sql<{ relname: string }>(`
      select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
    `)
    expect(filas.map((f) => f.relname)).toEqual([])
  })

  it('anon no tiene privilegios sobre tablas de public', async () => {
    const filas = await sql(`
      select table_name, privilege_type
      from information_schema.role_table_grants
      where grantee = 'anon' and table_schema = 'public'
    `)
    expect(filas).toEqual([])
  })

  it('el registro público está deshabilitado', async () => {
    const { error } = await anonClient().auth.signUp({
      email: `intruso-${crypto.randomUUID()}@equipos.test`,
      password: 'Intruso-1234-segura',
    })
    expect(error).not.toBeNull()
  })

  it('un usuario nuevo nace inactivo y con el nombre de los metadatos', async () => {
    const { data, error } = await adminClient().auth.admin.createUser({
      email: `nuevo-${crypto.randomUUID()}@equipos.test`,
      password: 'Nuevo-1234-segura',
      email_confirm: true,
      user_metadata: { nombre: 'Thomas Cravero' },
    })
    if (error) throw error
    creados.push(data.user.id)

    const [perfil] = await sql<{ nombre: string; activo: boolean; rol: string }>(
      'select nombre, activo, rol from public.profiles where id = $1',
      [data.user.id],
    )
    expect(perfil).toEqual({ nombre: 'Thomas Cravero', activo: false, rol: 'operador' })
  })

  it('anon no puede leer perfiles', async () => {
    const { error } = await anonClient().from('profiles').select('id')
    expect(error).not.toBeNull()
  })

  it('un usuario inactivo no ve ningún perfil, ni el propio', async () => {
    const usuario = await crearUsuario({ activo: false })
    creados.push(usuario.id)

    const { data, error } = await usuario.client.from('profiles').select('id')
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('un usuario activo ve los perfiles', async () => {
    const usuario = await crearUsuario({ activo: true })
    creados.push(usuario.id)

    const { data, error } = await usuario.client.from('profiles').select('id')
    expect(error).toBeNull()
    expect(data?.map((p) => p.id)).toContain(usuario.id)
  })

  it('un operador no puede ascenderse a admin', async () => {
    const usuario = await crearUsuario({ activo: true, rol: 'operador' })
    creados.push(usuario.id)

    const { data } = await usuario.client.from('profiles').update({ rol: 'admin' }).eq('id', usuario.id).select()
    expect(data ?? []).toEqual([])

    const [perfil] = await sql<{ rol: string }>('select rol from public.profiles where id = $1', [usuario.id])
    expect(perfil.rol).toBe('operador')
  })

  it('un admin puede activar a otro usuario', async () => {
    const admin = await crearUsuario({ activo: true, rol: 'admin' })
    const otro = await crearUsuario({ activo: false })
    creados.push(admin.id, otro.id)

    const { error } = await admin.client.from('profiles').update({ activo: true }).eq('id', otro.id)
    expect(error).toBeNull()

    const [perfil] = await sql<{ activo: boolean }>('select activo from public.profiles where id = $1', [otro.id])
    expect(perfil.activo).toBe(true)
  })
})
```

- [ ] **Step 4: Correr**

```bash
npm run test:int
```

Expected: PASS (9 tests). Si falla "el registro público está deshabilitado", revisar que `enable_signup = false` esté tanto en `[auth]` como en `[auth.email]` y correr `npx supabase stop && npx supabase start` para que tome la configuración.

- [ ] **Step 5: Verificar typecheck y commit**

```bash
npm run typecheck
git add tests/integration package.json package-lock.json
git commit -m "test: integración de RLS, grants y perfiles

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 10: Clientes de Supabase, proxy y health check

**Files:**
- Create: `src/lib/env.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/client.ts`, `src/lib/supabase/proxy.ts`, `src/proxy.ts`, `src/app/api/health/route.ts`

- [ ] **Step 1: Variables públicas validadas**

```ts
// src/lib/env.ts
import { z } from 'zod'

const esquema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
})

// Acceso explícito a cada variable: Next.js solo inlinea process.env.NEXT_PUBLIC_* escritas literalmente.
export const publicEnv = esquema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
})
```

- [ ] **Step 2: Cliente de servidor y de navegador**

```ts
// src/lib/supabase/server.ts
import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { publicEnv } from '@/lib/env'
import type { Database } from './database.types'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options)
          } catch {
            // Llamado desde un Server Component: no puede escribir cookies; el proxy refresca la sesión.
          }
        },
      },
    },
  )
}
```

```ts
// src/lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'
import { publicEnv } from '@/lib/env'
import type { Database } from './database.types'

export function createClient() {
  return createBrowserClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  )
}
```

- [ ] **Step 3: Refresco de sesión en el proxy**

Antes de escribirlo, revisar la firma de `setAll` en `node_modules/@supabase/ssr/dist/main/types.d.ts`. Si recibe un segundo parámetro `headers` (cabeceras anti-caché), hay que copiarlo a la respuesta como abajo. Si no lo recibe, quitar ese parámetro y el `for` que lo usa.

```ts
// src/lib/supabase/proxy.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { publicEnv } from '@/lib/env'

const RUTAS_PUBLICAS = ['/login']

function esPublica(pathname: string) {
  return RUTAS_PUBLICAS.some((ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`))
}

/** Redirige conservando las cookies de sesión que haya escrito Supabase. */
function redirigir(destino: URL, conCookiesDe: NextResponse) {
  const respuesta = NextResponse.redirect(destino)
  for (const cookie of conCookiesDe.cookies.getAll()) respuesta.cookies.set(cookie)
  return respuesta
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet, headers?: Record<string, string>) => {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options)
          for (const [clave, valor] of Object.entries(headers ?? {})) response.headers.set(clave, valor)
        },
      },
    },
  )

  // No poner código entre createServerClient y getClaims: esta llamada refresca la sesión.
  const { data } = await supabase.auth.getClaims()
  const autenticado = Boolean(data?.claims)
  const { pathname, search } = request.nextUrl

  if (!autenticado && !esPublica(pathname)) {
    const destino = request.nextUrl.clone()
    destino.pathname = '/login'
    destino.search = ''
    if (pathname !== '/') destino.searchParams.set('next', `${pathname}${search}`)
    return redirigir(destino, response)
  }

  if (autenticado && pathname === '/login') {
    const destino = request.nextUrl.clone()
    destino.pathname = '/'
    destino.search = ''
    return redirigir(destino, response)
  }

  return response
}
```

```ts
// src/proxy.ts
import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
```

- [ ] **Step 4: Health check (lo usan Railway y Playwright)**

```ts
// src/app/api/health/route.ts
export const dynamic = 'force-dynamic'

export function GET() {
  return Response.json({ ok: true })
}
```

- [ ] **Step 5: Verificar**

```bash
npm run typecheck && npm run build
```

Expected: sin errores. En la salida del build aparece `ƒ Proxy` (o `Middleware`).

```bash
npm run dev &
sleep 8
curl -s http://localhost:3000/api/health
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/clientes
kill %1
```

Expected: `{"ok":true}` y `307 http://localhost:3000/login?next=%2Fclientes`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/env.ts src/lib/supabase src/proxy.ts src/app/api/health
git commit -m "feat: clientes de Supabase, proxy de sesión y health check

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 11: Login, logout y usuario actual

**Files:**
- Create: `src/lib/auth/destino.ts`, `src/lib/auth/destino.test.ts`, `src/lib/auth.ts`, `src/app/login/page.tsx`, `src/app/login/login-form.tsx`, `src/app/login/actions.ts`, `src/app/sin-acceso/page.tsx`

- [ ] **Step 1: Test del destino seguro**

```ts
// src/lib/auth/destino.test.ts
import { describe, expect, it } from 'vitest'
import { destinoSeguro } from './destino'

describe('destinoSeguro', () => {
  it('acepta rutas internas', () => {
    expect(destinoSeguro('/clientes')).toBe('/clientes')
    expect(destinoSeguro('/cotizaciones?estado=enviada')).toBe('/cotizaciones?estado=enviada')
  })

  it.each([undefined, '', 'https://malicioso.com', '//malicioso.com', '/\\malicioso.com', 'clientes'])(
    'manda a / ante %j',
    (destino) => {
      expect(destinoSeguro(destino)).toBe('/')
    },
  )
})
```

- [ ] **Step 2: Correr y ver que falla**

```bash
npx vitest run src/lib/auth/destino.test.ts
```

Expected: FAIL porque no se puede resolver `./destino`.

- [ ] **Step 3: Implementar**

```ts
// src/lib/auth/destino.ts
/** Solo permite volver a rutas internas después del login (evita open redirects). */
export function destinoSeguro(destino: string | undefined | null): string {
  if (!destino || !destino.startsWith('/') || destino.startsWith('//') || destino.startsWith('/\\')) return '/'
  return destino
}
```

```bash
npx vitest run src/lib/auth/destino.test.ts
```

Expected: PASS.

- [ ] **Step 4: Usuario actual**

```ts
// src/lib/auth.ts
import 'server-only'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export type Rol = 'admin' | 'operador'

export type UsuarioActual = {
  id: string
  email: string
  nombre: string
  rol: Rol
}

type EstadoSesion =
  | { estado: 'anonimo' }
  | { estado: 'inactivo'; email: string }
  | { estado: 'activo'; usuario: UsuarioActual }

/** Valida la sesión con getClaims (nunca getSession en el servidor) y lee el perfil. */
export const getEstadoSesion = cache(async (): Promise<EstadoSesion> => {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (!claims) return { estado: 'anonimo' }

  const email = typeof claims.email === 'string' ? claims.email : ''

  // Por RLS, un usuario inactivo no puede leer ni su propio perfil.
  const { data: perfil } = await supabase
    .from('profiles')
    .select('nombre, rol, activo')
    .eq('id', claims.sub)
    .maybeSingle()

  if (!perfil?.activo) return { estado: 'inactivo', email }

  return {
    estado: 'activo',
    usuario: { id: claims.sub, email, nombre: perfil.nombre, rol: perfil.rol as Rol },
  }
})

/** Para layouts y páginas protegidas: devuelve el usuario activo o redirige. */
export async function requireUsuario(): Promise<UsuarioActual> {
  const sesion = await getEstadoSesion()
  if (sesion.estado === 'anonimo') redirect('/login')
  if (sesion.estado === 'inactivo') redirect('/sin-acceso')
  return sesion.usuario
}
```

- [ ] **Step 5: Server Actions de login y logout**

```ts
// src/app/login/actions.ts
'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { destinoSeguro } from '@/lib/auth/destino'
import { createClient } from '@/lib/supabase/server'

const esquema = z.object({
  email: z.email('Ingresá un email válido'),
  password: z.string().min(1, 'Ingresá tu contraseña'),
  next: z.string().optional(),
})

export type EstadoLogin = { error: string | null }

export async function iniciarSesion(_previo: EstadoLogin, formData: FormData): Promise<EstadoLogin> {
  const datos = esquema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    next: formData.get('next') ?? undefined,
  })
  if (!datos.success) return { error: datos.error.issues[0]?.message ?? 'Revisá los datos' }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: datos.data.email,
    password: datos.data.password,
  })
  if (error) return { error: 'Email o contraseña incorrectos' }

  redirect(destinoSeguro(datos.data.next))
}

export async function cerrarSesion() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
```

- [ ] **Step 6: Página de login**

```tsx
// src/app/login/page.tsx
import type { Metadata } from 'next'
import { LoginForm } from './login-form'

export const metadata: Metadata = { title: 'Ingresar · Equipos Patagónicos' }

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <p className="text-2xl font-bold tracking-tight text-primary">Equipos Patagónicos</p>
          <p className="text-sm text-muted-foreground">Administración y logística</p>
        </div>
        <LoginForm next={next} />
      </div>
    </main>
  )
}
```

```tsx
// src/app/login/login-form.tsx
'use client'

import { useActionState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { iniciarSesion, type EstadoLogin } from './actions'

const estadoInicial: EstadoLogin = { error: null }

export function LoginForm({ next }: { next?: string }) {
  const [estado, accion, pendiente] = useActionState(iniciarSesion, estadoInicial)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ingresar</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={accion} className="space-y-4">
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          {estado.error ? (
            <Alert variant="destructive">
              <AlertDescription>{estado.error}</AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" className="w-full" disabled={pendiente}>
            {pendiente ? 'Ingresando…' : 'Ingresar'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 7: Página para usuarios inactivos**

```tsx
// src/app/sin-acceso/page.tsx
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { getEstadoSesion } from '@/lib/auth'
import { cerrarSesion } from '../login/actions'

export default async function SinAccesoPage() {
  const sesion = await getEstadoSesion()
  if (sesion.estado === 'activo') redirect('/')

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <div className="max-w-sm space-y-4 text-center">
        <h1 className="text-xl font-semibold">Tu usuario todavía no está habilitado</h1>
        <p className="text-sm text-muted-foreground">
          Pedile a un administrador que active tu cuenta
          {sesion.estado === 'inactivo' && sesion.email ? ` (${sesion.email})` : ''}.
        </p>
        <form action={cerrarSesion}>
          <Button type="submit" variant="outline">
            Cerrar sesión
          </Button>
        </form>
      </div>
    </main>
  )
}
```

- [ ] **Step 8: Verificar y commit**

```bash
npm run check
git add src/lib/auth.ts src/lib/auth src/app/login src/app/sin-acceso
git commit -m "feat: login, logout y validación del usuario activo

Co-Authored-By: Claude <noreply@anthropic.com>"
```

Expected de `npm run check`: lint, typecheck y tests unitarios sin errores.

---

### Task 12: Layout de la app con navegación

**Files:**
- Create: `src/components/app-shell/nav-items.ts`, `sidebar-nav.tsx`, `mobile-nav.tsx`, `user-menu.tsx`, `app-shell.tsx`, `seccion-pendiente.tsx`
- Create: `src/app/(app)/layout.tsx`, `src/app/(app)/page.tsx`, `src/app/(app)/cotizaciones/page.tsx`, `src/app/(app)/presupuestos/page.tsx`, `src/app/(app)/clientes/page.tsx`, `src/app/(app)/configuracion/page.tsx`
- Modify: `src/app/layout.tsx`
- Delete: `src/app/page.tsx` (lo reemplaza `src/app/(app)/page.tsx`)

- [ ] **Step 1: Layout raíz**

Reemplazar `src/app/layout.tsx` y conservar las fuentes Geist que generó create-next-app:

```tsx
// src/app/layout.tsx
import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Equipos Patagónicos',
  description: 'Administración y logística',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-AR">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  )
}
```

Borrar la página de ejemplo:

```bash
git rm src/app/page.tsx
```

- [ ] **Step 2: Ítems de navegación**

```ts
// src/components/app-shell/nav-items.ts
import { FileText, Home, Settings, Truck, Users, type LucideIcon } from 'lucide-react'

export type NavItem = { href: string; label: string; icon: LucideIcon }

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Inicio', icon: Home },
  { href: '/cotizaciones', label: 'Cotizaciones', icon: FileText },
  { href: '/presupuestos', label: 'Presupuestos', icon: Truck },
  { href: '/clientes', label: 'Clientes', icon: Users },
  { href: '/configuracion', label: 'Configuración', icon: Settings },
]

export function estaActivo(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)
}
```

- [ ] **Step 3: Navegación lateral y móvil**

```tsx
// src/components/app-shell/sidebar-nav.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { NAV_ITEMS, estaActivo } from './nav-items'

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()

  return (
    <nav aria-label="Principal" className="flex flex-col gap-1">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const activo = estaActivo(pathname, href)
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={activo ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              activo
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
```

```tsx
// src/components/app-shell/mobile-nav.tsx
'use client'

import { Menu } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { SidebarNav } from './sidebar-nav'

export function MobileNav() {
  const [abierto, setAbierto] = useState(false)

  return (
    <Sheet open={abierto} onOpenChange={setAbierto}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir menú">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-4">
        <SheetHeader className="p-0 pb-4">
          <SheetTitle className="text-left text-primary">Equipos Patagónicos</SheetTitle>
        </SheetHeader>
        <SidebarNav onNavigate={() => setAbierto(false)} />
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Step 4: Menú de usuario**

```tsx
// src/components/app-shell/user-menu.tsx
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
        <DropdownMenuItem onSelect={() => void cerrarSesion()}>
          <LogOut className="size-4" aria-hidden />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

- [ ] **Step 5: Shell y sección pendiente**

```tsx
// src/components/app-shell/app-shell.tsx
import type { UsuarioActual } from '@/lib/auth'
import { MobileNav } from './mobile-nav'
import { SidebarNav } from './sidebar-nav'
import { UserMenu } from './user-menu'

export function AppShell({ usuario, children }: { usuario: UsuarioActual; children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh">
      <aside className="hidden w-60 shrink-0 border-r bg-muted/30 p-4 md:block">
        <p className="mb-6 px-3 text-lg font-bold tracking-tight text-primary">Equipos Patagónicos</p>
        <SidebarNav />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-2 border-b px-4">
          <div className="flex items-center gap-2">
            <MobileNav />
            <span className="font-semibold text-primary md:hidden">Equipos Patagónicos</span>
          </div>
          <UserMenu nombre={usuario.nombre} email={usuario.email} />
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}
```

```tsx
// src/components/app-shell/seccion-pendiente.tsx
export function SeccionPendiente({ titulo, descripcion }: { titulo: string; descripcion: string }) {
  return (
    <section className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
      <p className="text-muted-foreground">{descripcion}</p>
    </section>
  )
}
```

- [ ] **Step 6: Layout protegido y páginas**

```tsx
// src/app/(app)/layout.tsx
import { AppShell } from '@/components/app-shell/app-shell'
import { requireUsuario } from '@/lib/auth'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const usuario = await requireUsuario()
  return <AppShell usuario={usuario}>{children}</AppShell>
}
```

```tsx
// src/app/(app)/page.tsx
import { SeccionPendiente } from '@/components/app-shell/seccion-pendiente'
import { requireUsuario } from '@/lib/auth'

export default async function InicioPage() {
  const usuario = await requireUsuario()
  return (
    <SeccionPendiente
      titulo="Inicio"
      descripcion={`Hola, ${usuario.nombre}. Acá vas a ver las colas de trabajo: seguimiento de cotizaciones, presupuestos sin OC, remitos para facturar y cobranzas.`}
    />
  )
}
```

```tsx
// src/app/(app)/cotizaciones/page.tsx
import { SeccionPendiente } from '@/components/app-shell/seccion-pendiente'

export default function CotizacionesPage() {
  return <SeccionPendiente titulo="Cotizaciones" descripcion="Crear, enviar y aprobar cotizaciones." />
}
```

```tsx
// src/app/(app)/presupuestos/page.tsx
import { SeccionPendiente } from '@/components/app-shell/seccion-pendiente'

export default function PresupuestosPage() {
  return (
    <SeccionPendiente
      titulo="Presupuestos"
      descripcion="Cotizaciones aprobadas con sus órdenes de compra, remitos, facturas y órdenes de pago."
    />
  )
}
```

```tsx
// src/app/(app)/clientes/page.tsx
import { SeccionPendiente } from '@/components/app-shell/seccion-pendiente'

export default function ClientesPage() {
  return <SeccionPendiente titulo="Clientes" descripcion="Clientes y contactos." />
}
```

```tsx
// src/app/(app)/configuracion/page.tsx
import { SeccionPendiente } from '@/components/app-shell/seccion-pendiente'

export default function ConfiguracionPage() {
  return (
    <SeccionPendiente
      titulo="Configuración"
      descripcion="Datos de la empresa, firmantes, equipos y plantillas."
    />
  )
}
```

- [ ] **Step 7: Verificar y commit**

```bash
npm run check && npm run build
git add -A
git commit -m "feat: layout con navegación lateral y móvil

Co-Authored-By: Claude <noreply@anthropic.com>"
```

Expected: check y build sin errores.

---

### Task 13: Script para crear usuarios

**Files:**
- Create: `scripts/crear-usuario.mjs`
- Modify: `package.json` (script `usuario:crear`)

- [ ] **Step 1: Escribir el script**

```js
// scripts/crear-usuario.mjs
// Crea un usuario activo. Uso:
//   npm run usuario:crear -- --email guido@ejemplo.com --password 'xxxx' --nombre 'Guido Olguín' [--rol admin|operador]
// Para producción: node --env-file=.env.production.local scripts/crear-usuario.mjs ...
import { parseArgs } from 'node:util'
import { createClient } from '@supabase/supabase-js'

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    password: { type: 'string' },
    nombre: { type: 'string' },
    rol: { type: 'string', default: 'admin' },
  },
})

const { email, password, nombre, rol } = values
if (!email || !password || !nombre) {
  console.error('Faltan datos: --email, --password y --nombre son obligatorios')
  process.exit(1)
}
if (!['admin', 'operador'].includes(rol)) {
  console.error('--rol tiene que ser admin u operador')
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const secretKey = process.env.SUPABASE_SECRET_KEY
if (!url || !secretKey) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY en el entorno')
  process.exit(1)
}

const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })

const { data, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { nombre },
})
if (error) {
  console.error(`No se pudo crear el usuario: ${error.message}`)
  process.exit(1)
}

const { error: errorPerfil } = await admin.from('profiles').update({ activo: true, rol }).eq('id', data.user.id)
if (errorPerfil) {
  console.error(`Usuario creado pero no se pudo activar: ${errorPerfil.message}`)
  process.exit(1)
}

console.log(`Usuario ${email} creado y activo con rol ${rol}`)
```

En `package.json`:

```json
"usuario:crear": "node --env-file=.env.local scripts/crear-usuario.mjs"
```

- [ ] **Step 2: Probarlo contra la base local**

```bash
npm run usuario:crear -- --email prueba-script@equipos.test --password 'Prueba-1234-segura' --nombre 'Prueba Script'
node --env-file=.env.local -e "
const pg = require('pg');
const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
c.connect().then(() => c.query(\"select nombre, rol, activo from public.profiles where nombre = 'Prueba Script'\"))
  .then((r) => { console.log(r.rows); return c.end() });
"
```

Expected: `Usuario prueba-script@equipos.test creado y activo con rol admin` y `[ { nombre: 'Prueba Script', rol: 'admin', activo: true } ]`. Después correr `npm run db:reset` para limpiar.

- [ ] **Step 3: Commit**

```bash
git add scripts/crear-usuario.mjs package.json
git commit -m "feat: script para crear usuarios activos

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 14: E2E de autenticación con Playwright

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/credenciales.ts`, `tests/e2e/global-setup.ts`, `tests/e2e/auth.spec.ts`
- Modify: `package.json` (script `test:e2e`)

- [ ] **Step 1: Instalar**

```bash
npm install -D @playwright/test@1.64.1
npx playwright install chromium
```

- [ ] **Step 2: Configuración**

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000/api/health',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
```

```ts
// tests/e2e/credenciales.ts
export const E2E_EMAIL = 'e2e@equipos.test'
export const E2E_PASSWORD = 'E2e-1234-segura'
export const E2E_NOMBRE = 'Usuario E2E'
```

```ts
// tests/e2e/global-setup.ts
import { createClient } from '@supabase/supabase-js'
import { E2E_EMAIL, E2E_NOMBRE, E2E_PASSWORD } from './credenciales'

/** Deja un usuario admin activo con contraseña conocida (idempotente). */
export default async function globalSetup() {
  process.loadEnvFile('.env.local')
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: lista, error: errorLista } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (errorLista) throw errorLista

  let id = lista.users.find((u) => u.email === E2E_EMAIL)?.id
  if (id) {
    const { error } = await admin.auth.admin.updateUserById(id, { password: E2E_PASSWORD })
    if (error) throw error
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: E2E_EMAIL,
      password: E2E_PASSWORD,
      email_confirm: true,
      user_metadata: { nombre: E2E_NOMBRE },
    })
    if (error) throw error
    id = data.user.id
  }

  const { error } = await admin.from('profiles').update({ activo: true, rol: 'admin', nombre: E2E_NOMBRE }).eq('id', id)
  if (error) throw error
}
```

- [ ] **Step 3: Tests**

```ts
// tests/e2e/auth.spec.ts
import { expect, test } from '@playwright/test'
import { E2E_EMAIL, E2E_NOMBRE, E2E_PASSWORD } from './credenciales'

test('sin sesión redirige al login y vuelve a la página pedida después de ingresar', async ({ page }) => {
  await page.goto('/clientes')
  await expect(page).toHaveURL(/\/login\?next=%2Fclientes$/)

  await page.getByLabel('Email').fill(E2E_EMAIL)
  await page.getByLabel('Contraseña').fill(E2E_PASSWORD)
  await page.getByRole('button', { name: 'Ingresar' }).click()

  await expect(page).toHaveURL(/\/clientes$/)
  await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible()
})

test('muestra un error con contraseña incorrecta', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(E2E_EMAIL)
  await page.getByLabel('Contraseña').fill('incorrecta')
  await page.getByRole('button', { name: 'Ingresar' }).click()

  await expect(page.getByText('Email o contraseña incorrectos')).toBeVisible()
  await expect(page).toHaveURL(/\/login/)
})

test('navega por las secciones y cierra sesión', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(E2E_EMAIL)
  await page.getByLabel('Contraseña').fill(E2E_PASSWORD)
  await page.getByRole('button', { name: 'Ingresar' }).click()

  await expect(page.getByRole('heading', { name: 'Inicio' })).toBeVisible()
  await expect(page.getByText(`Hola, ${E2E_NOMBRE}`)).toBeVisible()

  await page.getByRole('link', { name: 'Cotizaciones' }).click()
  await expect(page.getByRole('heading', { name: 'Cotizaciones' })).toBeVisible()

  await page.getByRole('button', { name: 'Menú de usuario' }).click()
  await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click()
  await expect(page).toHaveURL(/\/login/)

  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
})
```

En `package.json`:

```json
"test:e2e": "playwright test"
```

- [ ] **Step 4: Correr**

```bash
npm run test:e2e
```

Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts tests/e2e package.json package-lock.json
git commit -m "test: E2E de login, navegación y logout

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 15: README y verificación final

**Files:**
- Create/Modify: `README.md` (reemplaza el que genera create-next-app)

- [ ] **Step 1: README**

````markdown
# Equipos Patagónicos · Administración y logística

App interna para cotizaciones, clientes, presupuestos y documentos del circuito de venta (OC, remitos, facturas y órdenes de pago).

- Diseño: `docs/plans/2026-10-23-equipos-patagonicos-mvp-design.md`
- Planes de implementación: `docs/superpowers/plans/`

## Requisitos

- Node.js 22 o superior
- Docker (para Supabase local)

## Puesta en marcha local

```bash
npm install
npm run db:start          # levanta Supabase local (Docker)
npm run env:local         # genera .env.local con las keys locales
npm run db:reset          # aplica migraciones y seed
npm run usuario:crear -- --email tu@email.com --password 'una-clave-segura' --nombre 'Tu Nombre'
npm run dev               # http://localhost:3000
```

Supabase Studio local: http://127.0.0.1:54323

## Scripts

| Script | Qué hace |
|---|---|
| `npm run check` | lint + typecheck + tests unitarios |
| `npm run test:int` | tests de integración contra Supabase local (RLS, triggers) |
| `npm run test:e2e` | tests E2E con Playwright |
| `npm run db:types` | regenera `src/lib/supabase/database.types.ts` |
| `npm run usuario:crear` | crea un usuario activo |

## Seguridad

- El registro público está deshabilitado: los usuarios se crean con `usuario:crear` (o desde el panel de Supabase) y nacen inactivos hasta que se los activa.
- Todas las tablas tienen RLS y GRANTs explícitos; `anon` no accede a nada.
- `SUPABASE_SECRET_KEY` solo se usa en scripts y en el servidor, nunca con prefijo `NEXT_PUBLIC_`.
````

- [ ] **Step 2: Verificación completa**

```bash
npm run check && npm run test:int && npm run build && npm run test:e2e
```

Expected: todo en verde.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README con puesta en marcha local

Co-Authored-By: Claude <noreply@anthropic.com>"
```
