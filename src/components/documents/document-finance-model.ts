import type { DocumentFinance, FinanceInput, InvoiceAllocation } from '@/lib/finance/contracts'
import { centsToDecimal, parseAmountCents, sumCents } from '@/lib/finance/amounts'

const ZERO = BigInt(0)

/** Conserva el texto inválido para que la validación indique la fila correspondiente. */
export function decimalInput(value: string): string {
  const cents = parseAmountCents(value)
  return cents === null ? value : centsToDecimal(cents)
}

export function invoiceDistribution(
  rows: InvoiceAllocation[],
  totalInput: string,
): { rows: InvoiceAllocation[]; remainder: bigint | null } {
  const total = parseAmountCents(totalInput)
  const amounts = rows.map((row) => parseAmountCents(row.amount))
  if (total === null || amounts.some((amount) => amount === null)) return { rows, remainder: null }
  const remainder = total - sumCents(amounts as bigint[])
  const result = rows.map((row) => ({
    ...row,
    amount: decimalInput(row.amount),
    historicalSettledAmount: decimalInput(row.historicalSettledAmount),
  }))
  if (remainder > ZERO) {
    result.push({
      budgetId: null, equipmentId: null, equipmentStatus: 'unknown',
      amount: centsToDecimal(remainder),
      historicalSettledAmount: '0',
    })
  }
  return { rows: result, remainder }
}

export function financeInput(
  type: string, snapshot: DocumentFinance, version: number | undefined, reason: string, total: string,
): FinanceInput | undefined {
  const common = { ...(version === undefined ? {} : { expectedVersion: version }), correctionReason: reason }
  if (type === 'factura') return { ...common, invoiceAllocations: invoiceDistribution(snapshot.invoiceAllocations, total).rows }
  if (type !== 'orden_pago') return undefined
  return {
    ...common,
    paymentInstruments: snapshot.paymentInstruments.map((row) => ({ ...row, amount: decimalInput(row.amount) })),
    paymentAllocations: snapshot.paymentAllocations.map((row) => ({ ...row, amount: decimalInput(row.amount) })),
  }
}
