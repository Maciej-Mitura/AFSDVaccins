/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick, ref } from 'vue'

const routePath = ref('/admin/orders')
const push = vi.fn()
const logout = vi.fn(() => Promise.resolve(undefined))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
  }),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({
    get path() {
      return routePath.value
    },
    get fullPath() {
      return routePath.value
    },
  }),
  useRouter: () => ({ push }),
  RouterLink: {
    name: 'RouterLink',
    props: ['to'],
    template: "<a :href=\"typeof to === 'string' ? to : '#'\"><slot /></a>",
  },
}))

vi.mock('@/composables/useFirebase', () => ({
  useFirebase: () => ({
    isAuthenticated: ref(true),
    logout,
  }),
}))

vi.mock('@/composables/useCurrentUser', () => ({
  useCurrentUser: () => ({ clearCurrentUser: vi.fn() }),
}))

vi.mock('@/composables/useNotifications', () => ({
  useNotifications: () => ({ clearNotificationState: vi.fn() }),
  setNotificationTranslate: vi.fn(),
}))

vi.mock('@/composables/useDeliveryRoutes', () => ({
  useDeliveryRoutes: () => ({ clearTodayRouteState: vi.fn() }),
}))

vi.mock('@/composables/useNotificationToast', () => ({
  setNotificationToastNavigate: vi.fn(),
  setNotificationToastOpenLabel: vi.fn(),
  clearNotificationToastState: vi.fn(),
}))

vi.mock('@/composables/usePushNotifications', () => ({
  usePushNotifications: () => ({ resetSession: vi.fn() }),
}))

vi.mock('@/composables/useGraphQL', () => ({
  clearApolloCache: vi.fn(() => Promise.resolve(undefined)),
}))

import CommonAppShell from '@/components/common/CommonAppShell.vue'

const UButtonStub = {
  name: 'UButton',
  props: {
    to: { type: [String, Object], default: undefined },
    variant: { type: String, default: 'ghost' },
    color: { type: String, default: 'neutral' },
    loading: { type: Boolean, default: false },
    block: { type: Boolean, default: false },
  },
  emits: ['click'],
  template: `
    <a
      v-if="to"
      :href="typeof to === 'string' ? to : '#'"
      :data-variant="variant"
      :aria-current="$attrs['aria-current']"
      :class="$attrs.class"
      :data-testid="$attrs['data-testid']"
      @click="$emit('click', $event)"
    ><slot /></a>
    <button
      v-else
      type="button"
      :data-testid="$attrs['data-testid']"
      :aria-label="$attrs['aria-label']"
      :aria-expanded="$attrs['aria-expanded']"
      :aria-controls="$attrs['aria-controls']"
      :class="$attrs.class"
      @click="$emit('click', $event)"
    ><slot /></button>
  `,
}

const USlideoverStub = {
  name: 'USlideover',
  props: {
    open: { type: Boolean, default: false },
    title: { type: String, default: '' },
    description: { type: String, default: '' },
    side: { type: String, default: 'right' },
    transition: { type: Boolean, default: true },
    overlay: { type: Boolean, default: true },
    close: { type: [Boolean, Object], default: true },
    content: { type: Object, default: () => ({}) },
    ui: { type: Object, default: () => ({}) },
  },
  emits: ['update:open'],
  template: `
    <Teleport to="body">
      <div v-if="open" data-testid="app-shell-mobile-portal">
        <button
          type="button"
          data-testid="app-shell-mobile-backdrop"
          aria-label="backdrop"
          @click="$emit('update:open', false)"
        />
        <div
          :id="content.id || 'app-shell-mobile-nav'"
          role="dialog"
          aria-modal="true"
          data-testid="app-shell-mobile-nav"
          tabindex="-1"
        >
          <button
            type="button"
            data-testid="app-shell-mobile-nav-close"
            :aria-label="
              typeof close === 'object' && close['aria-label']
                ? close['aria-label']
                : 'Close'
            "
            @click="$emit('update:open', false)"
          >
            Close
          </button>
          <slot name="body" :close="() => $emit('update:open', false)" />
        </div>
      </div>
    </Teleport>
  `,
}

