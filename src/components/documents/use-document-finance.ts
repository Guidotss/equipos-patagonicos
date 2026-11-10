'use client'

import { useState } from 'react'
import type { DocumentFinance, InvoiceAllocation, PaymentAllocation, PaymentInstrument } from '@/lib/finance/contracts'
import type { DocumentFormProps } from './document-form.types'
import { financeInput } from './document-finance-model'
import { parseDecimalCents, sumCents } from '@/lib/finance/amounts'

const EMPTY_FINANCE: DocumentFinance = { invoiceAllocations: [], paymentInstruments: [], paymentAllocations: [] }

export function useDocumentFinance({ document, initialContext }: DocumentFormProps) {
  const [snapshot, setSnapshot] = useState<DocumentFinance>(() =>
    document ? initialContext?.financeByDocument[document.id] ?? EMPTY_FINANCE : EMPTY_FINANCE,
  )
  const [version, setVersion] = useState(document?.financial_version)
  const [persistedInstruments] = useState(() => new Set(snapshot.paymentInstruments.map((item) => item.id)))
  const [persistedAllocations] = useState(() => snapshot.paymentAllocations)
  const [historicalTotal] = useState(() => sumCents(snapshot.invoiceAllocations.map((row) => parseDecimalCents(row.historicalSettledAmount) ?? BigInt(0))))
  const [reason, setReason] = useState('')
  const [condition, setCondition] = useState(document?.payment_condition ?? '')
  const [dirty, setDirty] = useState(false)

  function update(next: DocumentFinance) {
    setDirty(true)
    setSnapshot(next)
  }
  function updateInvoices(invoiceAllocations: InvoiceAllocation[]) { update({ ...snapshot, invoiceAllocations }) }
  function updateInstruments(paymentInstruments: PaymentInstrument[]) { update({ ...snapshot, paymentInstruments }) }
  function updateAllocations(paymentAllocations: PaymentAllocation[]) { update({ ...snapshot, paymentAllocations }) }
  function removeInstrument(id: string) {
    update({ ...snapshot, paymentInstruments: snapshot.paymentInstruments.filter((item) => item.id !== id),
      paymentAllocations: snapshot.paymentAllocations.filter((item) => item.instrumentId !== id) })
  }
  function reset() {
    setSnapshot(EMPTY_FINANCE)
    setVersion(undefined)
    setReason('')
    setCondition('')
    setDirty(false)
  }
  function synchronize(finance: DocumentFinance, financialVersion: number) {
    setSnapshot(finance)
    setVersion(financialVersion)
    setReason('')
    setDirty(false)
  }
  return {
    snapshot, version, reason, condition, dirty, historicalTotal, persistedInstruments, persistedAllocations, updateInvoices, updateInstruments, updateAllocations, removeInstrument,
    setReason: (value: string) => { setDirty(true); setReason(value) },
    setCondition: (value: string) => { setDirty(true); setCondition(value) },
    reset, synchronize,
    input: (type: string, total: string) => financeInput(type, snapshot, version, reason, total),
  }
}

export type DocumentFinanceState = ReturnType<typeof useDocumentFinance>
