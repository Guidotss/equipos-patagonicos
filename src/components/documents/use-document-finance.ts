'use client'

import { useState } from 'react'
import type { DocumentFinance, InvoiceAllocation, PaymentAllocation, PaymentInstrument } from '@/lib/finance/contracts'
import type { DocumentFormProps } from './document-form.types'
import { financeInput, replaceTerminalCheck } from './document-finance-model'
import { parseDecimalCents, sumCents } from '@/lib/finance/amounts'

const EMPTY_FINANCE: DocumentFinance = { invoiceAllocations: [], paymentInstruments: [], paymentAllocations: [] }

export function useDocumentFinance({ document, initialContext }: DocumentFormProps) {
  const [baseline, setBaseline] = useState(() => ({
    snapshot: document ? initialContext?.financeByDocument[document.id] ?? EMPTY_FINANCE : EMPTY_FINANCE,
    condition: document?.payment_condition ?? '',
  }))
  const [snapshot, setSnapshot] = useState(baseline.snapshot)
  const [version, setVersion] = useState(document?.financial_version)
  const [persistedInstruments] = useState(() => new Set(snapshot.paymentInstruments.map((item) => item.id)))
  const [persistedAllocations] = useState(() => snapshot.paymentAllocations)
  const [historicalTotal] = useState(() => sumCents(snapshot.invoiceAllocations.map((row) => parseDecimalCents(row.historicalSettledAmount) ?? BigInt(0))))
  const [reason, setReason] = useState('')
  const [condition, setCondition] = useState(baseline.condition)
  const [replacedInstruments, setReplacedInstruments] = useState<Set<string>>(() => new Set())
  const dirty = replacedInstruments.size > 0 || reason !== '' || condition !== baseline.condition ||
    (snapshot !== baseline.snapshot && JSON.stringify(snapshot) !== JSON.stringify(baseline.snapshot))

  function updateInvoices(invoiceAllocations: InvoiceAllocation[]) { setSnapshot({ ...snapshot, invoiceAllocations }) }
  function updateInstruments(paymentInstruments: PaymentInstrument[]) { setSnapshot({ ...snapshot, paymentInstruments }) }
  function updateAllocations(paymentAllocations: PaymentAllocation[]) { setSnapshot({ ...snapshot, paymentAllocations }) }
  function removeInstrument(id: string) {
    setSnapshot({ ...snapshot, paymentInstruments: snapshot.paymentInstruments.filter((item) => item.id !== id),
      paymentAllocations: snapshot.paymentAllocations.filter((item) => item.instrumentId !== id) })
  }
  function replaceInstrument(id: string, kind: Exclude<PaymentInstrument['kind'], 'legacy_unidentified'>) {
    if (!persistedInstruments.has(id) || replacedInstruments.has(id)) return
    const next = replaceTerminalCheck(snapshot, id, kind, crypto.randomUUID())
    if (next === snapshot) return
    setReplacedInstruments((previous) => new Set([...previous, id]))
    setSnapshot(next)
  }
  function reset() {
    synchronize(EMPTY_FINANCE, undefined, '')
  }
  function synchronize(finance: DocumentFinance, financialVersion: number | undefined, paymentCondition: string) {
    setBaseline({ snapshot: finance, condition: paymentCondition })
    setSnapshot(finance)
    setVersion(financialVersion)
    setReason('')
    setCondition(paymentCondition)
    setReplacedInstruments(new Set())
  }
  return {
    snapshot, version, reason, condition, dirty, historicalTotal, persistedInstruments, persistedAllocations, updateInvoices, updateInstruments, updateAllocations, removeInstrument, replaceInstrument, replacedInstruments,
    setReason, setCondition,
    reset, synchronize,
    input: (type: string, total: string) => financeInput(type, snapshot, version, reason, total),
  }
}

export type DocumentFinanceState = ReturnType<typeof useDocumentFinance>
