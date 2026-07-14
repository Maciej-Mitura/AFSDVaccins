# Project Fiche Analysis — Vaccinatie-levering

Domain analysis for the exam project **Vaccinatie-levering**, derived from the project-specific description and supporting assignment documents. Teacher Bear Spray domain is excluded.

**Primary evidence:** [`project-fiche.md`](./project-fiche.md) (canonical project description; requested path `docs/project-description.md` does not exist — content is identical to `description.md` L198–252).

**Supporting evidence:** [`description.md`](./description.md) (technical checklists, rubric, presentation), [`requirements-matrix.md`](./requirements-matrix.md), [`workspace-readiness.md`](./workspace-readiness.md).

**Build context:** There is no exam starter project. The application will be created from scratch in `examAfsdMaciejMitura/` using course-aligned patterns from the read-only teacher reference.

### Provisional policy defaults

Values not explicit in the fiche are implemented as **configurable policies** (architecture is not blocked):

| Policy                           | Provisional default                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Timezone                         | `Europe/Brussels`                                                                                            |
| Week definition                  | ISO week, Monday through Sunday                                                                              |
| Closing time                     | Configurable env/domain setting; seed value `14:00`                                                          |
| Approaching weekly limit warning | Configurable; initial value **90%** of 200-dose cap                                                          |
| Low-stock threshold              | Configurable per vaccine type                                                                                |
| Delivery status mutation         | Admin initially; architecture must allow bezorger later                                                      |
| Stock decrement                  | When order marked _geleverd_, not on submit                                                                  |
| Frontend                         | One Vue PWA with role-specific route groups (apotheker, admin, bezorger)                                     |
| Authentication                   | Firebase email/password; PKCE only if OAuth authorization-code provider added or teacher explicitly requires |

## 1. Problem statement

### Real-world problem

Pharmacies need vaccines delivered on predictable schedules, but ordering, stock, routing, and delivery coordination are still largely manual. Delivery routes must reflect **which pharmacies actually ordered**, respect **daily and weekly dose limits**, and honour a **closing-time cutoff** that determines whether delivery is same-day or next-day. Couriers need mobile access to **only their own routes**; administrators must plan routes from **templates**, monitor **stock**, and track **delivery status** without exposing one pharmacy's or courier's data to another.

> _"Digitaal platform voor vaccin-bestelling en routebeheer op basis van aptohekerwensen"_ — `project-fiche.md` L2

### Who experiences it

| Stakeholder   | Pain (from fiche)                                                                                                                                         |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Apotheker** | Must place orders within limits, know delivery timing, track history and weekly usage, receive warnings before limits are hit                             |
| **Admin**     | Must build and assign routes, skip pharmacies without orders, manage vaccine stock, monitor daily orders and delivery progress, produce weekly statistics |
| **Bezorger**  | Needs today's and tomorrow's route on mobile, with address and quantities per stop, without seeing other couriers' routes                                 |

> _"3 gebruikersrollen - apotheker, admin, bezorger"_ — `project-fiche.md` L9

### What the application is expected to improve

- **Digital ordering** replacing ad-hoc communication, with enforced limits at submission time.
- **Automated route planning** from templates, excluding pharmacies without active orders (_"niet omrijden"_).
- **Role-scoped visibility** so each actor sees only relevant screens and data.
- **Operational awareness** through order history, delivery status, stock levels, week statistics, and notifications (confirmation, expected delivery time, approaching week limit, low stock).

The general assignment adds that flows must solve a **client problem** with usable UX, not merely demonstrate technology (`description.md` L35, rubric L254–281).

### What would make the solution successful

| Criterion                                                                                         | Evidence                            |
| ------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Orders respect closing time, limits, and non-retroactivity                                        | `project-fiche.md` L5–8, L12–18     |
| Routes contain only pharmacies with active orders; templates drive daily planning                 | `project-fiche.md` L30–31, L34, L44 |
| Each role accesses only own screens and data                                                      | `project-fiche.md` L10, L52–55      |
| Admin can oversee orders, stock, routes, and statistics                                           | `project-fiche.md` L28–42           |
| Bezorger can execute today's route and preview tomorrow's                                         | `project-fiche.md` L42–48           |
| Solution is demonstrable after Docker + seed (`description.md` L51, L185)                         | Technical exam expectation          |
| Realtime adds **UX value with business logic**, not a generic refresh (`description.md` L314–326) | Rubric band 7+                      |

---

## 2. Actors and roles

### Identity vs role vs ownership

| Concept                    | Meaning in this domain                                                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Authenticated identity** | Firebase-authenticated person (`description.md` L68–71); linked to an application user record with `external_uid` (pattern from requirements matrix; not named in fiche)       |
| **Application role**       | One of: **apotheker**, **admin**, **bezorger** (`project-fiche.md` L9)                                                                                                         |
| **Record ownership**       | Apotheker owns their orders and sees only their week usage; bezorger owns assigned routes; admin operates on global operational data but must not break per-role privacy rules |

Evaluation account `docent@howest.be` / `P@ssword123` is a **mandatory seeded admin** for grading (`description.md` L71), not a fourth domain role.

### Actor table

