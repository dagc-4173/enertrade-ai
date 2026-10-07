import { jsPDF } from 'jspdf'
import type { PaymentAttempt } from '../services/simulatedPaymentService'

/** Generates a receipt from the immutable server snapshot, preserving decimal strings. */
export function createSimulatedReceiptPdf(attempt: PaymentAttempt): jsPDF {
  if (attempt.status !== 'APPROVED' || !attempt.receiptReference || !attempt.resolvedAt) {
    throw new Error('Solo los pagos simulados aprobados tienen comprobante.')
  }
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  pdf.setProperties({ title: 'Comprobante de pago simulado', author: 'EnerTrade AI' })
  let y = 24
  function text(value: string, size = 11, bold = false) {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal')
    pdf.setFontSize(size)
    const lines: string[] = pdf.splitTextToSize(value, 170)
    for (const line of lines) {
      if (y > 270) { pdf.addPage(); y = 24 }
      pdf.text(line, 20, y)
      y += size * 0.45 + 2
    }
    y += 3
  }
  text('EnerTrade AI', 20, true)
  text('COMPROBANTE DE PAGO SIMULADO', 14, true)
  text('No acredita un pago real ni una entrega de energía.', 11, true)
  pdf.setDrawColor(150, 180, 140)
  pdf.line(20, y, 190, y)
  y += 12
  text(`Referencia: ${attempt.receiptReference}`)
  text('Estado: Aprobado en simulación')
  text(`Fecha de aprobación: ${new Date(attempt.resolvedAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' })} (America/Bogota)`)
  text(`Importe exacto (COP): ${attempt.amountCop}`, 14, true)
  text('El importe conserva todos los decimales del acuerdo; el punto indica decimales.', 9)
  text(`Transacción: ${attempt.transactionId}`)
  const snapshot = attempt.contractSnapshot
  const fields: [string, string][] = [
    ['quantityKwh', 'Energía acordada (kWh)'],
    ['pricePerKwh', 'Precio por kWh (COP)'],
    ['deliveryDate', 'Fecha de entrega'],
    ['offerId', 'Oferta'], ['demandId', 'Demanda'],
  ]
  text('Datos del acuerdo', 12, true)
  for (const [key, label] of fields) {
    const value = snapshot[key]
    if (typeof value === 'string' || typeof value === 'number') text(`${label}: ${value}`)
  }
  const hour = snapshot.hour
  if (typeof hour === 'number' && Number.isInteger(hour) && hour >= 0 && hour <= 23) {
    text(`Hora de entrega: ${String(hour).padStart(2, '0')}:00 - ${String((hour + 1) % 24).padStart(2, '0')}:00${hour === 23 ? ' (+1 día)' : ''}`)
  } else text('Hora de entrega: no registrada (acuerdo histórico)')
  text(`Simulador: ${attempt.providerId}@${attempt.providerVersion}`, 9)
  text('Documento generado a partir del registro del pago simulado. No es una factura ni un comprobante bancario.', 9)
  return pdf
}

export function downloadSimulatedReceiptPdf(attempt: PaymentAttempt) {
  createSimulatedReceiptPdf(attempt).save(`comprobante-${attempt.receiptReference}.pdf`)
}
