import { useLayoutEffect, useRef, useState } from 'react'
import { Card } from '@/components/form/card'
import { Field } from '@/components/form/field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import type { PaymentInstrument } from '@/lib/finance/contracts'
import type { DocumentFinanceState } from './use-document-finance'
import type { InstrumentStatusError } from './use-document-form'

const KINDS = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  check: 'Cheque',
  withholding: 'Retención',
  legacy_unidentified: 'Medio anterior sin identificar',
} as const
const STATUSES = {
  confirmed: 'Confirmado',
  pending: 'Pendiente',
  cleared: 'Acreditado',
  rejected: 'Rechazado',
  voided: 'Anulado',
  legacy_recognized: 'Cancelación anterior reconocida',
  legacy_unclassified: 'Importe anterior sin clasificar',
} as const

type StatusHandler = (
  instrument: PaymentInstrument,
  status: PaymentInstrument['status'],
  date: string | null,
  reason: string,
) => Promise<void>
type Props = {
  finance: DocumentFinanceState
  persistedIds: Set<string>
  onStatus: StatusHandler
  errors: Record<string, InstrumentStatusError>
  fieldErrors: Record<string, string>
}

function CheckReplacement({
  instrument,
  finance,
}: {
  instrument: PaymentInstrument
  finance: DocumentFinanceState
}) {
  const [kind, setKind] = useState('')
  const id = `replacement-${instrument.id}`
  if (finance.replacedInstruments.has(instrument.id))
    return (
      <p className="text-sm text-muted-foreground sm:col-span-2 lg:col-span-4">
        Cheque conservado como anulado. Completá el nuevo medio y el motivo del
        reemplazo.
      </p>
    )
  return (
    <div className="flex flex-col gap-3 sm:col-span-2 lg:col-span-4">
      <p className="text-sm text-muted-foreground">
        El cheque conserva su evidencia. Reemplazarlo lo anula y traslada sus
        destinos a un medio nuevo; requiere motivo al guardar.
      </p>
      <Field id={id} label="Medio de reemplazo">
        <NativeSelect
          id={id}
          value={kind}
          onChange={(event) => setKind(event.target.value)}
        >
          <NativeSelectOption value="">Elegí un medio</NativeSelectOption>
          {Object.entries(KINDS)
            .filter(([value]) => value !== 'legacy_unidentified')
            .map(([value, label]) => (
              <NativeSelectOption key={value} value={value}>
                {label}
              </NativeSelectOption>
            ))}
        </NativeSelect>
      </Field>
      <Button
        type="button"
        variant="outline"
        disabled={!kind}
        onClick={() =>
          finance.replaceInstrument(
            instrument.id,
            kind as Exclude<PaymentInstrument['kind'], 'legacy_unidentified'>,
          )
        }
      >
        Reemplazar cheque
      </Button>
    </div>
  )
}