| Actor                 | Authentication required | Application role | Main goals                                                                                         | Allowed actions                                                                                                                                                                                                                                                                                          | Forbidden actions                                                                                                                                                     | Data ownership                                                                                                         |
| --------------------- | ----------------------- | ---------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Apotheker**         | Yes                     | `apotheker`      | Order vaccines within limits; track history and week usage; receive delivery-related notifications | Place orders (3 vaccine types, within daily/weekly caps); view own order history and statuses (_in behandeling_, _geleverd_); view own week usage per vaccine; receive order confirmation, expected delivery time, week-limit warnings                                                                   | Place retroactive orders; exceed 50 doses/day per type or 200/week total; view other pharmacies' orders, routes, or stock; access admin or bezorger screens           | Own **orders** and derived **week usage**; own profile/notification state                                              |
| **Admin**             | Yes                     | `admin`          | Plan delivery operations, maintain stock, monitor fulfilment and statistics                        | Create route templates with fixed daily stops; link templates to bezorgers; generate daily planning from templates; assign routes per bezorger; view and replenish stock; receive low-stock warnings; view daily order overview per apotheker; track delivery status; view weekly statistics per vaccine | Access bezorger-only mobile route execution views as another courier's identity; expose one apotheker's data to another apotheker (must respect fiche privacy intent) | **Global** route templates, daily routes, stock, aggregated reports; manages relationships to apothekers and bezorgers |
| **Bezorger**          | Yes                     | `bezorger`       | Execute today's deliveries; preview tomorrow's route                                               | View **own** today's route with stops only for apothekers with active orders; per stop see address, vaccines, quantities; view tomorrow's route preview based on orders before closing time                                                                                                              | View other bezorgers' routes; see stops for apothekers without active orders; access apotheker ordering or admin backoffice functions                                 | Own **assigned routes** (today and tomorrow preview), linked to own account/chauffeursprofiel                          |
| **Anonymous visitor** | No                      | —                | Authenticate                                                                                       | Register / log in (implied by Firebase auth checklist; not detailed in fiche)                                                                                                                                                                                                                            | Access any role-specific screen or data                                                                                                                               | None                                                                                                                   |

> _"Elke rol heeft toegang tot enkel eigen schermen en gegevens"_ — `project-fiche.md` L10

---

## 3. Mandatory workflows

