const DELIVERY_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function isValidDeliveryDateString(value: string): boolean {
  if (!DELIVERY_DATE_PATTERN.test(value)) {
    return false
  }

  const [year, month, day] = value.split('-').map(Number)
  const probe = new Date(Date.UTC(year, month - 1, day))

  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  )
}
