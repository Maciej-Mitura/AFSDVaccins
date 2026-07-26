import { registerEnumType } from '@nestjs/graphql'

/**
 * Who recorded stop arrival. Phase 28C only supports courier-recorded arrival.
 */
export enum StopArrivalSource {
  COURIER = 'COURIER',
}

registerEnumType(StopArrivalSource, {
  name: 'StopArrivalSource',
  description: 'Source that recorded courier stop arrival.',
})