| ID           | Workflow                                        | Initiating actor   | Preconditions                                                                             | Main steps                                                                                                                                                                                                                                                        | Result                                                                 | Authorization                                    | Realtime consequence                                                                            | Edge cases                                                                                                                                                                       | Evidence                                        |
| ------------ | ----------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| **FLOW-001** | Apotheker places vaccine order                  | Apotheker          | Authenticated as apotheker; order is not retroactive; vaccines exist in catalog (3 types) | Select vaccine type(s) and quantities; system evaluates closing time for delivery day; validates daily cap (50/type) and weekly cap (200 total); on success persist order with status _in behandeling_; send confirmation and expected delivery time notification | Order stored; apotheker sees confirmation and expected delivery timing | Apotheker only; ownership = own pharmacy account | Admin dashboard may show new order; apotheker receives confirmation (candidate subscription)    | Order before vs after closing time changes delivery day; hitting 49→50 daily OK, 51 blocked; week total 199→200 OK, 201 blocked; order at week limit triggers warning (FLOW-003) | `project-fiche.md` L5–8, L12–18, L20–26         |
| **FLOW-002** | Apotheker views order history and week usage    | Apotheker          | Authenticated as apotheker                                                                | List previous orders; show status per order; aggregate week usage per vaccine type                                                                                                                                                                                | Read-only history and usage visible                                    | Apotheker; only own records                      | Optional refresh when order status changes to _geleverd_                                        | Empty history for new pharmacy; mixed statuses in list                                                                                                                           | `project-fiche.md` L16–19                       |
| **FLOW-003** | Apotheker receives operational notifications    | System / Apotheker | Active apotheker session or notification channel                                          | On order placed → confirmation + expected delivery time; when week usage approaches limit → warning                                                                                                                                                               | User-visible alerts/messages                                           | Apotheker receives only own notifications        | **Strong realtime candidate**: week-limit warning and delivery-time updates pushed to apotheker | Warning threshold not specified; notification channel not specified                                                                                                              | `project-fiche.md` L20–26                       |
| **FLOW-004** | Admin creates route template                    | Admin              | Authenticated as admin                                                                    | Define template with fixed stops per day (linked to apotheker locations)                                                                                                                                                                                          | Reusable route template stored                                         | Admin only                                       | None required                                                                                   | Template with zero stops; duplicate templates                                                                                                                                    | `project-fiche.md` L28–31                       |
| **FLOW-005** | Admin links template to bezorger                | Admin              | Template exists; bezorger account exists                                                  | Associate template with a specific bezorger (chauffeursprofiel)                                                                                                                                                                                                   | Template–bezorger binding stored                                       | Admin only                                       | Bezorger may be notified of assignment (inferred)                                               | Re-linking template to different bezorger                                                                                                                                        | `project-fiche.md` L31–32                       |
| **FLOW-006** | Admin generates daily planning from template    | Admin              | Template linked to bezorger; orders exist for target day                                  | Generate day plan from template; **exclude apothekers without an active order** for that day                                                                                                                                                                      | Daily route plan with filtered stops                                   | Admin only                                       | Bezorger's today/tomorrow views update (candidate subscription)                                 | All template stops skipped when no orders → empty route; partial orders across vaccine types                                                                                     | `project-fiche.md` L30–31, L34                  |
| **FLOW-007** | Admin assigns / manages routes per bezorger     | Admin              | Daily planning or routes exist                                                            | Opstellen en toewijzen routes per bezorger                                                                                                                                                                                                                        | Bezorger has assigned route for the day                                | Admin only; bezorger read-only on own assignment | Route assignment push to bezorger (strong realtime candidate)                                   | Two bezorgers must not receive each other's routes                                                                                                                               | `project-fiche.md` L28–30, L52–55               |
| **FLOW-008** | Admin manages vaccine stock                     | Admin              | Authenticated as admin                                                                    | View current stock per vaccine; purchase/add stock                                                                                                                                                                                                                | Stock levels updated                                                   | Admin only                                       | Low-stock warning when threshold crossed (FLOW-009)                                             | Stock insufficient for pending orders (not specified how to handle)                                                                                                              | `project-fiche.md` L32–37                       |
| **FLOW-009** | Admin receives low-stock warning                | System             | Stock below implicit threshold                                                            | Detect low stock; surface warning to admin                                                                                                                                                                                                                        | Admin warned                                                           | Admin only                                       | **Realtime candidate** for admin operations desk                                                | Threshold value not specified                                                                                                                                                    | `project-fiche.md` L35–38                       |
| **FLOW-010** | Admin monitors daily orders and delivery status | Admin              | Orders and routes exist                                                                   | View daily overview per apotheker; track leveringsstatus                                                                                                                                                                                                          | Operational visibility for fulfilment                                  | Admin only                                       | Status changes visible in realtime (inferred from monitoring goal)                              | Partial delivery / stuck _in behandeling_                                                                                                                                        | `project-fiche.md` L36–38                       |
| **FLOW-011** | Admin views weekly statistics per vaccine       | Admin              | Historical orders in current week window                                                  | Aggregate and display week statistics per vaccine                                                                                                                                                                                                                 | Reporting view                                                         | Admin only                                       | None required                                                                                   | Week boundary ambiguity affects totals                                                                                                                                           | `project-fiche.md` L39–42                       |
| **FLOW-012** | Bezorger executes today's route                 | Bezorger           | Authenticated as bezorger; route assigned for today                                       | Load own route; show only stops with active orders; per stop display address, vaccines, quantities                                                                                                                                                                | Courier can perform deliveries                                         | Bezorger; own routes only                        | Updates when admin regenerates route or order status changes                                    | Empty route when no active orders; stop removed if order cancelled (not specified)                                                                                               | `project-fiche.md` L42–45, L52–55               |
| **FLOW-013** | Bezorger previews tomorrow's route              | Bezorger           | Authenticated as bezorger                                                                 | Compute preview from orders placed **before closing time** for next day                                                                                                                                                                                           | Tomorrow stop list with quantities                                     | Bezorger; own preview only                       | Preview updates when new qualifying orders arrive (realtime candidate)                          | Orders after closing excluded from tomorrow preview                                                                                                                              | `project-fiche.md` L46–48                       |
| **FLOW-014** | Order progresses to delivered status            | Admin (inferred)   | Order _in behandeling_; delivery executed                                                 | Update order status to _geleverd_ (mechanism not specified)                                                                                                                                                                                                       | Apotheker history shows delivered; admin tracking updated              | Admin updates; apotheker reads own status        | Apotheker history updates live                                                                  | Who marks delivered (admin vs bezorger) not stated                                                                                                                               | `project-fiche.md` L18, L38 (status + opvolgen) |

---

## 4. Business rules

