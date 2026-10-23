# Equipos Patagónicos — App de administración y logística · Diseño del MVP

- **Fecha:** 2026-10-23
- **Estado:** propuesto, pendiente de aprobación
- **Origen:** brainstorming con Guido + revisión crítica multi-lente (negocio, técnica, UX, alcance) con verificación adversarial de los hallazgos graves.

---

## 1. Contexto

Equipos Patagónicos (T. Planas 5168, Neuquén) alquila grúas telescópicas con operador y servicios asociados (movilización, desmovilización, pick-up, jornadas y horas adicionales) a empresas de la zona (Milicic S.A., Vértice Servicios Integrales S.R.L., operadoras de Vaca Muerta). Hoy las cotizaciones se arman en Word, con numeración correlativa (~112.7xx). Emiten unas 55-60 por mes.

Hay dos formatos reales de cotización:

| Formato | Ejemplo | Estructura |
|---|---|---|
| **Mensual** | `PARA USAR DE PRINT( mensuales).pdf` (N° 112523, Milicic) | Destinatario + "Atte." + email, tabla de ítems (Ítem, Descripción, Cantidad, Precio, Moneda, Unid V., Total por línea), bloques "Condiciones particulares del servicio", "Condiciones para la contratación", "Renegociación de tarifas" (FADEEAC ICTF, validez 30 días) y firma. |
| **Por jornada** | `COTIZACION N° 112711 vertice .pdf` (N° 112711, Vértice) | "Señores" + razón social + CUIT, asunto, intro, "Equipo ofrecido", "Alcance", "Precios Jornada" / "Precios Jornada Adicional" (`$ 1.950.000.- más IVA`), forma de pago, disponibilidad y firma. |

Los dos llevan membrete con logo, fecha "Neuquén, 22 de octubre de 2026.", precios sin IVA y montos con formato es-AR. **No muestran un total general**: en el mensual los ítems son tarifas alternativas (mensual, semanal, jornada, hora adicional), así que sumarlas no tiene sentido.

## 2. Decisiones cerradas con el usuario

1. **Cotización** = documento de venta al cliente.
2. **Presupuesto** = cotización **aprobada** por el cliente. Abre el circuito de venta: orden de compra del cliente → remitos → facturas → órdenes de pago del cliente (cobro). Los cuatro documentos son archivos que se cargan.
3. **Stack:** Next.js + Supabase (Postgres, Auth, Storage). El front corre en **Railway** y producción usa **Supabase Free**.
4. **Usuarios:** hoy usa la app una sola persona, pero queda preparada para varios usuarios con roles.
5. **Catálogos:** equipos (grúas) y plantillas (mensual / por jornada). Sin tarifario: los precios se escriben en cada cotización.
6. **Moneda:** siempre ARS.
7. **Numeración:** sigue la correlativa actual. Además se pueden **cargar cotizaciones existentes** con su número original.

## 3. Alcance

### Incluido en el MVP
1. **Clientes** con contactos. Alta rápida desde el editor de cotización. CUIT opcional para cotizar y validado con dígito verificador cuando se carga.
2. **Cotizaciones** en los dos formatos, armadas desde una plantilla con equipo, ítems, bloques de texto con formato mínimo y variables. El PDF replica el actual. Acciones: duplicar, "Descargar y marcar enviada" (guarda snapshot), aprobar, rechazar y reabrir.
3. **Carga de cotizaciones existentes:** número original, cliente, fecha y PDF. Pueden entrar como enviada o como aprobada.
4. **Presupuestos** (cotizaciones aprobadas): OC, remitos, facturas y órdenes de pago, cada documento con N archivos. Estado manual `en curso / finalizado / anulado`, indicadores por tipo de documento y saldo a cobrar.
5. **Presupuesto directo** para trabajos sin cotización formal (urgencias, acuerdos telefónicos, OC abierta): crea una cotización mínima ya aprobada.
6. **Inicio** con colas de trabajo accionables.
7. **Búsqueda global**: N° de cotización, cliente, CUIT y N° de OC, remito o factura.
8. **Configuración:** datos de la empresa, firmantes, equipos y plantillas.

