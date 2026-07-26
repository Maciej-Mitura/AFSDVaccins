/**
 * Compatibility re-export — next-stop derivation lives in the Phase 30A
 * location module so notifications and progress location share one algorithm.
 */
export {
  deriveNextStop,
  isStopDelivered,
  selectNextUndeliveredStop,
} from '../routes/location/derive-next-stop'