| ID           | Rule                                                                | Source (exact or paraphrased)                                                                                         | Affected workflow(s) | Data required                                                        | Validation location                              | Expected error behaviour                                                         | Test implication                                              |
| ------------ | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------- | -------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **RULE-001** | Order placed **before closing time** → delivery **that day**        | _"Besteliing geplaatst voor de sluitingstijd = levering die dag"_ — `project-fiche.md` L6                             | FLOW-001, FLOW-013   | Order timestamp, configured `sluitingstijd`, computed `deliveryDate` | Backend service on order submit                  | Order accepted with same-day `deliveryDate`; UI shows expected delivery that day | Unit test: 09:00 order before 12:00 closing → today           |
| **RULE-002** | Order placed **after closing time** → delivery **next day**         | _"Bestelling na sluitingstijd = levering volgende dag"_ — `project-fiche.md` L7                                       | FLOW-001, FLOW-013   | Order timestamp, closing time                                        | Backend service                                  | Order accepted with next-day `deliveryDate`                                      | Unit test: order one minute after closing                     |
| **RULE-003** | **No retroactive orders**                                           | _"Geen retroactieve bestellingen mogelijk"_ — `project-fiche.md` L8                                                   | FLOW-001             | Requested delivery date, current date/time                           | Backend service                                  | Reject with clear message; no persistence                                        | E2E: cannot order for yesterday                               |
| **RULE-004** | Exactly **3 vaccine types** available for ordering                  | _"3 vaccintypes beschikbaar"_ — `project-fiche.md` L14                                                                | FLOW-001             | Vaccine catalog (3 entries)                                          | Backend + frontend catalog                       | Unknown type rejected                                                            | Seed must define 3 types; mutation rejects 4th                |
| **RULE-005** | **Maximum 50 doses per day per vaccine type** (per apotheker)       | _"Maximum 50 dosissen per dag per soort"_ — `project-fiche.md` L15                                                    | FLOW-001             | Order lines, apotheker id, vaccine type, date, existing day totals   | Backend service at submit                        | **Blocked with message** (_"overschrijding wordt geblokkeerd met melding"_)      | Test 50 OK, 51st rejected; cross-order same day accumulates   |
| **RULE-006** | **Maximum 200 doses per week** across all types (per apotheker)     | _"Maximum 200 dosissen per weerk (alle soorten samen)"_ — `project-fiche.md` L16                                      | FLOW-001, FLOW-003   | Weekly aggregated doses per apotheker                                | Backend service at submit                        | Block with message when >200                                                     | Week boundary tests; 199+2 rejected                           |
| **RULE-007** | Limit check runs **at submission**; exceed → block + message        | _"Limietcontrole bij indienen - overschrijding wordt geblokkeerd met melding"_ — `project-fiche.md` L18               | FLOW-001             | Same as RULE-005/006                                                 | Backend (authoritative); frontend mirrors for UX | User-visible validation error (JSON per `description.md` L85)                    | Integration test limit messages                               |
| **RULE-008** | Order statuses include at least **in behandeling** and **geleverd** | _"Status per bestelling (in behandeling, geleverd)"_ — `project-fiche.md` L18                                         | FLOW-002, FLOW-014   | Order.status enum                                                    | Backend enum validation                          | Invalid status rejected                                                          | State transition tests                                        |
| **RULE-009** | Apotheker sees **week usage per vaccine**                           | _"Weekverbruik per vaccin zichtbaar"_ — `project-fiche.md` L19                                                        | FLOW-002             | Aggregated order lines per week                                      | Backend query scoped to apotheker                | 403/empty for other apotheker                                                    | Ownership test                                                |
| **RULE-010** | Each role accesses **only own screens and data**                    | _"Elke rol heeft toegang tot enkel eigen schermen en gegevens"_ — `project-fiche.md` L10                              | All flows            | User.role, record ownership keys                                     | Backend guards + frontend route guards           | Forbidden or redirect                                                            | Authz E2E per role                                            |
| **RULE-011** | Route planning **skips apothekers without orders**                  | _"Apothekers zonder bestelling worden automatisch overgeslagen (niet omrijden)"_ — `project-fiche.md` L34             | FLOW-006, FLOW-012   | Template stops, active orders for day                                | Backend route generation service                 | Stop omitted from route                                                          | Seed: template includes pharmacy with no order → not in route |
| **RULE-012** | Bezorger stops only for apothekers with **active order**            | _"Stops enkel voor apothekers met een actieve bestelling"_ — `project-fiche.md` L44                                   | FLOW-012             | Route stops, order status                                            | Backend query filter                             | Stop not returned                                                                | API test filtered stops                                       |
| **RULE-013** | Tomorrow route preview uses orders before **closing time** only     | _"Gebaseerd op bestellingen ingediend voor de sluitingstijd"_ — `project-fiche.md` L48                                | FLOW-013             | Orders with timestamp vs closing                                     | Backend preview service                          | Post-closing orders excluded from tomorrow preview                               | Test order at 23:59 vs 00:01                                  |
| **RULE-014** | Bezorger sees **only own assigned routes**                          | _"Ziet enkel eigen toegewezen routes"_ / _"Geen toegang tot routes van andere bezorgers"_ — `project-fiche.md` L53–55 | FLOW-012, FLOW-013   | Route.bezorgerId                                                     | Backend ownership guard                          | 403 Forbidden                                                                    | Cross-bezorger access test                                    |
| **RULE-015** | Bezorger linked to own account/chauffeursprofiel                    | _"Gekoppeld aan eigen account/chauffeursprofiel"_ — `project-fiche.md` L54                                            | FLOW-007, FLOW-012   | User profile link                                                    | Backend on route assignment                      | Cannot view unassigned routes                                                    | Profile-route FK integrity                                    |
| **RULE-016** | Admin can view **daily overview per apotheker**                     | _"Dagelijks overzicht van bestelling per apotheker"_ — `project-fiche.md` L37                                         | FLOW-010             | All orders for day                                                   | Admin-scoped query                               | Non-admin denied                                                                 | Admin aggregation test                                        |
| **RULE-017** | Stock changes via admin **view / purchase / add**                   | _"Huidige voorraad per vaccin bekijken"_; _"Vaccins bijkopen of toevoegen aan stock"_ — `project-fiche.md` L33–37     | FLOW-008             | Stock per vaccine                                                    | Admin mutation guard                             | Non-admin denied                                                                 | Stock increment test                                          |
| **RULE-018** | Low stock triggers **admin warning**                                | _"Stockwaarschuwing bij lage voorraad"_ — `project-fiche.md` L38                                                      | FLOW-009             | Stock threshold                                                      | Backend on stock read/update                     | Warning event/notification                                                       | Seed low stock triggers alert                                 |
| **RULE-019** | Apotheker receives **confirmation** on placed order                 | _"Bevestiging bij geplaatste bestelling"_ — `project-fiche.md` L24                                                    | FLOW-001, FLOW-003   | Order id, delivery estimate                                          | Backend post-commit                              | User-visible confirmation                                                        | UI + optional subscription                                    |
| **RULE-020** | Apotheker receives **expected delivery time** notice                | _"Melding bij verwachte levertijd"_ — `project-fiche.md` L25                                                          | FLOW-001, FLOW-003   | deliveryDate, closing rules                                          | Backend                                          | Notification payload with time/date                                              | Assert message content                                        |
| **RULE-021** | Apotheker receives **approaching week-limit warning**               | _"Waarschuwing bij naderende weeklimiet"_ — `project-fiche.md` L26                                                    | FLOW-003             | Week usage, threshold                                                | Backend (threshold **unspecified**)              | Warning before hard block at 200                                                 | Test at e.g. 180/200 if threshold assumed                     |