### Fuera del MVP (fase 2 o más adelante)
Facturación electrónica ARCA y lectura de CAE, emisión de remitos, envío de emails desde la app ("marcar enviada" es manual: la cotización se manda desde el correo de siempre), proveedores y cuentas a pagar, desglose de retenciones y conciliación bancaria, notas de crédito aplicadas al saldo, tarifario, cálculo automático del ajuste ICTF, reportes y exportaciones, pantalla de usuarios y roles (los usuarios se crean desde el panel o por script), importador de clientes en la UI (se hace con un script), USD.

## 4. Modelo de datos (Postgres)

Todas las tablas viven en `public`, tienen RLS activado y GRANTs explícitos (ver §7.3). Hay timestamps y `created_by` donde aplica.

```
empresa_config (singleton)  razon_social, cuit, direccion, ciudad ('Neuquén'), telefono, email, web
profiles                    id → auth.users, nombre, rol ('admin'|'operador'), activo (default false), firmante_id?
firmantes                   nombre, cargo, telefono, email, activo
clientes                    razon_social, cuit? (11 díg., UNIQUE parcial, DV validado), condicion_iva, direccion,
                            localidad, provincia, telefono, email, condicion_pago_default, notas, activo
contactos                   cliente_id, nombre, cargo, email, telefono
equipos                     nombre, capacidad_tn, marca, modelo, interno/dominio?, descripcion ("Equipo ofrecido"), activo
plantillas                  nombre, formato ('mensual'|'jornada'), asunto_tpl, intro_tpl,
                            bloques jsonb [{titulo, contenido}], items_default jsonb [{seccion, descripcion, unidad, cantidad}],
                            validez_dias, activa

cotizaciones                numero bigint GENERATED BY DEFAULT AS IDENTITY UNIQUE,
                            origen ('app'|'importada'|'directa'), fecha date (default: hoy en hora argentina),
                            cliente_id, contacto_id?, formato, plantilla_id?, equipo_id?, firmante_id?,
                            asunto, intro, ubicacion, datos jsonb (variables: plazo_entrega, horario, forma_pago,
                            disponibilidad, indice_base…), proxima_actualizacion date?,
                            bloques jsonb, validez_dias, mostrar_total bool (default false),
                            estado ('borrador'|'enviada'|'aprobada'|'rechazada'),
                            fecha_aprobacion date?, pdf_aprobado_path?, archivo_original_path? (importadas),
                            reemplaza_a? (renegociación / duplicado),
                            presupuesto_estado ('en_curso'|'finalizado'|'anulado')?, presupuesto_motivo?
cotizacion_items            cotizacion_id, orden, seccion?, descripcion, cantidad numeric, precio_unitario numeric(14,2),
                            unidad ('UNIDAD'|'JORNADA'|'HORA'|'SEMANA'|'MES'|'VIAJE'), total (columna generada)
cotizacion_envios           cotizacion_id, enviada_at, pdf_path        ← historial de lo que recibió el cliente

documentos                  cliente_id, tipo ('orden_compra'|'remito'|'factura'|'orden_pago'),
                            numero, numero_normalizado (generada), fecha, monto? (obligatorio en factura y OP),
                            -- factura:  tipo_comprobante (FA, FCE A, FB, ND, NC), fecha_vencimiento?, numero_oc_ref?
                            -- remito:   periodo_desde?, periodo_hasta?, equipo_id?, factura_id? (la factura que lo cubre)
                            notas, deleted_at?, deleted_by?            ← borrado lógico
documento_archivos          documento_id, path, nombre_original, mime, tamano, orden   ← N páginas o archivos por documento
documento_presupuestos      documento_id, cotizacion_id  (N:M)         ← una OC u OP puede cubrir varios presupuestos
op_facturas                 op_id, factura_id, monto_aplicado          ← qué facturas cancela cada OP
```

**¿Por qué N:M?** Una OC abierta puede cubrir varias cotizaciones (por ejemplo, la original y la renegociada por ICTF), y una OP de un cliente grande suele cancelar facturas de varios presupuestos. Cada PDF se sube **una sola vez** y se vincula a uno o más presupuestos del mismo cliente.

**Vistas** (`security_invoker = true`):
- `v_cotizaciones`: agrega `vencida` = `enviada` y `fecha + validez_dias < hoy (AR)`. Se deriva, no se guarda.
- `v_facturas`: saldo = `monto − Σ op_facturas.monto_aplicado` y estado `pendiente / vencida / parcial / cobrada`.
- `v_presupuestos`: conteos por tipo (OC · remitos · facturas · OP), saldo a cobrar, remitos sin factura y alertas.

