/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import { useChartThemeRevision } from '@/composables/useChartThemeRevision'

describe('useChartThemeRevision', () => {
  it('increments when the document class list changes', async () => {
    let revisionRef: ReturnType<typeof useChartThemeRevision> | null = null

    const wrapper = mount({
      setup() {
        revisionRef = useChartThemeRevision()
        return { revision: revisionRef }
      },
      template: '<div>{{ revision }}</div>',
    })

    await nextTick()
    expect(revisionRef!.value).toBe(0)

    document.documentElement.classList.add('dark')
    // MutationObserver is async in happy-dom; allow a tick.
    await vi.waitFor(() => {
      expect(revisionRef!.value).toBeGreaterThan(0)
    })

    wrapper.unmount()
    document.documentElement.classList.remove('dark')
  })
})