### Rule tension (documented, not resolved)

- _"Bestelling geld voor levering die dag"_ (`project-fiche.md` L17) sits alongside RULE-001/002 (closing time determines delivery day). Provisional reading: the order always targets a **computed delivery day**; same-day is only when before closing. See §10.

---

## 5. Required data

Conceptual data needs only — **not** a final schema.

### Persistent entities (likely)

| Entity                                   | Purpose                                                             | Evidence                                               |
| ---------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------ |
| **User**                                 | Auth identity + application role (`apotheker`, `admin`, `bezorger`) | `project-fiche.md` L9–10; `description.md` L70–71      |
| **Apotheker profile**                    | Pharmacy identity, address for delivery stops                       | Implied by stops with _adres_ — `project-fiche.md` L45 |
| **Bezorger profile** (chauffeursprofiel) | Links user to route assignments                                     | `project-fiche.md` L54                                 |
| **Vaccine type**                         | Catalog of **3** orderable vaccines                                 | `project-fiche.md` L14                                 |
| **Order**                                | Apotheker purchase request with lines, status, delivery date        | `project-fiche.md` L12–18                              |
| **Order line**                           | Vaccine type + dose quantity                                        | Implied by limits per type                             |
| **Route template**                       | Fixed stops per day                                                 | `project-fiche.md` L31                                 |
| **Template stop**                        | Apotheker/location in template                                      | Implied                                                |
| **Daily route**                          | Generated/assigned plan for a date + bezorger                       | `project-fiche.md` L30–31, L43                         |
| **Route stop**                           | Address, vaccines, quantities for one apotheker                     | `project-fiche.md` L45                                 |
| **Stock level**                          | Quantity per vaccine                                                | `project-fiche.md` L33–37                              |

### Embedded value objects (candidates)

| Value object                        | Parent                         | Notes                               |
| ----------------------------------- | ------------------------------ | ----------------------------------- |
| **Address**                         | Apotheker profile / route stop | _adres_ per stop — L45              |
| **Dose quantity**                   | Order line, route stop         | Integer doses                       |
| **Delivery window / expected time** | Order notification             | From RULE-001/002                   |
| **Closing time config**             | System settings                | Not named; required by RULE-001–002 |

### Event or history data

| Data                      | Purpose                                                 |
| ------------------------- | ------------------------------------------------------- |
| Order status history      | Supports _in behandeling_ → _geleverd_ tracking         |
| Stock adjustment log      | Auditing admin _bijkopen/toevoegen_                     |
| Notification log          | Confirmation, delivery time, week-limit, stock warnings |
| Route generation snapshot | Explain why stops were skipped                          |

### User-owned data

| Owner     | Data                                                        |
| --------- | ----------------------------------------------------------- |
| Apotheker | Own orders, week usage aggregates, own notifications        |
| Bezorger  | Own assigned routes (today + tomorrow preview)              |
| Admin     | Not "owned" in privacy sense — operates on system-wide data |

### Administrative data

Route templates, template–bezorger links, stock levels, daily aggregates, weekly statistics, user–role assignments, seed accounts including `docent@howest.be`.

### Derived values (compute, do not trust client)

| Derived value             | Inputs                                        |
| ------------------------- | --------------------------------------------- |
| `deliveryDate`            | Order timestamp + closing time (RULE-001/002) |
| Daily dose total per type | Sum order lines for apotheker + date + type   |
| Weekly dose total         | Sum all types for apotheker in week window    |
| Active order filter       | Status + delivery date                        |
| Filtered route stops      | Template stops ∩ active orders (RULE-011/012) |
| Tomorrow preview          | Next-day orders before closing (RULE-013)     |
| Week statistics           | Aggregated orders per vaccine                 |

### Data that must not be stored

| Do not store                                                           | Reason                                                   |
| ---------------------------------------------------------------------- | -------------------------------------------------------- |
| Client-supplied `userId` / `apothekerId` without token binding         | Security pattern from requirements matrix                |
| Passwords (plain)                                                      | Firebase handles credentials                             |
| Other apothekers' orders on bezorger device                            | RULE-010, RULE-014                                       |
| Retroactive order dates                                                | RULE-003                                                 |
| Bear Spray domain entities                                             | Wrong domain                                             |
| Stops for pharmacies without active orders as **mandatory** deliveries | RULE-011 — may store as skipped audit, not as visit stop |

---

## 6. Realtime requirements

Rubric requires realtime with **business logic** and **group-targeted messages** (`description.md` L314–326). Generic CRUD list refresh alone is **rejected**.

