# CUIT informado — implementación

> Ejecución en esta sesión sobre `codex/cuit-sin-validacion`, con la decisión explícita del usuario documentada en `docs/plans/2026-10-31-cuit-informado-design.md`.

**Objetivo:** aceptar el CUIT informado sin validación fiscal en toda la aplicación.

**Arquitectura:** el esquema compartido acepta texto opcional; la normalización solo retira separadores de entradas numéricas; una migración elimina los CHECK de Clientes/Empresa y la función matemática que dejan de usar. El importador deja de calcular el verificador. El editor admite el mismo dato textual.

**Tecnologías:** Next.js, TypeScript/Zod, PostgreSQL/Supabase, Vitest y Playwright.

## 1. Regresión del requisito

- [x] Reemplazar los casos que exigen CUIT válido en `src/lib/clientes/esquemas.test.ts` y `src/lib/catalogos/esquemas.test.ts` por aceptación de verificador distinto, longitud libre y texto.
- [x] En `src/lib/cuit.test.ts`, comprobar que se conservan entradas con letras y que el formato solo se aplica a once dígitos.
- [x] En `scripts/historicos/preparar.test.mjs`, comprobar que un CUIT informado y un emisor no verificados matemáticamente conservan sus valores.
- [x] Ejecutar `npm test -- src/lib/cuit.test.ts src/lib/clientes/esquemas.test.ts src/lib/catalogos/esquemas.test.ts` y `npm run test:historicos` para observar los fallos del requisito nuevo.

## 2. Aplicación y base

- [x] Eliminar `validarCuit` de `src/lib/cuit.ts`; normalizar con `const texto = entrada.trim(); return /^[\d\s.-]*$/.test(texto) ? texto.replace(/\D/g, '') : texto` y formatear solo cuando `/^\d{11}$/.test(cuit)`.
- [x] En `src/lib/validacion.ts`, usar `z.string().transform(normalizarCuit).transform(cuit => cuit === '' ? null : cuit)`.
- [x] Cambiar el CUIT de `esquemaEstadoEditor` de `z.string().max(20).nullable()` a `z.string().nullable()`.
- [x] Eliminar `cuitValido` del preparador; comprobar únicamente `typeof cliente.cuit === 'string'`, y conservar la expresión del nombre de PDF sin comprobar el verificador del emisor.
- [x] Crear `supabase/migrations/20261031100000_cuit_informado.sql` con `alter table public.clientes drop constraint clientes_cuit_check; alter table public.empresa_config drop constraint empresa_config_cuit_check; drop function private.cuit_valido(text);` y actualizar los comentarios de las columnas.

## 3. Integración y navegador

- [x] Sustituir los rechazos fiscales de `tests/integration/clientes.test.ts` por creación/edición aceptadas; conservar la comprobación de duplicados.
- [x] En `tests/integration/catalogos.test.ts`, probar edición del CUIT de Empresa por admin y restaurar el dato en `finally`.
- [x] En `tests/e2e/clientes.spec.ts`, conservar la prueba de datos ante un error de email y crear el cliente con el CUIT antes rechazado; comprobar su persistencia al editar y recargar.
- [x] Ejecutar `npm run check`, `npm run test:int -- tests/integration/clientes.test.ts tests/integration/catalogos.test.ts tests/integration/facturas-historicas.test.ts` y `npm run test:e2e -- tests/e2e/clientes.spec.ts`.
- [x] Confirmar destrucción de ambos proyectos y `git diff --check`.

## 4. Documentación y entrega

- [x] Actualizar el requisito de CUIT del diseño original, README y la decisión posterior en el informe de revisión.
- [x] Revisar el diff final y registrar los resultados de verificación. No probar altas ficticias en producción.

## Resultados

Lint y TypeScript correctos; 481 pruebas unitarias, 17 del importador, 59 de integración y 4 de navegador aprobadas. Los proyectos descartables se destruyeron. Se observaron primero los fallos del requisito nuevo en los tests de esquemas y del importador.
