import { registerEnumType } from '@nestjs/graphql'

export enum StockAdjustmentType {
  RESTOCK = 'RESTOCK',
  MANUAL_CORRECTION = 'MANUAL_CORRECTION',
  MANUAL_DECREASE = 'MANUAL_DECREASE',
  DELIVERY_DEDUCTION = 'DELIVERY_DEDUCTION',
}

registerEnumType(StockAdjustmentType, {
  name: 'StockAdjustmentType',
  description: 'Immutable stock audit adjustment categories',
})
