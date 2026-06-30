# Game Assignment Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a daily, deduplicated notification workflow for upcoming and overdue game assignments.

**Architecture:** `AssignmentService` will select eligible `assigned` game assignments using Istanbul calendar boundaries, send targeted notifications through `NotificationService`, and persist per-notification timestamps. A small `AssignmentCronService` will run the workflow daily and log its result, while `AssignmentModule` wires the notification dependency and cron provider.

**Tech Stack:** NestJS 8, Mongoose 6, `@nestjs/schedule`, Moment Timezone, Jest 27, TypeScript 4.5

---

### Task 1: Define reminder persistence and notification events

**Files:**
- Modify: `src/modules/assignment/assignment.schema.ts`
- Modify: `src/modules/notification/notification.dto.ts`
- Test: `src/modules/assignment/assignment.schema.spec.ts`

- [ ] **Step 1: Write the failing schema test**

Create a Jest test that builds `AssignmentSchema` paths and expects
`fiveDayReminderSentAt`, `oneDayReminderSentAt`, and `managerInformedAt` to
have the Mongoose `Date` instance type.

- [ ] **Step 2: Run the schema test to verify it fails**

Run:

```bash
yarn test assignment.schema.spec.ts --runInBand
```

Expected: FAIL because the three schema paths do not exist.

- [ ] **Step 3: Add the schema timestamps and event constants**

Add optional `Date` properties using `@Prop({ type: Date })` and add
`GAMEASSIGNMENTREMINDER` plus `GAMEASSIGNMENTOVERDUE` to
`NotificationEventType`.

- [ ] **Step 4: Run the schema test to verify it passes**

Run:

```bash
yarn test assignment.schema.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit the persistence contract**

```bash
git add src/modules/assignment/assignment.schema.ts src/modules/assignment/assignment.schema.spec.ts src/modules/notification/notification.dto.ts
git commit -m "feat: add assignment reminder delivery state"
```

### Task 2: Implement the daily reminder workflow test-first

**Files:**
- Create: `src/modules/assignment/assignment.service.spec.ts`
- Modify: `src/modules/assignment/assignment.service.ts`

- [ ] **Step 1: Write failing service tests**

Instantiate `AssignmentService` with mocked Mongoose and notification
dependencies. Use a fixed `now` and cover these behaviors:

- A five-day assignment sends `GameAssignmentDueReminder` to `assignedTo` with
  `daysRemaining: 5`, then writes `fiveDayReminderSentAt`.
- A one-day assignment sends the same event with `daysRemaining: 1`, then
  writes `oneDayReminderSentAt`.
- An overdue assignment sends `GameAssignmentOverdue` only to `assignedBy`,
  writes `managerInformedAt`, and never updates `status`.
- The Mongo filter limits records to `game_learning`, `assigned`, and a present
  due date while excluding already-sent timestamp branches.
- A `null` notification result or thrown notification error does not write a
  timestamp.
- Failure for one assignment increments `failures` and processing continues for
  later assignments.

- [ ] **Step 2: Run the service tests to verify they fail**

Run:

```bash
yarn test assignment.service.spec.ts --runInBand
```

Expected: FAIL because `processGameAssignmentReminders` and the notification
dependency do not exist.

- [ ] **Step 3: Implement minimal workflow code**

Update the constructor to inject `NotificationService` with `forwardRef`.
Add:

```ts
export interface AssignmentReminderResult {
  fiveDayReminders: number;
  oneDayReminders: number;
  managersInformed: number;
  failures: number;
}
```

Implement:

```ts
processGameAssignmentReminders(
  now: Date = new Date(),
): Promise<AssignmentReminderResult>
```

Use `moment(now).tz('Europe/Istanbul').startOf('day')` to build half-open
calendar ranges for five and one days ahead. Query once with a common
game/assigned/due-date filter and three `$or` eligibility branches. For each
record, determine its branch, call `createNotification`, and update only the
matching timestamp after a non-null result. Catch and log failures per record.

- [ ] **Step 4: Run the service tests to verify they pass**

Run:

```bash
yarn test assignment.service.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit the workflow**

```bash
git add src/modules/assignment/assignment.service.ts src/modules/assignment/assignment.service.spec.ts
git commit -m "feat: process game assignment reminders"
```

### Task 3: Schedule the workflow and wire the module

**Files:**
- Create: `src/modules/assignment/assignment.cron.service.ts`
- Create: `src/modules/assignment/assignment.cron.service.spec.ts`
- Modify: `src/modules/assignment/assignment.module.ts`

- [ ] **Step 1: Write the failing cron test**

Test that `handleGameAssignmentReminders` delegates once to
`processGameAssignmentReminders`, logs the returned counts, and logs/rethrows a
service error. Inspect Nest schedule metadata to confirm cron expression
`0 0 1 * * *` and timezone `Europe/Istanbul`.

- [ ] **Step 2: Run the cron test to verify it fails**

Run:

```bash
yarn test assignment.cron.service.spec.ts --runInBand
```

Expected: FAIL because `AssignmentCronService` does not exist.

- [ ] **Step 3: Add cron service and module wiring**

Create an injectable cron service with:

```ts
@Cron('0 0 1 * * *', { timeZone: 'Europe/Istanbul' })
async handleGameAssignmentReminders()
```

Import `NotificationModule` through `forwardRef` in `AssignmentModule` and add
`AssignmentCronService` to its providers.

- [ ] **Step 4: Run assignment tests**

Run:

```bash
yarn test assignment --runInBand
```

Expected: all assignment test suites PASS.

- [ ] **Step 5: Commit scheduling**

```bash
git add src/modules/assignment/assignment.cron.service.ts src/modules/assignment/assignment.cron.service.spec.ts src/modules/assignment/assignment.module.ts
git commit -m "feat: schedule game assignment reminders"
```

### Task 4: Verify integration quality

**Files:**
- Review all files changed in Tasks 1-3.

- [ ] **Step 1: Format changed TypeScript files**

Run:

```bash
yarn prettier --write src/modules/assignment/assignment.schema.ts src/modules/assignment/assignment.schema.spec.ts src/modules/assignment/assignment.service.ts src/modules/assignment/assignment.service.spec.ts src/modules/assignment/assignment.cron.service.ts src/modules/assignment/assignment.cron.service.spec.ts src/modules/assignment/assignment.module.ts src/modules/notification/notification.dto.ts
```

- [ ] **Step 2: Run focused tests**

Run:

```bash
yarn test assignment --runInBand
```

Expected: all assignment tests PASS with zero failures.

- [ ] **Step 3: Run the full unit suite**

Run:

```bash
yarn test --runInBand
```

Expected: all unit tests PASS with zero failures.

- [ ] **Step 4: Run a production build**

Run:

```bash
yarn build
```

Expected: exit code 0.

- [ ] **Step 5: Inspect final diff**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only intended implementation files remain
uncommitted after task commits.