| ID         | Behaviour                              | Producer                           | Consumers                   | Payload (conceptual)                             | Filtering                             | Authentication      | User-visible value                                | Required?                                                         |
| ---------- | -------------------------------------- | ---------------------------------- | --------------------------- | ------------------------------------------------ | ------------------------------------- | ------------------- | ------------------------------------------------- | ----------------------------------------------------------------- |
| **RT-001** | New order placed                       | Order service                      | Admin dashboard subscribers | Order id, apotheker, lines, deliveryDate         | Role = admin                          | Bearer + admin role | Admin sees incoming demand without manual refresh | **Inferred** (supports FLOW-010; aligns with exam realtime focus) |
| **RT-002** | Order confirmation + expected delivery | Order service                      | Placing apotheker           | Order id, deliveryDate, expected time message    | `apothekerId` = subscriber's pharmacy | Apotheker auth      | Immediate confirmation (RULE-019/020)             | **Explicit** in fiche (meldingen)                                 |
| **RT-003** | Approaching week-limit warning         | Limit evaluation service           | Apotheker                   | Current week usage, vaccine breakdown, threshold | Own apotheker only                    | Apotheker auth      | Proactive warning before hard block (RULE-021)    | **Explicit** in fiche                                             |
| **RT-004** | Route assigned or regenerated          | Route service                      | Affected bezorger           | Route id, date, stops[], quantities              | `bezorgerId` match                    | Bezorger auth       | Courier sees updated route while on the road      | **Inferred** (mobile ops; strong UX)                              |
| **RT-005** | Order status → _geleverd_              | Status update (admin)              | Apotheker (+ admin)         | Order id, new status                             | Owner apotheker + admin               | Role-based          | History updates without reload                    | **Inferred** (status tracking)                                    |
| **RT-006** | Low stock warning                      | Stock service                      | Admin                       | Vaccine id, current qty, threshold               | Admin only                            | Admin auth          | Operations can react before stockout (RULE-018)   | **Explicit** in fiche                                             |
| **RT-007** | Tomorrow route preview shift           | Order service (pre-closing orders) | Bezorger                    | Preview stops for next day                       | Own bezorger preview                  | Bezorger auth       | Planning ahead after new orders                   | **Inferred** (FLOW-013)                                           |

### Rejected (insufficient value)

| Pattern                                              | Why rejected                              |
| ---------------------------------------------------- | ----------------------------------------- |
| Subscribe to all orders globally without role filter | Violates privacy; "schoolse" broadcast    |
| Generic `ordersUpdated` that only refetches lists    | No business semantics; rubric L318–321    |
| Realtime stock tick for apotheker                    | Not in fiche; apotheker has no stock view |
| Map position streaming                               | Not in fiche                              |

---

## 7. PWA-specific value

| Capability                                      | Domain value                                                              | Mandatory / optional                                              | Evidence                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------- |
| **Installability**                              | Bezorger can install "mobiele app" on phone for field use                 | Optional enhancement (strong fit)                                 | `project-fiche.md` L41; presentation L186 |
| **Fullscreen launch**                           | Distraction-free courier and pharmacy UI                                  | **Mandatory** (checklist)                                         | `description.md` L124                     |
| **Correct PWA setup + relevant service worker** | Offline resilience for couriers; caching shell                            | **Mandatory**                                                     | `description.md` L124–125; penalty L496   |
| **Offline shell**                               | Bezorger can open today's route when connectivity drops mid-round         | Optional enhancement (high value for L41 "Mobiele app")           | Inferred from mobile context              |
| **Cached reference data**                       | Today's route stops, addresses, quantities cached after first load        | Optional enhancement                                              | FLOW-012 field use                        |
| **Queued actions**                              | Queue delivery status updates offline                                     | Optional (actor for status update unclear)                        | Not in fiche                              |
| **Push-style UX**                               | Week-limit, route change, low-stock alerts via subscriptions/in-app toast | **Mandatory realtime UX** at exam level; native push not required | `description.md` L20, L314–326            |
| **Mobile context**                              | Responsive route views, touch-friendly stop list for bezorger             | **Mandatory** for usable bezorger flows (rubric UX)               | `project-fiche.md` L41–48                 |

### Presentation narrative (required to articulate)

> _"Wat kan je PWA specifiek die de probleemstelling voor de opdracht oplost?"_ — `description.md` L186

Defensible answer: PWA gives bezorgers an installable, fullscreen mobile client with cached today's route and live route/status updates—without building a native app.

---

## 8. Authorization matrix

Roles: **Apotheker**, **Bezorger**, **Administrator** (admin). Anonymous = unauthenticated.