const adminNavLinks = [
  { label: 'Dashboard', to: '/admin' },
  { label: 'Orders', to: '/admin/orders' },
  { label: 'History', to: '/admin/history' },
  { label: 'Route planning', to: '/admin/route-planning' },
  { label: 'Route templates', to: '/admin/route-templates' },
  { label: 'Courier analytics', to: '/admin/analytics/couriers' },
  { label: 'Vaccines', to: '/admin/vaccines' },
  { label: 'Stock', to: '/admin/stock' },
  { label: 'Settings', to: '/admin/settings' },
]

describe('CommonAppShell layout', () => {
  let wrapper: VueWrapper | null = null

  beforeEach(() => {
    routePath.value = '/admin/orders'
    push.mockReset()
    logout.mockClear()
    document.body.style.overflow = ''
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    document.body.style.overflow = ''
  })

  function mountShell(
    overrides: {
      title?: string
      navLinks?: { label: string; to: string }[]
      accountLinks?: { label: string; to: string }[]
      notificationLink?: { label: string; to: string }
    } = {},
  ) {
    wrapper = mount(CommonAppShell, {
      props: {
        title: overrides.title ?? 'Admin',
        navLinks: overrides.navLinks ?? [
          { label: 'Dashboard', to: '/admin' },
          { label: 'Orders', to: '/admin/orders' },
        ],
        accountLinks: overrides.accountLinks ?? [
          { label: 'Profile', to: '/profile' },
        ],
        notificationLink: overrides.notificationLink ?? {
          label: 'Notifications',
          to: '/admin/notifications',
        },
      },
      attachTo: document.body,
      slots: {
        'header-actions':
          '<a data-testid="notification-bell" href="/admin/notifications">Notifications</a>',
      },
      global: {
        stubs: {
          UButton: UButtonStub,
          Button: UButtonStub,
          UIcon: true,
          USlideover: USlideoverStub,
          Slideover: USlideoverStub,
          CommonLanguageSelector: {
            props: {
              compact: { type: Boolean, default: false },
              block: { type: Boolean, default: false },
            },
            template:
              "<div data-testid=\"language-selector\" :data-compact=\"compact ? 'true' : 'false'\" :data-block=\"block ? 'true' : 'false'\" />",
          },
          CommonPushPermissionBanner: true,
        },
      },
    })
    return wrapper
  }

  async function openDrawer(shell: VueWrapper) {
    await shell.get('[data-testid="app-shell-menu-toggle"]').trigger('click')
    await nextTick()
  }

  it('keeps brand, primary nav, and account zones as independent grid regions', () => {
    const shell = mountShell()
    const header = shell.get('[data-testid="app-shell-header"]')
    expect(header.classes().join(' ')).toMatch(
      /lg:grid-cols-\[minmax\(max-content,1fr\)_auto_minmax\(max-content,1fr\)\]/,
    )

    const brand = shell.get('[data-testid="app-shell-brand"]')
    expect(brand.classes().join(' ')).toMatch(/justify-self-start/)
    expect(shell.get('[data-testid="app-shell-title"]').text()).toBe('Admin')
    expect(shell.find('h1').exists()).toBe(false)

    const primary = shell.get('[data-testid="app-shell-primary-nav"]')
    expect(primary.classes().join(' ')).toMatch(/justify-self-center/)
    expect(primary.classes().join(' ')).toMatch(/lg:flex/)

    const actions = shell.get('[data-testid="app-shell-actions"]')
    expect(actions.classes().join(' ')).toMatch(/justify-self-end/)
  })

  it('places language selector in a secondary row under account controls', () => {
    const shell = mountShell()
    const accountNav = shell.get('[data-testid="app-shell-account-nav"]')
    const accountRow = shell.get('[data-testid="app-shell-account-row"]')

    expect(accountRow.find('[data-testid="language-selector"]').exists()).toBe(
      false,
    )
    expect(accountNav.find('[data-testid="language-selector"]').exists()).toBe(
      true,
    )
    expect(
      accountNav
        .get('[data-testid="language-selector"]')
        .attributes('data-compact'),
    ).toBe('true')
  })

  it('does not duplicate notifications in primary navigation', () => {
    const shell = mountShell()
    const primaryHrefs = shell
      .findAll('[data-testid="app-shell-primary-nav"] a')
      .map(a => a.attributes('href'))
    expect(primaryHrefs).not.toContain('/admin/notifications')
    expect(shell.findAll('[data-testid="notification-bell"]')).toHaveLength(1)
  })

  it('allows ADMIN primary nav labels to wrap without truncation', () => {
    const shell = mountShell({ navLinks: adminNavLinks })
    const links = shell.findAll('[data-testid="app-shell-primary-nav"] a')
    expect(links).toHaveLength(adminNavLinks.length)
    for (const link of links) {
      const classes = link.classes().join(' ')
      expect(classes).toMatch(/whitespace-normal/)
      expect(classes).not.toMatch(/truncate/)
    }
  })

  it('keeps a logical desktop tab order: nav, notifications, profile, logout, language', () => {
    const shell = mountShell()
    const focusable = shell
      .findAll('a, button, [data-testid="language-selector"]')
      .filter(node => {
        const testId = node.attributes('data-testid')
        return (
          testId === undefined ||
          ![
            'app-shell-menu-toggle',
            'logout-button-mobile',
            'app-shell-mobile-notifications',
            'app-shell-mobile-nav-close',
            'app-shell-mobile-backdrop',
          ].includes(testId)
        )
      })
      .map(node => {
        if (node.attributes('data-testid') === 'notification-bell') {
          return 'notifications'
        }
        if (node.attributes('data-testid') === 'logout-button') {
          return 'logout'
        }
        if (node.attributes('data-testid') === 'language-selector') {
          return 'language'
        }
        return node.attributes('href') ?? node.text()
      })

    const desktopOrder = focusable.filter(item =>
      [
        '/admin',
        '/admin/orders',
        'notifications',
        '/profile',
        'logout',
        'language',
      ].includes(item),
    )
    expect(desktopOrder).toEqual([
      '/admin',
      '/admin/orders',
      'notifications',
      '/profile',
      'logout',
      'language',
    ])
  })

  it('marks the active primary route with aria-current', () => {
    const shell = mountShell()
    const active = shell
      .findAll('[data-testid="app-shell-primary-nav"] a')
      .find(a => a.attributes('href') === '/admin/orders')
    expect(active?.attributes('aria-current')).toBe('page')
    expect(active?.attributes('data-variant')).toBe('soft')
  })

  it('shows brand, notification and hamburger in the closed mobile header', () => {
    const shell = mountShell()
    expect(shell.find('[data-testid="app-shell-brand"]').exists()).toBe(true)
    expect(
      shell
        .find(
          '[data-testid="app-shell-actions"] [data-testid="notification-bell"]',
        )
        .exists(),
    ).toBe(true)
    const toggle = shell.get('[data-testid="app-shell-menu-toggle"]')
    expect(toggle.classes().join(' ')).toMatch(/min-h-11/)
    expect(toggle.classes().join(' ')).toMatch(/min-w-11/)
    expect(toggle.classes().join(' ')).toMatch(/lg:hidden/)
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(toggle.attributes('aria-controls')).toBe('app-shell-mobile-nav')
  })

  it('renders the mobile drawer outside normal document flow via portal', async () => {
    const shell = mountShell()
    expect(shell.find('[data-testid="app-shell-mobile-nav"]').exists()).toBe(
      false,
    )
    expect(
      shell.get('header').find('[data-testid="app-shell-mobile-nav"]').exists(),
    ).toBe(false)

    await openDrawer(shell)

    const drawer = document.querySelector(
      '[data-testid="app-shell-mobile-nav"]',
    )
    expect(drawer).not.toBeNull()
    expect(shell.get('header').element.contains(drawer)).toBe(false)
    expect(document.body.contains(drawer)).toBe(true)
  })

  it('opens the drawer with aria-expanded and groups primary/utility sections', async () => {
    const shell = mountShell()
    await openDrawer(shell)

    expect(
      shell
        .get('[data-testid="app-shell-menu-toggle"]')
        .attributes('aria-expanded'),
    ).toBe('true')
    expect(
      document.querySelector('[data-testid="app-shell-mobile-primary"]'),
    ).not.toBeNull()
    expect(
      document.querySelector('[data-testid="app-shell-mobile-utilities"]'),
    ).not.toBeNull()
    expect(
      document.querySelector('[data-testid="app-shell-mobile-notifications"]'),
    ).not.toBeNull()
    expect(
      document.querySelector('[data-testid="logout-button-mobile"]'),
    ).not.toBeNull()
    expect(
      document
        .querySelector(
          '[data-testid="app-shell-mobile-utilities"] [data-testid="language-selector"]',
        )
        ?.getAttribute('data-block'),
    ).toBe('true')
  })

  it('closes the drawer from close button, backdrop, Escape, and route changes', async () => {
    const shell = mountShell()

    await openDrawer(shell)
    document
      .querySelector<HTMLButtonElement>(
        '[data-testid="app-shell-mobile-nav-close"]',
      )
      ?.click()
    await nextTick()
    expect(
      document.querySelector('[data-testid="app-shell-mobile-nav"]'),
    ).toBeNull()

    await openDrawer(shell)
    document
      .querySelector<HTMLButtonElement>(
        '[data-testid="app-shell-mobile-backdrop"]',
      )
      ?.click()
    await nextTick()
    expect(
      document.querySelector('[data-testid="app-shell-mobile-nav"]'),
    ).toBeNull()

    await openDrawer(shell)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(
      document.querySelector('[data-testid="app-shell-mobile-nav"]'),
    ).toBeNull()

    await openDrawer(shell)
    routePath.value = '/admin'
    await nextTick()
    expect(
      document.querySelector('[data-testid="app-shell-mobile-nav"]'),
    ).toBeNull()
  })

  it('returns focus to the hamburger after closing without owning body scroll lock', async () => {
    const shell = mountShell()
    const toggle = shell.get('[data-testid="app-shell-menu-toggle"]')
    const toggleEl = toggle.element as HTMLButtonElement
    toggleEl.focus = vi.fn()

    // Body scroll locking is owned by USlideover/Reka Dialog — the shell must
    // not set document.body.style.overflow (avoids competing lock races).
    document.body.style.overflow = 'visible'
    await openDrawer(shell)
    expect(document.body.style.overflow).toBe('visible')

    document
      .querySelector<HTMLButtonElement>(
        '[data-testid="app-shell-mobile-nav-close"]',
      )
      ?.click()
    await nextTick()
    await nextTick()

    expect(document.body.style.overflow).toBe('visible')
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(toggleEl.focus).toHaveBeenCalled()
  })

  it('does not write body.style.overflow when opening or closing the drawer', async () => {
    const shell = mountShell()
    document.body.style.overflow = ''

    await openDrawer(shell)
    expect(document.body.style.overflow).toBe('')

    document
      .querySelector<HTMLButtonElement>(
        '[data-testid="app-shell-mobile-nav-close"]',
      )
      ?.click()
    await nextTick()
    expect(document.body.style.overflow).toBe('')
  })

  it('marks active mobile routes with aria-current and keeps logout working', async () => {
    const shell = mountShell()
    await openDrawer(shell)

    const active = Array.from(
      document.querySelectorAll('[data-testid="app-shell-mobile-primary"] a'),
    ).find(a => a.getAttribute('href') === '/admin/orders')
    expect(active?.getAttribute('aria-current')).toBe('page')

    document
      .querySelector<HTMLButtonElement>('[data-testid="logout-button-mobile"]')
      ?.click()
    await nextTick()
    expect(logout).toHaveBeenCalled()
  })

  it('wires reduced-motion handling into the slideover transition prop', () => {
    const shell = mountShell()
    const slideover = shell.findComponent({ name: 'USlideover' })
    expect(slideover.exists()).toBe(true)
    expect(slideover.props('transition')).toBe(true)
    expect(slideover.props('side')).toBe('right')
    expect(slideover.props('overlay')).toBe(true)
  })
})