**Indicadores en lugar de una etapa lineal.** En un alquiler mensual hay N remitos, N facturas y N OP, y los documentos no llegan en orden (es común que el remito llegue antes que la OC). Por eso el presupuesto muestra contadores y saldo; "cobrado" significa saldo cero sobre las facturas cargadas. El cierre es manual (`finalizado`), y también sirve para cerrar el presupuesto anterior cuando hay renegociación.

## 5. Reglas de negocio (se aplican en la base, no solo en Next)

- **Numeración:** `IDENTITY BY DEFAULT`. Al crear se asigna `nextval` (se aceptan huecos). Al **cargar una cotización existente** se usa su número explícito (UNIQUE), y si supera la secuencia se hace `setval(max)`. El día de lanzamiento se fija la secuencia en el último número real emitido. En la UI el próximo número es de solo lectura.
- **Transiciones** (en funciones RPC):
  - `borrador → enviada`: "Descargar y marcar enviada" guarda el snapshot en `cotizacion_envios`.
  - `enviada → aprobada` (con fecha de aprobación editable) o `→ rechazada`.
  - `rechazada → borrador` (reabrir).
  - En borrador y enviada se puede editar; el historial de envíos queda.
  - **Aprobada = congelada:** un trigger bloquea los cambios de contenido y de ítems. "Revertir aprobación" solo se permite si no hay documentos vinculados.
- **Cargar una OC sobre una cotización enviada** ofrece "Aprobar y adjuntar OC" en un solo paso, con fecha de aprobación = fecha de la OC.
- **Documentos:** solo se vinculan a presupuestos aprobados **del mismo cliente** (trigger). Factura y OP exigen monto (CHECK). Borrar es lógico: el archivo no se borra de Storage.
- **Renegociación (ICTF):** "Duplicar" crea un borrador con número nuevo y `reemplaza_a` apuntando a la original. Al aprobar la nueva, se ofrece finalizar el presupuesto anterior.
- **Totales:** se muestra el total por línea (cantidad × precio). El total general no aparece salvo que se active `mostrar_total` en esa cotización. Las listas y el inicio nunca muestran montos cotizados; los montos que importan son los de facturas y OP.

## 6. Pantallas y flujos

- **Inicio: colas de trabajo.** Cada cola muestra su conteo y las primeras filas, y cada fila lleva al presupuesto con el diálogo del documento faltante abierto.
  1. *Seguimiento:* enviadas sin respuesta hace más de 5 días o que vencen en 7 días o menos (con teléfono y mail del contacto).
  2. *Falta OC:* presupuestos en curso sin OC.
  3. *Para facturar:* remitos sin factura.
  4. *Cobranzas:* facturas con saldo, por antigüedad (30/45/60 días), con el total pendiente.
  5. *Actualización de tarifa:* presupuestos en curso con `proxima_actualizacion` en 30 días o menos.

  Arriba van los botones **Nueva cotización** y **Subir documento** (en el celular, el botón principal es este último).
- **Clientes:** lista con búsqueda (sin acentos, parcial, por CUIT con o sin guiones). La ficha incluye contactos inline, sus cotizaciones y sus presupuestos.
- **Editor de cotización**, pensado para ser más rápido que Word:
  - Combobox de cliente con "+ Crear cliente «texto»" y el último contacto usado preseleccionado. Ofrece "Basar en la última cotización a este cliente".
  - Arriba, un formulario corto "Datos de esta cotización" (equipo, ubicación, plazo, horario, forma de pago, próxima actualización) que alimenta las **variables** `{{equipo_descripcion}}`, `{{capacidad}}`, `{{ubicacion}}` y demás de los bloques. El asunto y la intro se generan a partir de esos datos y se pueden editar. Si una variable queda sin valor, se resalta y bloquea "marcar enviada".
  - Grilla de ítems manejable con teclado: Tab avanza, Enter agrega una fila, se reordena arrastrando y acepta precios pegados como `39.000.000`, `39000000` o `39.000.000,00`. La plantilla precarga los ítems sin precio.
  - Bloques de texto con **formato mínimo**: párrafo, viñetas de dos niveles y negrita. Al pegar desde Word se limpia el formato. Cada bloque se puede reordenar, ocultar en esta cotización o restaurar desde la plantilla.
  - Vista previa del PDF en un panel (escritorio) o en otra pestaña (celular). Se renderiza en el servidor con los mismos componentes que el PDF final, con un botón "Actualizar".
  - "Guardar como plantilla" desde una cotización.
