import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

/**
 * Increments when the document element class list changes (e.g. `.dark`),
 * so chart option computeds can rebuild with fresh CSS-variable colours.
 */
export function useChartThemeRevision(): Ref<number> {
  const revision = ref(0)
  let observer: MutationObserver | null = null

  onMounted(() => {
    if (
      typeof MutationObserver === 'undefined' ||
      typeof document === 'undefined'
    ) {
      return
    }
    observer = new MutationObserver(() => {
      revision.value += 1
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
    observer = null
  })

  return revision
}
