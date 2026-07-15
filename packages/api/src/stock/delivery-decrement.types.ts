import { ObjectId } from 'mongodb'

export type DeliveryLineRequirement = {
  vaccineId: string
  vaccineObjectId: ObjectId
  vaccineName: string
  quantity: number
}

export type AppliedDeliveryDecrement = {
  vaccineId: string
  vaccineObjectId: ObjectId
  vaccineName: string
  quantity: number
  quantityBefore: number
  quantityAfter: number
  idempotencyKey: string
}

export type DeliveryDecrementResult = {
  alreadyProcessed: boolean
  decrements: AppliedDeliveryDecrement[]
}

export function buildDeliveryDecrementIdempotencyKey(
  orderId: string,
  vaccineId: string,
): string {
  return `delivery-decrement:${orderId}:${vaccineId}`
}

export function aggregateOrderLinesByVaccine(
  lines: Array<{ vaccineId: string; vaccineName: string; quantity: number }>,
): Map<string, { vaccineId: string; vaccineName: string; quantity: number }> {
  const merged = new Map<
    string,
    { vaccineId: string; vaccineName: string; quantity: number }
  >()

  for (const line of lines) {
    const existing = merged.get(line.vaccineId)

    if (existing) {
      existing.quantity += line.quantity
    } else {
      merged.set(line.vaccineId, {
        vaccineId: line.vaccineId,
        vaccineName: line.vaccineName,
        quantity: line.quantity,
      })
    }
  }

  return merged
}
