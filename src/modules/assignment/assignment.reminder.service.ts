import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as moment from 'moment-timezone';
import { Model } from 'mongoose';
import {
  NotificationEventType,
  NotificationType,
} from '../notification/notification.dto';
import { NotificationService } from '../notification/notification.service';
import { AssignmentStatusEnum, AssignmentTypeEnum } from './assignment.dto';
import { Assignment } from './assignment.schema';

export interface AssignmentReminderResult {
  fiveDayReminders: number;
  oneDayReminders: number;
  managersInformed: number;
  failures: number;
}

@Injectable()
export class AssignmentReminderService {
  private readonly logger = new Logger(AssignmentReminderService.name);

  constructor(
    @InjectModel(Assignment.name) private assignmentModel: Model<Assignment>,
    private readonly notificationService: NotificationService,
  ) {}

  async processGameAssignmentReminders(
    now: Date = new Date(),
  ): Promise<AssignmentReminderResult> {
    const today = moment(now).tz('Europe/Istanbul').startOf('day');
    const fiveDayStart = today.clone().add(5, 'days').toDate();
    const fiveDayEnd = today.clone().add(6, 'days').toDate();
    const oneDayStart = today.clone().add(1, 'day').toDate();
    const oneDayEnd = today.clone().add(2, 'days').toDate();

    const assignments = await this.assignmentModel
      .find({
        assignmentType: AssignmentTypeEnum.GAME_LEARNING,
        status: AssignmentStatusEnum.ASSIGNED,
        dueDate: { $exists: true },
        $or: [
          {
            dueDate: { $gte: fiveDayStart, $lt: fiveDayEnd },
            fiveDayReminderSentAt: { $exists: false },
          },
          {
            dueDate: { $gte: oneDayStart, $lt: oneDayEnd },
            oneDayReminderSentAt: { $exists: false },
          },
          {
            dueDate: { $lt: now },
            managerInformedAt: { $exists: false },
          },
        ],
      })
      .lean()
      .exec();

    const result: AssignmentReminderResult = {
      fiveDayReminders: 0,
      oneDayReminders: 0,
      managersInformed: 0,
      failures: 0,
    };

    for (const assignment of assignments) {
      try {
        const dueDate = new Date(assignment.dueDate as Date);
        const dueTime = dueDate.getTime();
        let notification;
        let timestampUpdate: Record<string, Date>;
        let resultKey:
          | 'fiveDayReminders'
          | 'oneDayReminders'
          | 'managersInformed';

        if (dueTime < now.getTime()) {
          notification = await this.notificationService.createNotification({
            type: NotificationType.WARNING,
            selectedUsers: [String(assignment.assignedBy)],
            seenBy: [],
            event: NotificationEventType.GAMEASSIGNMENTOVERDUE,
            message: {
              key: 'GameAssignmentOverdue',
              params: {
                assignmentId: assignment._id,
                title: assignment.title,
                assignedTo: String(assignment.assignedTo),
                dueDate: dueDate.toISOString(),
              },
            },
          });
          timestampUpdate = { managerInformedAt: now };
          resultKey = 'managersInformed';
        } else {
          const isFiveDayReminder =
            dueTime >= fiveDayStart.getTime() && dueTime < fiveDayEnd.getTime();
          const daysRemaining = isFiveDayReminder ? 5 : 1;

          notification = await this.notificationService.createNotification({
            type: NotificationType.INFORMATION,
            selectedUsers: [String(assignment.assignedTo)],
            seenBy: [],
            event: NotificationEventType.GAMEASSIGNMENTREMINDER,
            message: {
              key: 'GameAssignmentDueReminder',
              params: {
                assignmentId: assignment._id,
                title: assignment.title,
                dueDate: dueDate.toISOString(),
                daysRemaining,
              },
            },
          });
          timestampUpdate = isFiveDayReminder
            ? { fiveDayReminderSentAt: now }
            : { oneDayReminderSentAt: now };
          resultKey = isFiveDayReminder
            ? 'fiveDayReminders'
            : 'oneDayReminders';
        }

        if (!notification) {
          continue;
        }

        await this.assignmentModel.findByIdAndUpdate(
          assignment._id,
          timestampUpdate,
        );
        result[resultKey] += 1;
      } catch (error) {
        result.failures += 1;
        this.logger.error(
          `Failed to process game assignment reminder ${assignment._id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    return result;
  }
}
