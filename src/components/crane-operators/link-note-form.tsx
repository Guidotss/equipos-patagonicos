'use client'

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from 'react'
import { useRouter } from 'next/navigation'
import {
  linkDeliveryNote,
  readLinkableBudgets,
} from '@/app/(app)/delivery-notes/actions'
import { Field } from '@/components/form/field'
import { SectionForm, SheetForm } from '@/components/form/structure-form'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import type { LinkableBudget, Page } from '@/lib/crane-operators/contracts'

export function LinkNoteForm({
  noteId,
  initial,
}: {
  noteId: string
  initial: Page<{ budgets: LinkableBudget[] }>
}) {
  const router = useRouter()
  const [options, setOptions] = useState(initial.budgets)
  const [page, setPage] = useState(initial.page)
  const [total, setTotal] = useState(initial.total)
  const [budgetId, setBudgetId] = useState('')
  const [message, setMessage] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [pending, startTransition] = useTransition()
  const [loading, startLoading] = useTransition()
  const errorRef = useRef<HTMLDivElement>(null)
  const selectRef = useRef<HTMLSelectElement>(null)
  const saving = useRef(false)

  useEffect(() => {
    if (message) (invalid ? selectRef.current : errorRef.current)?.focus()
  }, [message, invalid])

  function loadMore() {
    startLoading(async () => {
      try {
        const result = await readLinkableBudgets({
          page: page + 1,
          pageSize: initial.pageSize,
        })
        if (!result.ok) {
          setMessage(result.message)
          return
        }
        setOptions((previous) => [
          ...new Map(
            [...previous, ...result.datos.budgets].map((budget) => [
              budget.id,
              budget,
            ]),
          ).values(),
        ])
        setPage(result.datos.page)
        setTotal(result.datos.total)
      } catch {
        setMessage('No pudimos cargar más presupuestos. Reintentá.')
      }
    })
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving.current) return
    setInvalid(!budgetId)
    if (!budgetId) {
      setMessage('Elegí un presupuesto para vincular el remito.')
      return
    }
    saving.current = true
    setMessage('')
    startTransition(async () => {
      try {
        const result = await linkDeliveryNote({ noteId, budgetId })
        if (!result.ok) {
          setInvalid(Boolean(result.errors?.budgetId))
          setMessage(result.message)
          return
        }
        router.refresh()
      } catch {
        setMessage(
          'Se interrumpió la operación. Reintentá con el presupuesto seleccionado.',
        )
      } finally {
        saving.current = false
      }
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {message ? (
        <div
          ref={errorRef}
          tabIndex={-1}
          className="rounded-lg outline-ring focus-visible:outline-2"
        >
          <Alert variant="destructive">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        </div>
      ) : null}
      <SheetForm>
        <SectionForm
          titulo="Vincular a un presupuesto"
          descripcion="Se conservarán el gruista, la grúa, la fecha y los archivos originales."
          stacked
        >
          <Field
            id="link-budget"
            label="Presupuesto"
            error={invalid ? message : undefined}
            help="Presupuestos aprobados, incluidos los finalizados y los que no tienen grúa asignada."
          >
            <NativeSelect
              id="link-budget"
              className="w-full"
              ref={selectRef}
              value={budgetId}
              disabled={pending}
              onChange={(event) => {
                setBudgetId(event.target.value)
                setInvalid(false)
              }}
            >
              <NativeSelectOption value="">
                Seleccioná un presupuesto
              </NativeSelectOption>
              {options.map((budget) => (
                <NativeSelectOption key={budget.id} value={budget.id}>
                  {budget.number} · {budget.customerName} · {budget.subject}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {page * initial.pageSize < total ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={loading || pending}
                onClick={loadMore}
              >
                {loading ? 'Cargando…' : 'Cargar más presupuestos'}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                {total
                  ? `${options.length} presupuestos disponibles`
                  : 'No hay presupuestos disponibles para vincular.'}
              </p>
            )}
            <Button
              type="submit"
              className="min-h-11"
              disabled={pending || loading || !total}
            >
              {pending ? 'Vinculando…' : 'Vincular remito'}
            </Button>
          </div>
        </SectionForm>
      </SheetForm>
    </form>
  )
}