- **Cotizaciones:** lista con filtros por estado (incluye vencidas), cliente, fechas y número. Acciones: Duplicar (permite elegir otro cliente), Cargar cotización existente y Presupuesto directo.
- **Presupuesto (detalle):** cuatro secciones (OC, Remitos, Facturas, OP), cada una con su lista y un botón "+". Al cargar una factura se tildan los remitos que cubre; al cargar una OP se tildan las facturas que cancela, con el monto aplicado precargado con el saldo. Cada documento tiene un menú con: reemplazar archivo, editar datos (incluido el tipo), mover a otro presupuesto, vincular a otro presupuesto del cliente y eliminar (con "Deshacer"). Antes de guardar se ve una miniatura del archivo, y se avisa si ya existe el mismo tipo y número.
- **Subir documento desde el celular:** se elige el presupuesto (los activos primero, con búsqueda), el tipo (remito por defecto) y se suben fotos con "Sacar foto" o "Elegir archivo", con "+ página" para agregar más. Número y fecha son opcionales: si falta el número queda "pendiente de completar". Las fotos se comprimen en el teléfono antes de subir y hay un botón de reintentar.
- **Configuración:** datos de la empresa, firmantes, equipos y plantillas (lista, renombrar y eliminar; se editan con el mismo editor de cotización).

## 7. Arquitectura técnica

### 7.1 Aplicación
- **Next.js 16** (App Router, TypeScript strict) con React 19, Tailwind v4, shadcn/ui y Zod. Las lecturas se hacen en Server Components; las mutaciones en Server Actions que llaman a **funciones RPC de Postgres**. Así cada operación que toca varias tablas es una sola transacción: guardar una cotización con sus ítems, duplicar, aprobar, cargar un documento con sus vínculos o aplicar una OP. supabase-js no maneja transacciones.
- **Supabase con `@supabase/ssr`.** `proxy.ts` refresca la sesión y redirige a `/login`. En el servidor siempre se valida con `auth.getClaims()`, nunca con `getSession()`. Se usan las API keys nuevas (`sb_publishable_…` y `sb_secret_…`, esta última solo en el servidor) y JWT signing keys asimétricas.
- **Tipos** generados con `supabase gen types`. Las migraciones van en `supabase/migrations` y el desarrollo es local con Supabase CLI y Docker.
- **Fechas y montos:** las fechas se guardan como `date` (sin hora) y "hoy" se calcula en `America/Argentina/Buenos_Aires`. Se formatean sin pasar por `Date`. `TZ` se fija en Railway. Los montos usan `numeric` y se formatean con `Intl.NumberFormat('es-AR')`: `39.000.000,00` en el formato mensual y `$ 1.950.000.-` en el de jornada.

### 7.2 Autenticación y autorización
- Registro público **apagado** (`enable_signup = false` en `config.toml` y en Cloud). El primer admin se crea con un script de seed.
- Un trigger sobre `auth.users` crea `profiles` con `activo = false`.
- `private.es_usuario_activo()` es `SECURITY DEFINER`, `STABLE`, con `search_path = ''` y vive en un schema no expuesto.
- Política en cada tabla y en `storage.objects` (bucket `documentos`): `TO authenticated USING ((select private.es_usuario_activo()))`. El `(select …)` hace que Postgres la evalúe una vez por consulta y no una vez por fila.
- Solo un admin puede cambiar `rol` o `activo` en `profiles`. El rol `operador` (por ejemplo, solo subir remitos) queda listo en el modelo pero sin restricciones en el MVP.

### 7.3 Base de datos
- GRANTs explícitos a `authenticated` en cada migración y ninguno a `anon`. La primera migración hace `ALTER DEFAULT PRIVILEGES … REVOKE`, para que local se comporte igual que prod.
- Un test falla si alguna tabla de `public` no tiene RLS.
- Triggers para las invariantes del §5, y `unaccent` + `pg_trgm` para la búsqueda.

