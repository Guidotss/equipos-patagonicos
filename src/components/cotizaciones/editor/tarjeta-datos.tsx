'use client'
// src/components/cotizaciones/editor/tarjeta-datos.tsx

import Link from 'next/link'
import { useRef, useState } from 'react'
import { Campo } from '@/components/formulario/campo'
import { ConfirmacionEnLugar } from '@/components/formulario/confirmacion-en-lugar'
import { Tarjeta } from '@/components/formulario/tarjeta'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { CampoDatos } from '@/lib/cotizaciones/datos'
import type { CatalogosEditor, EstadoEditor, Pendientes, PlantillaEditor } from '@/lib/cotizaciones/editor'
import {
  ID_CAMPO,
  cambiosDeContenido,
  camposDatosVisibles,
  esFechaIso,
  idCampoDato,
  plantillasDeFormato,
  textoProximaActualizacion,
  type Despachar,
} from '@/lib/cotizaciones/editor-pantalla'
import { FORMATOS, type Formato } from '@/lib/plantillas/contenido'
import { VARIABLES } from '@/lib/plantillas/variables'
import { cn } from '@/lib/utils'

/** Las mismas clases que la etiqueta de Campo, para los campos que no pueden usarlo (marca superpuesta, selects). */
const ETIQUETA = 'text-[13px]/none font-normal text-muted-foreground'
const FALTA = '[&_select]:border-brand-yellow [&_select]:bg-brand-yellow/10'

