# Kommentierung des Repositories - Fortschrittsplan

> Ziel: Jede Datei im Repository so kommentieren, dass bei jedem Befehl/Funktion klar ist, was er tut.
> Vorgehen: Pro Durchgang werden **max. 10 Dateien** bearbeitet.

---

## Batch 1 — Backend Services (Members, Events, Dispatch, Accounting, Shared) ✅
- [x] `docker/backend-members/src/index.js`
- [x] `docker/backend-members/src/auth-middleware.js`
- [x] `docker/backend-events/src/index.js`
- [x] `docker/backend-events/src/auth-middleware.js`
- [x] `docker/backend-dispatch/src/index.js`
- [x] `docker/backend-dispatch/src/auth-middleware.js`
- [x] `docker/backend-accounting/src/index.js`
- [x] `docker/shared/auth-middleware.js`
- [x] `docker/docker-compose.yml`
- [x] `docker/docker-compose.prod.yml`

---

## Batch 2 — Datenbank: Schema & Migrationen (Teil 1) ✅
- [x] `docker/postgres/init.sql`
- [x] `docker/postgres/migrations/002_authentik_sync_and_notifications.sql`
- [x] `docker/postgres/migrations/002_member_registrations.sql`
- [x] `docker/postgres/migrations/003_vorstand_auth.sql`
- [x] `docker/postgres/migrations/004_shifts_bereich.sql`
- [x] `docker/postgres/migrations/005_dispatch_templates.sql`
- [x] `docker/postgres/migrations/006_event_organizer_access.sql`
- [x] `docker/postgres/migrations/007_arbeitsplan_tracking.sql`
- [x] `docker/postgres/migrations/008_member_deletion_requests.sql`
- [x] `docker/postgres/migrations/009_event_groups.sql`

---

## Batch 3 — Datenbank: Migrationen (Teil 2) + Cron + Nginx + Config ✅
- [x] `docker/postgres/migrations/010_shift_reminders.sql`
- [x] `docker/postgres/migrations/011_farewell_templates.sql`
- [x] `docker/postgres/migrations/012_pdf_templates.sql`
- [x] `docker/postgres/migrations/013_pdf_template_categories.sql`
- [x] `docker/postgres/migrations/014_shared_mailbox_passwords.sql`
- [x] `docker/postgres/migrations/015_contact_confirmations.sql`
- [x] `docker/postgres/migrations/016_audit_trigger.sql`
- [x] `docker/cron/shift-reminders.sh`
- [x] `docker/frontend-website/nginx.conf`
- [x] `docker/frontend-website/scripts/config.js`

---

## Batch 4 — Frontend Website (Teil 1) ✅
- [x] `docker/frontend-website/index.html`
- [x] `docker/frontend-website/auth-callback.html`
- [x] `docker/frontend-website/apps.html`
- [x] `docker/frontend-website/calendar.html`
- [x] `docker/frontend-website/menu-fasnacht.html`
- [x] `docker/frontend-website/event-dashboard.html`
- [x] `docker/frontend-website/events.html`
- [x] `docker/frontend-website/mein.html`

---

## Batch 5 — Frontend Website (Teil 2: Vorstand Dashboard) ✅
- [x] `docker/frontend-website/vorstand.html` (sehr gross, ~7000 Zeilen — 15 HTML-Sektionen + 131 JS-Funktionen kommentiert)

---

## Batch 6 — Legacy API (Routes & Server) ✅
- [x] `api/src/server.js`
- [x] `api/src/routes/auth.js`
- [x] `api/src/routes/members.js`
- [x] `api/src/routes/events.js`
- [x] `api/src/routes/newsletter.js`
- [x] `api/src/routes/calendar.js`
- [x] `api/src/routes/contact.js`
- [x] `api/src/utils/database.js`
- [x] `api/src/utils/mailer.js`
- [x] `api/src/utils/otp.js`

---

## Batch 7 — Legacy API (Utils) & Scripts (Teil 1) ✅
- [x] `api/src/utils/otp-sqlite.js`
- [x] `api/src/utils/backup.js`
- [x] `api/src/utils/hybrid-storage.js`
- [x] `api/src/utils/github.js`
- [x] `scripts/config.js`
- [x] `scripts/generate-ics.js`
- [x] `scripts/generate-calendar-pdf.js`
- [x] `scripts/send-event-email.js`
- [x] `scripts/send-event-letter.js`
- [x] `scripts/send-calendar-pingen.js`

---

## Batch 8 — Scripts (Teil 2) & Android App (Grundgerüst + API) ✅
- [x] `scripts/send-letter-via-pingen.js`
- [x] `scripts/sync-mailcow-distribution-list.js`
- [x] `scripts/html-to-pdf.js`
- [x] `scripts/pdf-generator.js`
- [x] `scripts/transform-zustellung.js`
- [x] `vorstand-android/app/build.gradle.kts`
- [x] `vorstand-android/.../MainActivity.kt`
- [x] `vorstand-android/.../VorstandApp.kt`
- [x] `vorstand-android/.../data/api/ApiModule.kt`
- [x] `vorstand-android/.../data/api/AuthInterceptor.kt`

---

## Batch 9 — Android App: API & Models ✅
- [x] `vorstand-android/.../data/api/AuthApi.kt`
- [x] `vorstand-android/.../data/api/MembersApi.kt`
- [x] `vorstand-android/.../data/api/EventsApi.kt`
- [x] `vorstand-android/.../data/api/MemberRegistrationsApi.kt`
- [x] `vorstand-android/.../data/api/AuditApi.kt`
- [x] `vorstand-android/.../data/model/Auth.kt`
- [x] `vorstand-android/.../data/model/Member.kt`
- [x] `vorstand-android/.../data/model/Event.kt`
- [x] `vorstand-android/.../data/model/Shift.kt`
- [x] `vorstand-android/.../data/model/MemberRegistration.kt`

