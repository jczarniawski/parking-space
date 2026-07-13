# MT Parking — office parking booking

A small web app for booking office parking spots at Match-Trade. Employees
grab a free spot for today or the next two business days; management members
have personally reserved spots they can release for days they won't need
them; admins configure everything and see the full history.

Sign-in is restricted to `@match-trade.com` Google accounts.

## Features

- **Availability board** — a per-day grid of all active spots showing who
  booked what, with one-tap booking and cancellation.
- **Booking window** — today plus the next 2 business days; weekends are
  never bookable. One spot per person per day, enforced by the database.
- **Reserved (management) spots** — auto-prebooked for their owner on
  configured weekdays. Owners can release a day (making the spot bookable by
  anyone) up to 60 days ahead, and reclaim it while nobody has booked it.
- **Admin area** — first-run setup wizard, spot management
  (activate/deactivate, assign owners and prebook weekdays), user role
  management, all bookings with filters and CSV export, and an audit log of
  every action.
- **Mobile-first PWA** — works well at phone widths and can be added to the
  home screen as an app.

## Stack

- [Next.js 15](https://nextjs.org/) (App Router, React 19, server components)
- TypeScript (strict), Tailwind CSS v3
- [next-auth v5](https://authjs.dev/) with Google sign-in (JWT sessions)
- [Prisma](https://www.prisma.io/) + SQLite locally (PostgreSQL in production)
- Vitest for unit tests

## Local development

```bash
cp .env.example .env
# 1. Generate a secret and put it in AUTH_SECRET:
#    openssl rand -base64 32
# 2. (Optional for a quick look) enable the dev login instead of Google:
#    AUTH_DEV_LOGIN="true"

npm install        # also runs `prisma generate`
npm run db:push    # create the SQLite database (prisma/dev.db)
npm run dev        # http://localhost:3000
```

With `AUTH_DEV_LOGIN="true"` the login page shows an extra email field: enter
any `@match-trade.com` address to sign in as that user without Google
credentials. Never enable this in production.

Other scripts:

```bash
npm test            # vitest unit tests (dates + spot-spec parser, no DB needed)
npm run typecheck   # tsc --noEmit
npm run db:studio   # Prisma Studio to inspect the local database
```

## Google OAuth setup

1. In the [Google Cloud Console](https://console.cloud.google.com/), create
   (or pick) a project and open **APIs & Services → OAuth consent screen**.
   Choose the **Internal** user type — this restricts sign-in to accounts in
   your Google Workspace organization at Google's side.
2. Under **APIs & Services → Credentials**, create an **OAuth client ID** of
   type **Web application**.
3. Add the authorized redirect URI:
   - local dev: `http://localhost:3000/api/auth/callback/google`
   - production: `https://<your-domain>/api/auth/callback/google`
4. Copy the client ID and secret into `.env` as `AUTH_GOOGLE_ID` and
   `AUTH_GOOGLE_SECRET`.

Note: the app also enforces the email domain itself (`ALLOWED_EMAIL_DOMAIN`,
default `match-trade.com`) in the sign-in callback, so even if the consent
screen is external or the `hd` hint is bypassed, non-company accounts are
rejected server-side.

## First run

1. The **first user ever to sign in becomes an ADMIN** (additionally, any
   email listed in `ADMIN_EMAILS` is promoted to admin on sign-in).
2. While no parking spots exist, admins landing on the dashboard are
   redirected to **/admin/setup**: enter the spot numbers (e.g. `1-24` or
   `1-10, 12, A1`), then optionally assign reserved spots to management
   members by email and pick their prebook weekdays.
3. Done — everyone else who signs in can book right away.

## Roles

| Role         | What they can do                                                                                    |
| ------------ | --------------------------------------------------------------------------------------------------- |
| `EMPLOYEE`   | Book a free spot within the window, cancel their own upcoming bookings.                              |
| `MANAGEMENT` | Everything an employee can, plus a personally reserved spot: release it for specific days, reclaim it while unbooked. |
| `ADMIN`      | Everything above, plus spot/user administration, all bookings + CSV export, audit log.               |

Roles are managed in **Admin → Users**. Assigning a reserved spot to an
employee automatically promotes them to `MANAGEMENT`; owners assigned by
email before their first sign-in are pre-provisioned and linked when they
first log in.

## Booking rules

- Bookable days: **today + the next 2 business days**; weekends never.
  (E.g. on Friday you can book Friday, Monday and Tuesday; on Saturday only
  Monday and Tuesday.) "Today" rolls over at midnight in the office timezone
  (`OFFICE_TIMEZONE`, default `Europe/Warsaw`).
- **One spot per person per day** and one booking per spot per day — enforced
  by database unique constraints, so races resolve safely.
- Bookings can be cancelled by their owner (or an admin) up to and including
  the booked day; past bookings are kept as history.
- Reserved spots appear as *Reserved* on their prebook weekdays and can't be
  booked unless the owner has released that day. Owners release up to
  60 days ahead and can reclaim a released day only while nobody has booked
  it. Owners with an active reservation that day must release it before
  booking a different spot.
- Every create/cancel/release/reclaim and all admin actions are written to
  the audit log.

## Mobile / PWA

The app ships a web manifest (`MT Parking`, standalone display, brand-blue
theme) and a mobile-first layout tested down to 375 px wide. Open the site on
your phone and use **Add to Home Screen** (iOS Safari share menu, or the
install prompt in Chrome on Android) to get an app-like, full-screen
experience.

## Production notes

1. Switch the datasource provider in `prisma/schema.prisma` from `sqlite` to
   `postgresql` (the schema is compatible) and point `DATABASE_URL` at your
   database, then run `npm run db:push` (or set up Prisma migrations) against
   it.
2. Set the environment variables: `DATABASE_URL`, `AUTH_SECRET`,
   `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `ALLOWED_EMAIL_DOMAIN`,
   `OFFICE_TIMEZONE`, optionally `ADMIN_EMAILS`, and `AUTH_URL` set to your
   canonical `https://` origin when running behind a proxy. Make sure
   `AUTH_DEV_LOGIN` is unset or `"false"`.
3. Build and run:

   ```bash
   npm run build   # runs prisma generate + next build
   npm start
   ```

## Project structure

```
parking-space/
├── prisma/
│   └── schema.prisma            # User, ParkingSpot, Booking, SpotRelease, AuditLog
├── public/icon.svg              # PWA / favicon icon
├── src/
│   ├── app/
│   │   ├── page.tsx             # dashboard: date chips + availability board
│   │   ├── login/               # Google (and optional dev) sign-in
│   │   ├── my-bookings/         # upcoming + past bookings
│   │   ├── admin/               # overview, spots, users, bookings, audit, setup
│   │   ├── api/                 # availability, bookings, releases, admin/*, auth
│   │   └── manifest.ts          # PWA manifest
│   ├── components/              # booking-board, nav, releases-panel, admin/*, ui
│   ├── lib/
│   │   ├── dates.ts             # business-day / booking-window logic (pure)
│   │   ├── spot-spec.ts         # "1-10, 12, A1" spot-spec parser (pure)
│   │   ├── errors.ts            # typed ApiError + helpers
│   │   ├── db.ts                # Prisma client singleton
│   │   ├── audit.ts             # audit-log writer
│   │   └── services/            # bookings, spots, admin (all DB access)
│   ├── auth.ts                  # next-auth v5 config (domain guard, roles)
│   └── lib/__tests__/           # vitest unit tests (no database required)
├── vitest.config.ts
└── tailwind.config.ts           # custom `brand` blue scale
```
