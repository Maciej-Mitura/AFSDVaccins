export type AdminOrderMutationFailure = {
  statusActionError: string | null
  cancelActionError: string | null
  ordersError: string | null
}

export function applyStatusMutationFailure(
  current: AdminOrderMutationFailure,
  message: string,
): AdminOrderMutationFailure {
  return {
    ...current,
    statusActionError: message,
    ordersError: current.ordersError,
  }
}

export function applyCancelMutationFailure(
  current: AdminOrderMutationFailure,
  message: string,
): AdminOrderMutationFailure {
  return {
    ...current,
    cancelActionError: message,
    ordersError: current.ordersError,
  }
}

export function clearStatusActionError(
  current: AdminOrderMutationFailure,
): AdminOrderMutationFailure {
  return {
    ...current,
    statusActionError: null,
  }
}

export function clearCancelActionError(
  current: AdminOrderMutationFailure,
): AdminOrderMutationFailure {
  return {
    ...current,
    cancelActionError: null,
  }
}

export function shouldShowOrdersLoadError(
  ordersError: string | null,
  orderCount: number,
): boolean {
  return ordersError !== null && orderCount === 0
}

export function shouldRefetchAfterSuccessfulStatusMutation(
  succeeded: boolean,
): boolean {
  return succeeded
}