| Operation                          | Anonymous | Apotheker | Bezorger        | Administrator | Ownership condition               | Backend enforcement               | Frontend visibility    |
| ---------------------------------- | --------- | --------- | --------------- | ------------- | --------------------------------- | --------------------------------- | ---------------------- |
| Register / login                   | Allow     | —         | —               | —             | —                                 | Firebase Auth                     | Auth routes            |
| Place order                        | Deny      | Allow     | Deny            | Deny          | `order.apothekerId = currentUser` | Auth guard + role + limit service | Apotheker order form   |
| View own order history             | Deny      | Allow     | Deny            | Deny          | Own apotheker only                | Ownership guard on query          | Apotheker history view |
| View own week usage                | Deny      | Allow     | Deny            | Deny          | Own apotheker only                | Scoped aggregation                | Apotheker dashboard    |
| View other apotheker orders        | Deny      | Deny      | Deny            | Allow         | Admin operational need            | Admin role guard                  | Admin daily overview   |
| Create route template              | Deny      | Deny      | Deny            | Allow         | —                                 | `@AllowedRoles(admin)`            | Admin route management |
| Link template to bezorger          | Deny      | Deny      | Deny            | Allow         | —                                 | Admin role guard                  | Admin assignment UI    |
| Generate daily planning            | Deny      | Deny      | Deny            | Allow         | —                                 | Admin role guard                  | Admin planning action  |
| Assign route to bezorger           | Deny      | Deny      | Deny            | Allow         | —                                 | Admin role guard                  | Admin route board      |
| View stock                         | Deny      | Deny      | Deny            | Allow         | —                                 | Admin role guard                  | Admin stock screen     |
| Add / purchase stock               | Deny      | Deny      | Deny            | Allow         | —                                 | Admin mutation guard              | Admin stock form       |
| View daily overview all apothekers | Deny      | Deny      | Deny            | Allow         | —                                 | Admin role guard                  | Admin dashboard        |
| Update delivery status             | Deny      | Deny      | Deny (inferred) | Allow         | Admin fulfilment                  | Admin mutation; **actor unclear** | Admin status control   |
| View own today route               | Deny      | Deny      | Allow           | Deny          | `route.bezorgerId = currentUser`  | Ownership guard                   | Bezorger today view    |
| View own tomorrow preview          | Deny      | Deny      | Allow           | Deny          | Own preview                       | Ownership guard                   | Bezorger tomorrow view |
| View other bezorger routes         | Deny      | Deny      | Deny            | Deny          | RULE-014                          | 403 Forbidden                     | Hidden                 |
| Access admin screens               | Deny      | Deny      | Deny            | Allow         | —                                 | Role guard                        | Admin layout           |
| Access apotheker screens           | Deny      | Allow     | Deny            | Deny          | —                                 | Role guard                        | Apotheker layout       |
| Access bezorger screens            | Deny      | Deny      | Allow           | Deny          | —                                 | Role guard                        | Bezorger layout        |
| Subscribe to admin order feed      | Deny      | Deny      | Deny            | Allow         | Admin role                        | Subscription auth filter          | Admin realtime panel   |
| Subscribe to own notifications     | Deny      | Allow     | Allow           | Allow         | Self only                         | User id filter                    | In-app toast/badge     |

---

## 9. Seed scenarios

| Scenario                             | Purpose           | Seed contents                                                                                                                   |
| ------------------------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Happy path — apotheker**           | FLOW-001 demo     | Apotheker account; 3 vaccine types; order under all limits before closing; statuses mixed _in behandeling_ / _geleverd_         |
| **Happy path — admin**               | FLOW-006–011 demo | `docent@howest.be` admin (`description.md` L71); templates; generated today route; stock at healthy levels; daily overview data |
| **Happy path — bezorger**            | FLOW-012–013 demo | Bezorger linked to chauffeursprofiel; assigned today route with 2–3 stops; tomorrow preview with pre-closing orders             |
| **Empty — new apotheker**            | UX edge           | Apotheker with zero orders; empty history; zero week usage                                                                      |
| **Empty — route**                    | RULE-011 demo     | Template includes 5 pharmacies but only 2 ordered → route shows 2 stops                                                         |
| **Permission — cross role**          | Authz tests       | Accounts for all 3 roles; bezorger B must not see bezorger A route                                                              |
| **Permission — apotheker isolation** | RULE-010          | Two apothekers with orders; each sees only own data                                                                             |
| **Validation — daily limit**         | RULE-005          | Apotheker at 48 doses type A; seed enables 50-pass and 51-fail demo                                                             |
| **Validation — weekly limit**        | RULE-006          | Apotheker at 195 weekly doses; next order 5 passes, 6 fails                                                                     |
| **Validation — retroactive**         | RULE-003          | No seed orders in past; demo mutation rejection live                                                                            |
| **Edge — closing time**              | RULE-001/002      | Configured closing time; one order 1 min before, one 1 min after                                                                |
| **Edge — week-limit warning**        | RULE-021          | Apotheker at ~90% weekly usage (threshold assumed)                                                                              |
| **Edge — low stock**                 | RULE-018          | One vaccine below warning threshold                                                                                             |
| **Edge — skipped pharmacy**          | RULE-011          | Pharmacy on template with no active order                                                                                       |
| **Realtime demo**                    | RT-001–007        | Admin + apotheker + bezorger sessions; placing order updates admin; route assign updates bezorger                               |
| **Presentation accounts**            | Exam eval         | `docent@howest.be` / `P@ssword123` as admin; at least one apotheker and one bezorger with known passwords in README             |

---

## 10. Ambiguities