---

## Batch 10 — Android App: Models & UI Login/Members ✅
- [x] `vorstand-android/.../data/model/AuditEntry.kt`
- [x] `vorstand-android/.../ui/login/LoginActivity.kt`
- [x] `vorstand-android/.../ui/login/LoginViewModel.kt`
- [x] `vorstand-android/.../ui/members/MembersListFragment.kt`
- [x] `vorstand-android/.../ui/members/MemberDetailFragment.kt`
- [x] `vorstand-android/.../ui/members/MemberFormFragment.kt`
- [x] `vorstand-android/.../ui/members/MembersAdapter.kt`
- [x] `vorstand-android/.../ui/members/MembersViewModel.kt`
- [x] `vorstand-android/.../ui/events/EventsListFragment.kt`
- [x] `vorstand-android/.../ui/events/EventFormFragment.kt`

---

## Batch 11 — Android App: UI Events & Weitere Screens ✅
- [x] `vorstand-android/.../ui/events/EventRegistrationsFragment.kt`
- [x] `vorstand-android/.../ui/events/EventsAdapter.kt`
- [x] `vorstand-android/.../ui/events/ShiftRegistrationsAdapter.kt`
- [x] `vorstand-android/.../ui/events/EventsViewModel.kt`
- [x] `vorstand-android/.../ui/dispatch/DispatchFragment.kt`
- [x] `vorstand-android/.../ui/audit/AuditFragment.kt`
- [x] `vorstand-android/.../ui/audit/AuditAdapter.kt`
- [x] `vorstand-android/.../ui/registrations/RegistrationsFragment.kt`
- [x] `vorstand-android/.../ui/registrations/RegistrationsAdapter.kt`
- [x] `vorstand-android/.../ui/admin/AdminFragment.kt`

---

## Batch 12 — Android App: Restliche UI & Utilities ✅
- [x] `vorstand-android/.../ui/more/MoreFragment.kt`
- [x] `vorstand-android/.../util/DateUtils.kt`
- [x] `vorstand-android/.../util/TokenManager.kt`
- [x] `vorstand-android/.../util/NotificationHelper.kt`
- [x] `vorstand-android/.../util/AuditNotificationWorker.kt`
- [x] `vorstand-android/.../util/UpdateChecker.kt`

---

## Batch 13 — Simple Order System ✅
- [x] `simple-order-system/backend/src/index.ts`
- [x] `simple-order-system/backend/src/auth.ts`
- [x] `simple-order-system/backend/src/terminal.ts`
- [x] `simple-order-system/backend/src/payments.ts`
- [x] `simple-order-system/frontend/src/App.tsx`
- [x] `simple-order-system/frontend/src/main.tsx`
- [x] `simple-order-system/kitchen-display/src/App.tsx`
- [x] `simple-order-system/kitchen-display/src/main.tsx`
- [x] `simple-order-system/register-app/index.html`

---

## Batch 14 — Simple Inventory System & CI/CD ✅
- [x] `simple-inventory-system/backend/src/index.ts`
- [x] `simple-inventory-system/backend/src/auth.ts`
- [x] `simple-inventory-system/backend/src/qrcode.ts`
- [x] `simple-inventory-system/frontend/src/App.tsx`
- [x] `simple-inventory-system/frontend/src/main.tsx`
- [x] `.github/workflows/build-containers.yml`
- [x] `.github/workflows/build-android-vorstand.yml`
- [x] `.github/workflows/build-android-kds.yml`

---

## Legende
- [ ] = Noch nicht kommentiert
- [x] = Kommentiert und abgeschlossen

## Fortschritt
| Batch | Status | Dateien |
|-------|--------|---------|
| 1  — Backend Services           | Erledigt ✅ | 10/10 |
| 2  — DB Migrationen Teil 1      | Erledigt ✅ | 10/10 |
| 3  — DB Migrationen Teil 2      | Erledigt ✅ | 10/10 |
| 4  — Frontend Teil 1            | Erledigt ✅ | 8/8  |
| 5  — Frontend Vorstand          | Erledigt ✅ | 1/1  |
| 6  — Legacy API Routes          | Erledigt ✅ | 10/10 |
| 7  — Legacy API Utils & Scripts | Erledigt ✅ | 10/10 |
| 8  — Scripts & Android Basis    | Erledigt ✅ | 10/10 |
| 9  — Android API & Models       | Erledigt ✅ | 10/10 |
| 10 — Android UI Login/Members   | Erledigt ✅ | 10/10 |
| 11 — Android UI Events/Screens  | Erledigt ✅ | 10/10 |
| 12 — Android Utilities          | Erledigt ✅ | 6/6  |
| 13 — Order System               | Erledigt ✅ | 9/9  |
| 14 — Inventory & CI/CD          | Erledigt ✅ | 8/8  |
| 15 — Android MassPdf Feature    | Erledigt ✅ | 3/3  |
| **Total**                       |        | **125/125** |

---

## Batch 15 — Android MassPdf Feature (Phase 7) ✅
- [x] `vorstand-android/.../ui/masspdf/MassPdfFragment.kt`
- [x] `vorstand-android/.../ui/masspdf/MassPdfViewModel.kt`
- [x] `vorstand-android/.../ui/masspdf/MassPdfMemberAdapter.kt`
