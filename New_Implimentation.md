# New Implementation Roadmap

## Purpose

This roadmap turns the original church management platform ideas into a practical build order for the current Chorister TimeTable app. Priorities are based on three things:

- How well the task fits the existing FastAPI, SQLite/PostgreSQL, static HTML/CSS/JavaScript app.
- How much value it gives to admins, reviewers, choristers, and church leaders.
- How much new architecture, integration work, or product infrastructure it requires.

The goal is to build useful improvements first, while keeping larger AI, mobile, messaging, and SaaS ideas clearly marked as future platform work.

---

## Easy / Quick Wins

These tasks mostly extend features the project already has: rosters, ratings, choristers, analytics, authentication, and static frontend pages.

### 1. Improve Feedback & Performance Evaluation

- Expand the existing ratings feature from one simple rating into structured categories:
  - On key: 1-5
  - Audience engagement: 1-5
  - Stage management: 1-5
  - Sync with instrumentalists and BGV: 1-5
  - Written feedback
- Link feedback to an existing service date, role, and chorister.
- Show clearer feedback history on the admin side.
- Let choristers view their own feedback in the existing chorister portal.

Why this priority? The app already has performance ratings, service rosters, admin login, and chorister login. This is an enhancement of existing behavior, not a brand-new system.

### 2. Basic Analytics Improvements

- Add average score summaries by chorister.
- Show strongest and weakest feedback categories.
- Add simple trend views by month.
- Highlight most improved choristers.
- Add a basic leadership summary section.

Why this priority? The project already has analytics endpoints and frontend analytics pages. These improvements can build on the current data flow once feedback categories exist.

### 3. Roster / Workforce Improvements

- Improve role assignment visibility for choir and workers.
- Add clearer filters for month, role, and chorister.
- Link roster entries more directly to feedback and attendance/performance history.
- Add lightweight labels for worker/member types if needed.

Why this priority? The app already centers around choir roster management, so small improvements here create immediate day-to-day value.

### 4. Manual Data Entry Cleanup

- Add cleaner admin forms for basic member/chorister details.
- Keep manual entry as the first supported input method.
- Improve validation messages and empty states.
- Prepare field names so later registration forms and imports can reuse them.

Why this priority? Manual admin entry is simpler than QR forms, CSV uploads, or external integrations, and it prepares the app for later CRM features.

### 5. Simple Reports / Exports

- Add basic CSV export for feedback summaries.
- Add printable leadership summaries.
- Keep report generation simple before adding formatted PDFs or automated emailing.

Why this priority? Exporting existing data is useful and relatively contained compared with building notification or automation systems.

---

## Medium Effort

These tasks are valuable next steps, but they need new database tables, new pages/forms, more permissions, or integration with outside services.

### 1. First-Timer Registration System

- Add a mobile-friendly registration form.
- Collect:
  - Name
  - Contact information
  - Date of birth
  - Interests or departments
- Add tags such as:
  - First-timer
  - Worker
  - New convert
  - Member
- Add a QR code that opens the registration form.

Why this priority? This moves the project beyond choir management into church CRM. It is very useful, but it introduces new data models and public-facing forms.

### 2. Email Notification System

- Send service reminders.
- Send feedback reminders.
- Send follow-up reminders.
- Send birthday messages later after DOB fields exist.
- Start with email before WhatsApp because email is usually simpler and cheaper to integrate.

Why this priority? Notifications are useful, but they require provider setup, background jobs, templates, delivery error handling, and opt-out decisions.

### 3. Training & Insights Engine

- Identify common weak areas from structured feedback.
- Recommend monthly training focus areas.
- Show consistently low-scoring categories.
- Show strongest performers and most improved performers.
- Generate leadership report summaries.

Why this priority? This depends on having richer structured feedback first. Once that data exists, insights become practical.

### 4. CSV Import / Bulk Upload

- Support CSV upload for members, choristers, or first-timers.
- Validate rows before saving.
- Show import errors clearly.
- Avoid duplicate records where possible.

Why this priority? Bulk upload saves admin time, but it requires careful validation and duplicate handling.

### 5. Role-Based Access

- Expand beyond shared admin and chorister PIN login.
- Add roles such as:
  - Admin
  - Reviewer
  - Member
- Restrict review, reporting, and management actions by role.