function SelectorPlantilla({
  estado,
  plantillas,
  error,
  despachar,
}: {
  estado: EstadoEditor
  plantillas: PlantillaEditor[]
  error?: string
  despachar: Despachar
}) {
  const [pendiente, setPendiente] = useState<PlantillaEditor | null>(null)
  const grupo = useRef<HTMLDivElement>(null)
  const actual = plantillas.find((plantilla) => plantilla.id === estado.plantillaId) ?? null
  const delFormato = plantillasDeFormato(plantillas, estado.formato)

  function elegir(plantilla: PlantillaEditor | undefined) {
    if (!plantilla || plantilla.id === estado.plantillaId) return
    if (cambiosDeContenido(estado, actual)) setPendiente(plantilla)
    else despachar({ tipo: 'plantilla', plantilla })
  }

  // Al cerrar la confirmación el foco vuelve a la opción elegida (después del render).
  function cerrar() {
    setPendiente(null)
    requestAnimationFrame(() => grupo.current?.querySelector<HTMLElement>('[data-state="on"]')?.focus())
  }

  if (plantillas.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay plantillas activas.{' '}
        <Link href="/configuracion/plantillas" className="text-primary underline-offset-4 hover:underline">
          Revisalas en Configuración
        </Link>
        .
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Un valor vacío es "deseleccionar" (Radix): el formato siempre queda elegido. */}
        <ToggleGroup
          ref={grupo}
          type="single"
          aria-label="Formato"
          value={estado.formato}
          onValueChange={(valor) => {
            if (valor) elegir(plantillasDeFormato(plantillas, valor as Formato)[0])
          }}
          className="h-8 gap-0 rounded-lg bg-muted p-0.5"
        >
          {(Object.keys(FORMATOS) as Formato[]).map((formato) => (
            <ToggleGroupItem
              key={formato}
              value={formato}
              disabled={plantillasDeFormato(plantillas, formato).length === 0}
              className="h-7 rounded-md px-3 text-sm text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
            >
              {FORMATOS[formato]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {delFormato.length > 1 ? (
          <NativeSelect
            id={ID_CAMPO.plantilla}
            aria-label="Plantilla"
            value={estado.plantillaId}
            onChange={(evento) => elegir(plantillas.find((plantilla) => plantilla.id === evento.target.value))}
            className="min-w-0 flex-1"
          >
            {delFormato.map((plantilla) => (
              <NativeSelectOption key={plantilla.id} value={plantilla.id}>
                {plantilla.nombre}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        ) : null}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {pendiente ? (
        <ConfirmacionEnLugar
          tono="aviso"
          pregunta={`¿Cambiar a la plantilla «${pendiente.nombre}»?`}
          detalle="Se reemplazan el asunto, la introducción, los textos y los ítems."
          textoConfirmar="Cambiar plantilla"
          alConfirmar={() => {
            despachar({ tipo: 'plantilla', plantilla: pendiente })
            cerrar()
          }}
          alCancelar={cerrar}
        />
      ) : null}
    </div>
  )
}

/** Un dato que alimenta una variable. Vacío y usado por el texto: la marca {{x}} encima (nunca como valor). */
function CampoDato({
  campo,
  valor,
  faltaCompletar,
  error,
  placeholder,
  ayuda,
  despachar,
}: {
  campo: CampoDatos
  valor: string
  faltaCompletar: boolean
  error?: string
  placeholder?: string
  ayuda?: string
  despachar: Despachar
}) {
  const id = idCampoDato(campo)
  const marcar = faltaCompletar && valor === ''
  const descripciones =
    [error ? `${id}-error` : null, !error && ayuda ? `${id}-ayuda` : null, marcar ? `${id}-falta` : null]
      .filter(Boolean)
      .join(' ') || undefined

  return (
    <div className="space-y-1">
      <Label htmlFor={id} className={ETIQUETA}>
        {VARIABLES[campo]}
      </Label>
      <div className="relative">
        <Input
          id={id}
          value={valor}
          maxLength={500}
          placeholder={marcar ? undefined : placeholder}
          onChange={(evento) => despachar({ tipo: 'dato', campo, valor: evento.target.value })}
          aria-invalid={Boolean(error)}
          aria-describedby={descripciones}
        />
        {marcar ? (
          <>
            <span
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 rounded-sm bg-brand-yellow/40 px-0.5 text-sm"
            >
              {`{{${campo}}}`}
            </span>
            <span id={`${id}-falta`} className="sr-only">
              Falta completar: lo usa el texto de la cotización.
            </span>
          </>
        ) : null}
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : ayuda ? (
        <p id={`${id}-ayuda`} className="text-xs text-muted-foreground">
          {ayuda}
        </p>
      ) : null}
    </div>
  )
}

function AyudaEquipo({ catalogos, estado, faltan }: { catalogos: CatalogosEditor; estado: EstadoEditor; faltan: Set<string> }) {
  if (catalogos.equipos.length === 0) {
    return (
      <p id={`${ID_CAMPO.equipo}-ayuda`} className="text-xs text-muted-foreground">
        No hay equipos activos.{' '}
        <Link href="/configuracion/equipos/nuevo" className="text-primary underline-offset-4 hover:underline">
          Cargar equipos en Configuración
        </Link>
      </p>
    )
  }
  if (!faltan.has('capacidad') && !faltan.has('equipo_descripcion')) return null
  if (estado.equipoId === '') {
    return <p id={`${ID_CAMPO.equipo}-ayuda`} className="text-xs text-muted-foreground">El texto usa la capacidad y la descripción del equipo.</p>
  }
  const datos = faltan.has('capacidad') && faltan.has('equipo_descripcion')
    ? 'la capacidad y la descripción'
    : faltan.has('capacidad') ? 'la capacidad' : 'la descripción'
  return (
    <p id={`${ID_CAMPO.equipo}-ayuda`} className="text-xs text-muted-foreground">
      Completá {datos} del equipo en Configuración › Equipos.
    </p>
  )
}

/** Una fecha que se puede despachar: existe y su año tiene cuatro cifras (0202 es "2027" a medio escribir). */
function fechaCompleta(valor: string): boolean {
  return esFechaIso(valor) && !valor.startsWith('0')
}

type PropsInputFecha = Omit<React.ComponentProps<'input'>, 'type' | 'value' | 'onChange' | 'onBlur'> & {
  valor: string
  despachar: Despachar
}

/**
 * La fecha, con un borrador propio. Al tipear el año, Chrome pasa por 0002, 0020 y 0202: como esas fechas a medio
 * escribir no se despachan (el documento no se puede armar sin fecha), un input atado al estado volvería a la fecha
 * anterior en cada tecla y el año no se podría tipear. El input muestra el borrador; se despacha solo una fecha
 * completa y, al salir del campo, lo que no llegó a serlo vuelve a la fecha del estado.
 */
function InputFecha({ valor, despachar, ...props }: PropsInputFecha) {
  const [borrador, setBorrador] = useState({ de: valor, texto: valor })
  // Si la fecha cambia desde afuera (recargar, la fecha recién despachada), el borrador la sigue.
  if (borrador.de !== valor) setBorrador({ de: valor, texto: valor })

  return (
    <Input
      {...props}
      type="date"
      value={borrador.texto}
      onChange={(evento) => {
        const texto = evento.target.value
        setBorrador({ de: valor, texto })
        if (fechaCompleta(texto) && texto !== valor) despachar({ tipo: 'campo', campo: 'fecha', valor: texto })
      }}
      onBlur={() => {
        if (borrador.texto !== valor) setBorrador({ de: valor, texto: valor })
      }}
    />
  )
}

export function TarjetaDatos({
  estado,
  catalogos,
  pendientes,
  errores,
  despachar,
}: {
  estado: EstadoEditor
  catalogos: CatalogosEditor
  pendientes: Pendientes
  errores: Record<string, string>
  despachar: Despachar
}) {
  const faltan = new Set<string>(pendientes.variables)
  const faltaEquipo = estado.equipoId === '' && (faltan.has('capacidad') || faltan.has('equipo_descripcion'))
  const textoProxima = textoProximaActualizacion(
    estado.proximaActualizacion,
    estado.datos.proxima_actualizacion,
    catalogos.empresa.proxima_actualizacion,
  )
  const faltaProxima = faltan.has('proxima_actualizacion') && estado.proximaActualizacion === ''
  const errorProxima = errores.proximaActualizacion ?? errores['datos.proxima_actualizacion']

  return (
    <Tarjeta compacta titulo="Datos de esta cotización">
      {estado.id === null ? (
        <SelectorPlantilla
          estado={estado}
          plantillas={catalogos.plantillas}
          error={errores.plantillaId ?? errores.formato}
          despachar={despachar}
        />
      ) : null}
      <div className="grid gap-x-4 gap-y-3 @md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={ID_CAMPO.equipo} className={ETIQUETA}>
            Equipo
          </Label>
          <NativeSelect
            id={ID_CAMPO.equipo}
            value={estado.equipoId}
            onChange={(evento) => despachar({ tipo: 'campo', campo: 'equipoId', valor: evento.target.value })}
            aria-invalid={Boolean(errores.equipoId)}
            aria-describedby={errores.equipoId
              ? `${ID_CAMPO.equipo}-error`
              : catalogos.equipos.length === 0 || faltan.has('capacidad') || faltan.has('equipo_descripcion')
                ? `${ID_CAMPO.equipo}-ayuda`
                : undefined}
            // Menos lugar para la flecha: "Grúa telescópica XCMG 70 TN" no se corta contra ella a 1200 px.
            className={cn(
              'w-full [&_[data-slot=native-select-icon]]:right-2 [&_select]:pr-7',
              faltaEquipo && FALTA,
            )}
          >
            <NativeSelectOption value="">Elegí un equipo</NativeSelectOption>
            {catalogos.equipos.map((equipo) => (
              <NativeSelectOption key={equipo.id} value={equipo.id}>
                {equipo.activo ? equipo.nombre : `${equipo.nombre} (inactivo)`}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {errores.equipoId ? (
            <p id={`${ID_CAMPO.equipo}-error`} className="text-sm text-destructive">
              {errores.equipoId}
            </p>
          ) : (
            <AyudaEquipo catalogos={catalogos} estado={estado} faltan={faltan} />
          )}
        </div>

        {camposDatosVisibles(estado).map((campo) => (
          <CampoDato
            key={campo}
            campo={campo}
            valor={estado.datos[campo]}
            faltaCompletar={faltan.has(campo)}
            error={errores[`datos.${campo}`]}
            placeholder={campo === 'indice_base' ? catalogos.empresa.indice_base || undefined : undefined}
            ayuda={
              campo === 'indice_base' && catalogos.empresa.indice_base
                ? 'Vacío: se usa el de la empresa.'
                : undefined
            }
            despachar={despachar}
          />
        ))}

        <Campo
          id={ID_CAMPO.proximaActualizacion}
          etiqueta="Próxima actualización"
          error={errorProxima}
          ayuda={textoProxima ? `En el PDF: «${textoProxima}»` : undefined}
        >
          <Input
            id={ID_CAMPO.proximaActualizacion}
            type="month"
            value={estado.proximaActualizacion}
            onChange={(evento) =>
              despachar({ tipo: 'campo', campo: 'proximaActualizacion', valor: evento.target.value })
            }
            aria-invalid={Boolean(errorProxima)}
            className={cn(faltaProxima && 'border-brand-yellow bg-brand-yellow/10')}
          />
        </Campo>

        {/* Fecha, validez y firma en una fila de tres (entran a 548 px y ahorran alto). */}
        <div className="grid gap-x-4 gap-y-3 @md:col-span-2 @md:grid-cols-3">
          <Campo id={ID_CAMPO.fecha} etiqueta="Fecha" error={errores.fecha}>
            <InputFecha
              id={ID_CAMPO.fecha}
              required
              valor={estado.fecha}
              despachar={despachar}
              aria-invalid={Boolean(errores.fecha)}
            />
          </Campo>
          <Campo id={ID_CAMPO.validez} etiqueta="Validez (días)" error={errores.validezDias}>
            <Input
              id={ID_CAMPO.validez}
              inputMode="numeric"
              value={estado.validezDias}
              onChange={(evento) => despachar({ tipo: 'campo', campo: 'validezDias', valor: evento.target.value })}
              aria-invalid={Boolean(errores.validezDias)}
              className="tabular-nums"
            />
          </Campo>
          <div className="space-y-1">
            <Label htmlFor={ID_CAMPO.firmante} className={ETIQUETA}>
              Firma
            </Label>
            <NativeSelect
              id={ID_CAMPO.firmante}
              value={estado.firmanteId}
              onChange={(evento) => despachar({ tipo: 'campo', campo: 'firmanteId', valor: evento.target.value })}
              aria-invalid={Boolean(errores.firmanteId)}
              aria-describedby={errores.firmanteId ? `${ID_CAMPO.firmante}-error` : undefined}
              className="w-full"
            >
              <NativeSelectOption value="">Sin firma</NativeSelectOption>
              {catalogos.firmantes.map((firmante) => (
                <NativeSelectOption key={firmante.id} value={firmante.id}>
                  {firmante.activo ? firmante.nombre : `${firmante.nombre} (inactivo)`}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {errores.firmanteId ? (
              <p id={`${ID_CAMPO.firmante}-error`} className="text-sm text-destructive">
                {errores.firmanteId}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </Tarjeta>
  )
}
