# CUIT informado — implementación

> Ejecución en esta sesión sobre `codex/cuit-sin-validacion`, con la decisión explícita del usuario documentada en `docs/plans/2026-10-31-cuit-informado-design.md`.

**Objetivo:** aceptar el CUIT informado sin validación fiscal en toda la aplicación.

**Arquitectura:** el esquema compartido acepta texto opcional; la normalización solo retira separadores de entradas numéricas; una migración elimina los CHECK de Clientes/Empresa y la función matemática que dejan de usar. El importador deja de calcular el verificador. El editor admite el mismo dato textual.

**Tecnologías:** Next.js, TypeScript/Zod, PostgreSQL/Supabase, Vitest y Playwright.

## 1. Regresión del requisito

- [ ] Reemplazar los casos que exigen CUIT válido en `src/lib/clientes/esquemas.test.ts` y `src/lib/catalogos/esquemas.test.ts` por aceptación de verificador distinto, longitud libre y texto.
- [ ] En `src/lib/cuit.test.ts`, comprobar que se conservan entradas con letras y que el formato solo se aplica a once dígitos.
- [ ] En `scripts/historicos/preparar.test.mjs`, comprobar que un CUIT informado y un emisor no verificados matemáticamente conservan sus valores.
- [ ] Ejecutar `npm test -- src/lib/cuit.test.ts src/lib/clientes/esquemas.test.ts src/lib/catalogos/esquemas.test.ts` y `npm run test:historicos` para observar los fallos del requisito nuevo.

## 2. Aplicación y base

- [ ] Eliminar `validarCuit` de `src/lib/cuit.ts`; normalizar con `const texto = entrada.trim(); return /^[\d\s.-]*$/.test(texto) ? texto.replace(/\D/g, '') : texto` y formatear solo cuando `/^\d{11}$/.test(cuit)`.
- [ ] En `src/lib/validacion.ts`, usar `z.string().transform(normalizarCuit).transform(cuit => cuit === '' ? null : cuit)`.
- [ ] Cambiar el CUIT de `esquemaEstadoEditor` de `z.string().max(20).nullable()` a `z.string().nullable()`.
- [ ] Eliminar `cuitValido` del preparador; comprobar únicamente `typeof cliente.cuit === 'string'`, y conservar la expresión del nombre de PDF sin comprobar el verificador del emisor.
- [ ] Crear `supabase/migrations/20261031100000_cuit_informado.sql` con `alter table public.clientes drop constraint clientes_cuit_check; alter table public.empresa_config drop constraint empresa_config_cuit_check; drop function private.cuit_valido(text);` y actualizar los comentarios de las columnas.

## 3. Integración y navegador

- [ ] Sustituir los rechazos fiscales de `tests/integration/clientes.test.ts` por creación/edición aceptadas; conservar la comprobación de duplicados.
- [ ] En `tests/integration/catalogos.test.ts`, probar edición del CUIT de Empresa por admin y restaurar el dato en `finally`.
- [ ] En `tests/e2e/clientes.spec.ts`, conservar la prueba de datos ante un error de email y crear el cliente con el CUIT antes rechazado; comprobar su persistencia al editar y recargar.
- [ ] Ejecutar `npm run check`, `npm run test:int -- tests/integration/clientes.test.ts tests/integration/catalogos.test.ts tests/integration/facturas-historicas.test.ts` y `npm run test:e2e -- tests/e2e/clientes.spec.ts`.
- [ ] Confirmar destrucción de ambos proyectos y `git diff --check`.

## 4. Documentación y entrega

- [ ] Actualizar el requisito de CUIT del diseño original, README y la decisión posterior en el informe de revisión.
- [ ] Revisar el diff final y registrar los resultados de verificación. No probar altas ficticias en producción.
