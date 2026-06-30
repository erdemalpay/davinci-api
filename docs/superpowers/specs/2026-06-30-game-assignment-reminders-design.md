# Game Assignment Reminders Design

## Goal

Run a daily job that reminds users about incomplete game assignments five days
and one day before their due date, then informs the assigning user once when an
assignment becomes overdue.

## Scope

The job processes assignments only when:

- `assignmentType` is `game_learning`.
- `status` is `assigned`.
- `dueDate` is present.

Completing or cancelling an assignment removes it from future processing. The
job does not change an overdue assignment's status; it remains `assigned`.

## Schedule and Date Semantics

`AssignmentCronService` runs once per day in the `Europe/Istanbul` timezone,
following the existing visit cron pattern.

Reminder eligibility uses Istanbul calendar dates:

- The five-day reminder is due when the assignment's due-date calendar day is
  five days after the cron's current calendar day.
- The one-day reminder is due when the assignment's due-date calendar day is
  one day after the cron's current calendar day.
- The manager notification is due when the exact `dueDate` timestamp is earlier
  than the cron execution time.

This preserves calendar-day reminder behavior while respecting the precise
deadline for overdue detection.

## Persistence and Duplicate Prevention

Each assignment gains three optional timestamps:

- `fiveDayReminderSentAt`
- `oneDayReminderSentAt`
- `managerInformedAt`

A notification is eligible only when its timestamp is absent. The timestamp is
written after the notification is created successfully. If creation fails, the
timestamp remains absent so a later daily run can retry.

These timestamps provide an audit trail and prevent duplicate notifications
from manual cron reruns. They also reduce duplicate risk if more than one
application instance executes the job, although strict cross-instance
exactly-once delivery is outside this change's scope.

## Notification Delivery

Two assignment-specific notification events are added:

- A game-assignment reminder event for notifications to `assignedTo`.
- A game-assignment overdue event for notifications to `assignedBy`.

Five-day and one-day reminders use `NotificationType.INFORMATION`. The overdue
notification uses `NotificationType.WARNING`. Every generated notification
targets a specific user through `selectedUsers`, has an empty `seenBy` array,
and includes a message key plus parameters such as assignment ID, title, due
date, and remaining days where applicable.

Existing assigned event templates may still control active/inactive behavior
through `NotificationService`. Assignment reminder delivery does not require a
template to exist.

## Components

### Assignment schema

Defines the three optional delivery timestamps. No DTO field is added because
clients must not set cron-owned delivery state.

### Assignment service

Owns the daily processing method. It queries eligible assignments, sends each
notification independently, and records the corresponding timestamp only after
successful delivery. One assignment's failure is logged and does not stop
processing other assignments.

The method returns counts for five-day reminders, one-day reminders, overdue
manager notifications, and failures so the cron can produce useful logs.

### Assignment cron service

Contains only scheduling and summary logging. It delegates all assignment and
notification behavior to `AssignmentService`.

### Assignment module

Imports `NotificationModule` and registers `AssignmentCronService`.

## Error Handling

The service catches errors per assignment and notification type. Failed sends
remain retryable because their timestamp is not set. Database query failures
propagate to the cron handler, where they are logged as a failed cron execution.

## Testing

Focused Jest unit tests cover:

- Sending and marking the five-day reminder.
- Sending and marking the one-day reminder.
- Not processing completed, cancelled, non-game, or missing-due-date records.
- Sending an overdue warning only to `assignedBy`.
- Keeping overdue assignment status as `assigned`.
- Skipping notifications whose timestamp already exists.
- Retaining an unset timestamp when notification creation fails.
- Continuing with later assignments after one assignment fails.
- Cron delegation and schedule registration through the Nest decorator.

