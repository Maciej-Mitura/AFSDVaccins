import { ref } from 'vue'

export type RealtimeConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'unavailable'

const connectionState = ref<RealtimeConnectionState>('idle')

export function setRealtimeConnectionState(
  state: RealtimeConnectionState,
): void {
  connectionState.value = state
}

export function useRealtimeConnection() {
  return {
    connectionState,
  }
}