### 7.4 Archivos (Supabase Storage)
- Bucket privado `documentos` con `file_size_limit` de 10 MB y `allowed_mime_types` limitado a PDF, JPEG y PNG.
- **Subida directa del navegador a Storage:** la Server Action valida y devuelve una `createSignedUploadUrl`, el cliente sube con `uploadToSignedUrl` y otra action confirma, leyendo el tamaño desde Storage. No se usan Server Actions para pasar archivos (límite de 1 MB) y se evita el buffer del proxy.
- Las fotos se comprimen en el navegador (lado mayor ~2000 px, JPEG 0,8). El input usa un `accept` explícito para que iOS entregue JPEG; hay que probarlo en un iPhone real.
- **Paths solo en ASCII** (Storage rechaza tildes, ñ y °). El nombre original se guarda en la tabla:
  - `documentos/{documento_id}/{uuid}.{ext}`
  - `cotizaciones/{id}/enviada-{n}.pdf`, `cotizaciones/{id}/aprobada.pdf`
  - `importadas/{id}/{uuid}.pdf`
- **Descarga** con una signed URL de 60 s. El nombre de descarga se agrega a mano porque la opción `download` codifica dos veces los nombres no ASCII.

### 7.5 PDF
- `@react-pdf/renderer` en el route handler `GET /cotizaciones/[id]/pdf`, con dos layouts (mensual y jornada) que replican los ejemplos.
- **Fuentes TTF en el repo:** Carlito (compatible con Calibri) y Arimo, en regular, bold e italic. Cubren tildes, ñ, °, guion largo y viñeta. El guionado queda desactivado.
- Logo y pie con `fixed`, la firma no se parte entre páginas y los títulos de bloque no quedan huérfanos.
- **Cotizaciones aprobadas o enviadas:** se sirve el snapshot. Borradores: se renderiza en el momento.
- La descarga se nombra `COTIZACION N° 112711 VERTICE.pdf`.
- `outputFileTracingIncludes` incluye las fuentes y el logo en el build standalone.

## 8. Deploy y operación

- **Supabase Free (prod):** 500 MB de base, 1 GB de Storage, **se pausa tras 7 días sin actividad** y **no tiene backups**. Hay que comprimir las fotos y estar atentos a la pausa: si se pausa, se reactiva desde el panel.
- **Backup semanal propio:** un servicio cron en Railway corre `pg_dump` y copia el bucket a un almacenamiento externo (un bucket de Railway). La restauración se documenta y se prueba una vez.
- **Railway:** Dockerfile multi-stage con `output: 'standalone'`. Las `NEXT_PUBLIC_*` entran como `ARG` en el build y se configuran `HOSTNAME=0.0.0.0`, `TZ=America/Argentina/Buenos_Aires` y un healthcheck en `/api/health`. Al principio se usa el subdominio de Railway; el dominio propio queda para después.
- **Email:** no hace falta SMTP en el MVP. Con un solo usuario creado por script, el reseteo de contraseña se hace desde el panel. El SMTP propio (Resend) entra cuando haya invitaciones.

## 9. Testing

- **Vitest (unidad):** formato de montos (los dos layouts), fecha en letras (incluido el caso de las 22:00 en hora argentina), validación de CUIT, parser del texto con formato mínimo, resolución de variables, estados derivados (vencida, saldo de factura, indicadores) y parseo de precios pegados.
- **Integración contra Supabase local:**
  - RLS: anon denegado, usuario inactivo denegado, usuario activo permitido, y ninguna tabla sin RLS.
  - Triggers: una aprobada no se modifica y los documentos solo van a presupuestos aprobados del mismo cliente.
  - Numeración: la secuencia avanza y la carga de cotizaciones existentes la corre cuando corresponde.
  - Saldos de OP.
- **PDF:** se renderizan los dos layouts con los datos de los ejemplos reales y se verifica el texto extraído.
- **E2E con Playwright:** login → crear cliente → cotización mensual → PDF → marcar enviada → aprobar → subir OC, remito, factura (cubriendo el remito) y OP (cancelando la factura) → saldo 0. Otro E2E para cargar una cotización existente.

## 10. Pendientes del usuario (no bloquean el arranque)

1. Logo en alta resolución (vector o PNG de 1000 px o más). Mientras tanto se extrae del PDF.
2. Teléfono del membrete: los PDFs muestran 0299-4441169 y 0299-6019931. Se usa el más reciente y queda configurable.
3. Último número real emitido, para fijar la secuencia el día del lanzamiento.
4. Lista actual de clientes (Excel o CSV) para el script de importación.
5. Cotizaciones previas a cargar.
6. Validar los textos de las plantillas (se toman de los dos PDFs).