function CheckActions({
  instrument,
  onStatus,
  error,
}: {
  instrument: PaymentInstrument
  onStatus: StatusHandler
  error?: InstrumentStatusError
}) {
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')
  const previousStatus = useRef(instrument.status)
  const container = useRef<HTMLDivElement>(null)
  const dateInput = useRef<HTMLInputElement>(null)
  const dateError = error && 'settledOn' in error ? error.settledOn : undefined
  useLayoutEffect(() => {
    if (previousStatus.current !== instrument.status) container.current?.focus()
    previousStatus.current = instrument.status
  }, [instrument.status])
  useLayoutEffect(() => {
    if (error && 'settledOn' in error) dateInput.current?.focus()
  }, [error])
  if (instrument.status === 'voided') return null
  const id = `check-action-${instrument.id}`
  return (
    <div
      ref={container}
      tabIndex={-1}
      className="flex flex-col gap-3 sm:col-span-2 lg:col-span-4"
    >
      {instrument.status === 'pending' ? (
        <Field
          id={`${id}-date`}
          label="Fecha de acreditación"
          error={dateError}
        >
          <Input
            ref={dateInput}
            id={`${id}-date`}
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </Field>
      ) : null}
      <Field id={`${id}-reason`} label="Motivo de la acción">
        <Input
          id={`${id}-reason`}
          maxLength={2000}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>
      {error && 'message' in error ? (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {instrument.status === 'pending' ? (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={!date}
              onClick={() => onStatus(instrument, 'cleared', date, reason)}
            >
              Acreditar cheque
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onStatus(instrument, 'rejected', null, reason)}
            >
              Rechazar cheque
            </Button>
          </>
        ) : null}
        {instrument.status === 'cleared' || instrument.status === 'rejected' ? (
          <Button
            type="button"
            variant="outline"
            disabled={!reason.trim()}
            onClick={() => onStatus(instrument, 'pending', null, reason)}
          >
            Revertir estado
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export function PaymentInstrumentsSection({
  finance,
  persistedIds,
  onStatus,
  errors,
  fieldErrors,
}: Props) {
  const [newKind, setNewKind] = useState('')
  const rows = finance.snapshot.paymentInstruments
  const isTerminalCheck = (row: PaymentInstrument) =>
    persistedIds.has(row.id) &&
    row.kind === 'check' &&
    ['rejected', 'voided'].includes(row.status)
  function change(index: number, patch: Partial<PaymentInstrument>) {
    if (isTerminalCheck(rows[index])) return
    finance.updateInstruments(
      rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    )
  }
  function add() {
    if (!(newKind in KINDS) || newKind === 'legacy_unidentified') return
    const kind = newKind as Exclude<
      PaymentInstrument['kind'],
      'legacy_unidentified'
    >
    finance.updateInstruments([
      ...rows,
      {
        id: crypto.randomUUID(),
        kind,
        status: kind === 'check' ? 'pending' : 'confirmed',
        amount: '',
        receivedOn: null,
        dueOn: null,
        settledOn: null,
        reference: '',
        bank: '',
      },
    ])
    setNewKind('')
  }
  return (
    <Card
      titulo="Medios de pago"
      descripcion="Ingresá cada medio y su fecha efectiva. Un cheque pendiente todavía no está acreditado."
    >
      <div className="flex flex-col gap-4">
        {rows.map((row, index) => {
          const prefix = `instrument-${row.id}`
          const terminal = isTerminalCheck(row)
          return (
            <div
              key={row.id}
              className="grid gap-3 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-4"
            >
              <Field id={`${prefix}-kind`} label="Medio">
                <NativeSelect
                  id={`${prefix}-kind`}
                  className="w-full"
                  disabled={terminal}
                  value={row.kind}
                  onChange={(event) => {
                    const kind = event.target.value as PaymentInstrument['kind']
                    change(index, {
                      kind,
                      status: kind === 'check' ? 'pending' : 'confirmed',
                      settledOn: null,
                    })
                  }}
                >
                  {Object.entries(KINDS)
                    .filter(
                      ([kind]) =>
                        kind !== 'legacy_unidentified' || row.kind === kind,
                    )
                    .map(([kind, label]) => (
                      <NativeSelectOption key={kind} value={kind}>
                        {label}
                      </NativeSelectOption>
                    ))}
                </NativeSelect>
              </Field>
              <Field
                id={`${prefix}-amount`}
                label="Importe"
                error={
                  fieldErrors[`finance.paymentInstruments.${index}.amount`]
                }
              >
                <Input
                  id={`${prefix}-amount`}
                  disabled={terminal}
                  inputMode="decimal"
                  value={row.amount}
                  onChange={(event) =>
                    change(index, { amount: event.target.value })
                  }
                />
              </Field>
              <Field id={`${prefix}-status`} label="Estado">
                <NativeSelect
                  id={`${prefix}-status`}
                  className="w-full"
                  value={row.status}
                  disabled={persistedIds.has(row.id) || row.kind !== 'check'}
                  onChange={(event) =>
                    change(index, {
                      status: event.target.value as PaymentInstrument['status'],
                      settledOn: null,
                    })
                  }
                >
                  {(row.kind === 'check' && !persistedIds.has(row.id)
                    ? ['pending', 'cleared']
                    : [row.status]
                  ).map((status) => (
                    <NativeSelectOption key={status} value={status}>
                      {STATUSES[status as keyof typeof STATUSES]}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              {['confirmed', 'cleared'].includes(row.status) ||
              (terminal && row.settledOn) ? (
                <Field
                  id={`${prefix}-settled`}
                  label="Fecha efectiva"
                  error={
                    fieldErrors[`finance.paymentInstruments.${index}.settledOn`]
                  }
                >
                  <Input
                    id={`${prefix}-settled`}
                    type="date"
                    disabled={terminal}
                    value={row.settledOn ?? ''}
                    onChange={(event) =>
                      change(index, { settledOn: event.target.value || null })
                    }
                  />
                </Field>
              ) : null}
              {row.kind === 'check' ? (
                <>
                  <Field id={`${prefix}-reference`} label="Referencia">
                    <Input
                      id={`${prefix}-reference`}
                      disabled={terminal}
                      value={row.reference}
                      onChange={(event) =>
                        change(index, { reference: event.target.value })
                      }
                    />
                  </Field>
                  <Field id={`${prefix}-bank`} label="Banco">
                    <Input
                      id={`${prefix}-bank`}
                      disabled={terminal}
                      value={row.bank}
                      onChange={(event) =>
                        change(index, { bank: event.target.value })
                      }
                    />
                  </Field>
                  <Field id={`${prefix}-received`} label="Fecha de recepción">
                    <Input
                      id={`${prefix}-received`}
                      disabled={terminal}
                      type="date"
                      value={row.receivedOn ?? ''}
                      onChange={(event) =>
                        change(index, {
                          receivedOn: event.target.value || null,
                        })
                      }
                    />
                  </Field>
                  <Field id={`${prefix}-due`} label="Vencimiento">
                    <Input
                      id={`${prefix}-due`}
                      disabled={terminal}
                      type="date"
                      value={row.dueOn ?? ''}
                      onChange={(event) =>
                        change(index, { dueOn: event.target.value || null })
                      }
                    />
                  </Field>
                </>
              ) : null}
              {row.kind === 'check' && persistedIds.has(row.id) ? (
                <CheckActions
                  instrument={row}
                  onStatus={onStatus}
                  error={errors[row.id]}
                />
              ) : null}
              {terminal ? (
                <CheckReplacement instrument={row} finance={finance} />
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => finance.removeInstrument(row.id)}
                >
                  Quitar medio {index + 1}
                </Button>
              )}
            </div>
          )
        })}
        <div className="flex flex-wrap items-end gap-3">
          <Field id="new-instrument-kind" label="Nuevo medio">
            <NativeSelect
              id="new-instrument-kind"
              value={newKind}
              onChange={(event) => setNewKind(event.target.value)}
            >
              <NativeSelectOption value="">Elegí un medio</NativeSelectOption>
              {Object.entries(KINDS)
                .filter(([kind]) => kind !== 'legacy_unidentified')
                .map(([kind, label]) => (
                  <NativeSelectOption key={kind} value={kind}>
                    {label}
                  </NativeSelectOption>
                ))}
            </NativeSelect>
          </Field>
          <Button
            type="button"
            variant="outline"
            disabled={!newKind}
            onClick={add}
          >
            Agregar medio
          </Button>
        </div>
      </div>
    </Card>
  )
}