| Question                                                                                             | Why it matters                | Safe provisional assumption                                                         | Needs teacher clarification | Blocks architecture    |
| ---------------------------------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------- | --------------------------- | ---------------------- |
| What is the exact **sluitingstijd** (time, timezone)?                                                | RULE-001/002/013 depend on it | Configurable; seed `14:00` `Europe/Brussels`                                        | Yes                         | **No** — policy config |
| What does **"weerk"** mean (calendar week vs rolling 7 days)?                                        | RULE-006 aggregation window   | ISO calendar week (Monday–Sunday)                                                   | Yes                         | **No** — policy config |
| What is **"naderende weeklimiet"** threshold?                                                        | RULE-021 warning trigger      | Configurable; initial **90%**                                                       | Yes                         | No                     |
| How to reconcile _"Bestelling geld voor levering die dag"_ (L17) with after-closing → next day (L7)? | Order date semantics          | Delivery day computed from closing rules; L17 = order targets computed delivery day | Yes                         | No                     |
| Who marks order **geleverd** — admin or bezorger?                                                    | FLOW-014 actor                | Admin initially; mutation design allows bezorger later                              | Yes                         | No                     |
| When is **stock** decremented?                                                                       | Stock consistency             | On _geleverd_, not on submit                                                        | Yes                         | No                     |
| What is **low stock** threshold?                                                                     | RULE-018                      | Configurable per vaccine type                                                       | Yes                         | No                     |
| Are **vaccine types** fixed enum or admin-configurable beyond 3?                                     | Catalog management            | Fixed 3 types in seed                                                               | Yes                         | No                     |
| Does **apotheker** need a registered pharmacy **address** entity for routing?                        | Route stops need adres        | Apotheker profile includes address                                                  | Yes                         | No                     |
| One PWA or separate apps per role?                                                                   | Frontend architecture         | **One Vue PWA**; role-specific route groups                                         | Optional                    | No                     |
| Is **PKCE** required with Firebase email/password?                                                   | Auth implementation           | **Email/password without PKCE** unless OAuth provider added or teacher requires     | Optional                    | No                     |
| **Auto-seed on API boot** vs manual CLI at presentation?                                             | Docker/init design            | Documented idempotent `seed` command; manual at demo                                | Optional                    | No                     |
| Can admin **edit/cancel** orders after submit?                                                       | Mutation set                  | No cancel unless teacher confirms; status read-only except delivery                 | Yes                         | No                     |
| **Team vs individual** project (`description.md` L30 vs L38)?                                        | Dossier work-split            | Individual submission; solo implementation                                          | Yes                         | No                     |

---

## 11. Scope boundaries

### Mandatory MVP (must demonstrate)

- All three roles with separate screens and data scoping (RULE-010).
- Order placement with closing-time logic, limits, and block-on-exceed (FLOW-001, RULE-001–007).
- Order history, statuses, week usage (FLOW-002).
- Apotheker notifications: confirmation, delivery time, week-limit warning (FLOW-003).
- Admin route templates, template–bezorger link, daily generation with skip-without-order (FLOW-004–007, RULE-011).
- Admin stock view/add and low-stock warning (FLOW-008–009).
- Admin daily overview, delivery tracking, weekly stats (FLOW-010–011).
- Bezorger today route and tomorrow preview (FLOW-012–013, RULE-012–014).
- Technical exam baseline from `description.md`: NestJS GraphQL, MongoDB, Firebase auth (≥2 roles + `docent@howest.be`), Docker, PWA + service worker, realtime with business value, tests, seed, README.

### High-value quality improvements (not always explicit line items)

- Full backend ownership checks on every query/mutation (rubric authz 7+).
- GraphQL subscriptions with role-filtered payloads (RT-001–007).
- Limit and route-generation unit/integration tests (rubric testing bands).
- Loading states, form validation, a11y (frontend checklist + rubric).
- Idempotent seed covering §9 scenarios including edge cases for presentation.

### Optional bonus features

- Runtime i18n (`description.md` L126–127).
- Native push notifications, background sync, offline queue.
- External hosting, Kubernetes, Sentry, Vitest unit tests, dark mode, view-transitions.
- Map/navigation integration (not in fiche).
- Hardware/AI integrations (`description.md` L101–104).

### Functionality that should not be built

- Bear Spray domain (machines, canisters, reservations, Mapbox, weather).
- Retroactive ordering (RULE-003).
- Mandatory route stops for pharmacies **without** active orders.
- Cross-bezorger route visibility.
- Generic realtime that only refetches unparsed lists.
- Copying teacher defects (disabled PWA, incomplete authz, client-supplied user ids).
- Proof-of-concept CRUD without limit logic, route filtering, or role separation.

---

## 12. Readiness decision

### **Ready for architecture design**

### Rationale

The project fiche plus assignment checklists define **clear actors**, **non-trivial business rules**, **fourteen identifiable workflows**, **realtime candidates tied to notifications and operations**, and **PWA value for the bezorger mobile context**. Combined with course material and the read-only teacher reference (patterns only), this is the **complete available source set** for designing a from-scratch implementation in `examAfsdMaciejMitura/`.

Domain open questions use **configurable policies** with documented provisional defaults (see top of this document); they do **not** block architecture.

### Readiness by stage

| Stage                            | Status                                        |
| -------------------------------- | --------------------------------------------- |
| Domain analysis                  | **Complete**                                  |
| Requirements analysis            | **Complete**                                  |
| Ready for architecture design    | **Yes**                                       |
| Ready for implementation roadmap | **After architecture approval**               |
| Ready for project initialization | **After architecture and roadmap approval**   |
| Ready for feature implementation | **After repository scaffold and agent rules** |

### Teacher clarification still useful (non-blocking)

- Exact closing time if different from seeded `14:00`
- ISO week vs rolling week if teacher intends different semantics
- Whether bezorger should mark deliveries in a later iteration
- PKCE only if teacher explicitly requires it beyond Firebase email/password
- Team vs individual dossier wording

### Gated next steps (not architecture blockers)

- **Implementation roadmap** — after architecture document is approved
- **Repository initialization** — after architecture and roadmap approval; greenfield in `examAfsdMaciejMitura/`
- **Feature coding** — after scaffold, dependencies, and project `AGENTS.md` / agent rules exist

---

_Updated 2026-07-14: greenfield build in `examAfsdMaciejMitura/`; no starter project. Generated from `project-fiche.md` primary wording._