Why this priority? The current authentication model is intentionally simple. More roles are useful, but they affect many pages and endpoints.

---

## Time-Consuming / Future Platform Work

These ideas are larger product initiatives. They should wait until the core CRM, feedback, analytics, and notification foundations are stable.

### 1. WhatsApp Integration

- Send WhatsApp service reminders.
- Send follow-up messages.
- Send birthday messages.
- Track delivery failures or manual follow-up needs.

Why this is time-consuming? WhatsApp APIs require provider setup, message templates, compliance review, cost planning, and careful handling of user consent.

### 2. AI-Powered Follow-Up System

- Generate follow-up messages for:
  - First-time visitors
  - New converts
  - Members
- Support scheduled messages:
  - Saturday reminders
  - Sunday post-service messages
  - Monday check-ins
- Personalize messages by name, group, and context.
- Allow tone customization and message variation.

Why this is time-consuming? AI follow-up needs strong data quality, approval workflows, prompt templates, safety rules, message history, and integration with email or WhatsApp delivery.

### 3. Persona-Based Messaging Bot

- Create message templates that represent specific ministry personas.
- Vary messages using AI.
- Schedule or trigger messages automatically.
- Clearly disclose when automation or AI-generated messaging is being used.

Why this is time-consuming? Persona messaging has trust, consent, transparency, and pastoral tone concerns. It should be designed carefully after basic messaging works.

### 4. Mobile App / PWA

- Build a PWA or dedicated mobile app.
- Add user profiles.
- Add push notifications.
- Sync with the backend.

Why this is time-consuming? A mobile app introduces a second client experience, push notification infrastructure, app packaging, and long-term maintenance.

### 5. Full Church CRM

- Manage first-timers, members, new converts, workers, and departments.
- Add a centralized member database.
- Track engagement history.
- Connect member profiles to follow-ups, birthdays, training, rosters, and reports.

Why this is time-consuming? This changes the product from a choir timetable app into a broader church management platform.

### 6. SaaS Productization

- Add multi-tenant church accounts.
- Add custom branding per church.
- Add subscriptions and billing.
- Add onboarding flows.
- Add tenant-level permissions and data isolation.

Why this is time-consuming? SaaS requires major architecture changes, tenant isolation, billing, operational support, onboarding, and production-grade security practices.

---

## Recommended Build Order

### Phase 1: Current-App MVP Improvements

- Improve feedback/performance evaluation.
- Add structured rating categories.
- Improve basic analytics and reports.
- Make feedback visible to the right chorister/admin users.

### Phase 2: Basic Church CRM Foundation

- Add first-timer/member registration.
- Add QR-code access for registration.
- Add member tags and basic profile fields.
- Add CSV export/import where it saves admin time.

### Phase 3: Communication & Automation

- Add email reminders first.
- Add birthday reminders and event reminders.
- Add follow-up workflows with manual approval.
- Add WhatsApp only after message templates and consent rules are clear.

### Phase 4: AI, Mobile, and Product Platform

- Add AI message drafts and tone variation.
- Add AI-powered insight summaries.
- Add PWA or mobile app capability.
- Consider SaaS architecture only after the single-church version is stable.

---

## Original Feature Areas Covered

- Feedback and performance evaluation: covered in Easy / Quick Wins.
- Notifications and reminders: covered in Medium Effort and Future Platform Work.
- Mobile app capability: covered in Future Platform Work.
- AI-powered follow-up: covered in Future Platform Work.
- First-timer registration: covered in Medium Effort.
- Birthday and event automation: covered in Medium Effort and Phase 3.
- Workforce / roster management: covered in Easy / Quick Wins.
- Training and insights engine: covered in Medium Effort.
- Persona-based messaging bots: covered in Future Platform Work.
- Website integrations: covered across Email, WhatsApp, and Role-Based Access.
- SaaS productization: covered in Future Platform Work.
- AI strategy layer: covered in Future Platform Work.
- Data collection and input methods: covered in Easy / Quick Wins and Medium Effort.

---

## Cost / Complexity Notes

- MVP improvements are mostly internal app work and should be the lowest-cost path.
- Mid-level improvements become more expensive because they add new data models, forms, email infrastructure, imports, and permissions.
- Full platform work is the largest investment because it requires AI workflows, mobile/push infrastructure, WhatsApp compliance, multi-tenant SaaS architecture, billing, and long-term operations.

