# Frontend manual review checklist (Phase 35G6)

Concise final user-test preparation for the Vue PWA. Automated Vitest/Playwright cover headings, shell nav, role isolation, and focused flows; items below still need a human pass.

## Viewports

- [ ] **390 px** phone — no horizontal page overflow; critical actions reachable; mobile menu usable
- [ ] **768 px** tablet — filters/tables readable; nav wrapping acceptable
- [ ] **1280 px** desktop — admin primary nav usable with long labels; content not overly wide

## Theme

- [ ] **Light mode** — teal primary buttons/links/focus rings readable
- [ ] **Dark-mode smoke** — force `.dark` on `html`; body text, muted copy, badges, tables, and charts remain readable (no user-facing toggle)

## Keyboard and assistive tech

- [ ] **Keyboard-only navigation** — header, mobile menu, filters, expanders, modals, QR fallback, quantity fields, destructive confirms
- [ ] **Visible focus** after tabbing; focus returns sensibly after dialog close
- [ ] **200% browser zoom** — no clipped primary actions or unusable wrapping
- [ ] Screen reader: status is not colour-only; critical errors announced without noisy live-region spam

## i18n label stress

- [ ] **Long Dutch** labels in admin nav and forms
- [ ] **Long Spanish** labels
- [ ] **Long Chinese** labels
- [ ] Critical labels wrap rather than truncate into unreadability

## Content states

- [ ] **Empty** states on dashboards, orders, routes, history, analytics
- [ ] **Populated** operational lists/tables
- [ ] **Error** / offline banners where applicable

## Courier / device edge cases

- [ ] **Offline courier** states (today route / sync messaging)
- [ ] **QR permission denied** + manual fallback
- [ ] **Voice unsupported / offline** messaging
- [ ] Voice record/stop/upload controls fit phone width

## Layout specifics

- [ ] **Modal overflow** — route template edit, stock adjust, vaccine CRUD, QR preview, order confirms scroll inside viewport
- [ ] **Table scrolling** — intentional horizontal scroll on wide admin/history/analytics tables; no whole-page overflow
- [ ] **Focus after dialog close** returns to a sensible control

## Roles (smoke)

- [ ] ADMIN — shell links, orders, planning, analytics, vaccines, stock, settings
- [ ] APOTHEKER — create/place order, cancel, history
- [ ] BEZORGER — today/tomorrow, arrival, QR, voice
- [ ] Auth — login, register, forgot password, complete profile
- [ ] Shared — profile, push settings, 403, 404

## Sign-off

- [ ] No blocker for user testing from this checklist
- [ ] Deferred polish (if any) noted in the Phase 35G6 report
