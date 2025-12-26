import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as moment from 'moment-timezone';
import { Model } from 'mongoose';
import { dateRanges } from 'src/utils/dateRanges';
import { ActivityType } from '../activity/activity.dto';
import { ActivityService } from '../activity/activity.service';
import { NotificationEventType } from '../notification/notification.dto';
import { NotificationService } from '../notification/notification.service';
import { User } from '../user/user.schema';
import { UserService } from '../user/user.service';
import {
	AnomalyQueryDto,
	AnomalyReportDto, AnomalySeverity, AnomalyType
} from './anomaly.dto';
import { Anomaly } from './anomaly.schema';

interface AnomalyDetectionConfig {
  rapidPayments: {
    enabled: boolean;
    timeWindowMinutes: number; // Within how many minutes
    threshold: number; // How many payments trigger the anomaly
    severity: AnomalySeverity;
  };
  rapidGameExplanations: {
    enabled: boolean;
    timeWindowMinutes: number;
    threshold: number;
    severity: AnomalySeverity;
  };
}

@Injectable()
export class AnomalyService {
  private readonly logger = new Logger(AnomalyService.name);
  private readonly config: AnomalyDetectionConfig = {
    rapidPayments: {
      enabled: true,
      timeWindowMinutes: 10, // Within 10 minutes
      threshold: 3, // 3 or more payments
      severity: AnomalySeverity.HIGH,
    },
    rapidGameExplanations: {
      enabled: true,
      timeWindowMinutes: 5, // Within 5 minutes
      threshold: 3, // 3 or more games
      severity: AnomalySeverity.MEDIUM,
    },
  };

  constructor(
    @InjectModel(Anomaly.name) private anomalyModel: Model<Anomaly>,
    private readonly activityService: ActivityService,
    private readonly notificationService: NotificationService,
    private readonly userService: UserService,
  ) {}

  parseLocalDate(dateString: string): Date {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  /**
   * Real-time detection: Called when a user takes payment
   */
  async detectRapidPayments(user: User, paymentTime: Date): Promise<void> {
    if (!this.config.rapidPayments.enabled) {
      return;
    }

    try {
      const timeWindowStart = moment(paymentTime)
        .subtract(this.config.rapidPayments.timeWindowMinutes, 'minutes')
        .toDate();

      // Check TAKE_PAYMENT activities within the last X minutes
      // We keep the date range wide, then filter afterwards
      const recentPayments = await this.activityService.getActivities({
        user: user._id,
        type: ActivityType.TAKE_PAYMENT,
        after: moment(timeWindowStart).subtract(1, 'day').format('YYYY-MM-DD'),
        before: moment(paymentTime).add(1, 'day').format('YYYY-MM-DD'),
        limit: 100,
      });

      // Filter payments within the time window
      const paymentsInWindow = recentPayments.data.filter((activity: any) => {
        const activityDate = new Date(activity.createdAt);
        const activityUser = typeof activity.user === 'string' ? activity.user : activity.user?._id || activity.user;
        return (
          activityDate >= timeWindowStart &&
          activityDate <= paymentTime &&
          activityUser === user._id
        );
      });

      // Include the new payment as well
      const totalPayments = paymentsInWindow.length + 1;

      if (totalPayments >= this.config.rapidPayments.threshold) {
        const description = `${user.name} kullanıcısı son ${this.config.rapidPayments.timeWindowMinutes} dakika içinde ${totalPayments} kez hesap aldı.`;

        await this.createAnomaly({
          user: user._id,
          type: AnomalyType.RAPID_PAYMENTS,
          severity: this.config.rapidPayments.severity,
          description,
          incidentDate: paymentTime,
          metadata: {
            paymentCount: totalPayments,
            timeWindowMinutes: this.config.rapidPayments.timeWindowMinutes,
            recentPayments: paymentsInWindow.map((p: any) => ({
              id: p._id,
              createdAt: p.createdAt,
            })),
          },
        });

        // Send immediate notification
        await this.sendAnomalyNotification(
          AnomalyType.RAPID_PAYMENTS,
          user,
          description,
        );
      }
    } catch (error) {
      this.logger.error('Error detecting rapid payments:', error);
    }
  }

  /**
   * Real-time detection: Called when a user explains a game
   */
  async detectRapidGameExplanations(
    user: User,
    explanationTime: Date,
  ): Promise<void> {
    if (!this.config.rapidGameExplanations.enabled) {
      return;
    }

    try {
      const timeWindowStart = moment(explanationTime)
        .subtract(this.config.rapidGameExplanations.timeWindowMinutes, 'minutes')
        .toDate();

      // Check CREATE_GAMEPLAY activities within the last X minutes
      // We keep the date range wide, then filter afterwards
      const recentExplanations = await this.activityService.getActivities({
        user: user._id,
        type: ActivityType.CREATE_GAMEPLAY,
        after: moment(timeWindowStart).subtract(1, 'day').format('YYYY-MM-DD'),
        before: moment(explanationTime).add(1, 'day').format('YYYY-MM-DD'),
        limit: 100,
      });

      // Filter explanations within the time window
      const explanationsInWindow = recentExplanations.data.filter(
        (activity: any) => {
          const activityDate = new Date(activity.createdAt);
          const activityUser = typeof activity.user === 'string' ? activity.user : activity.user?._id || activity.user;
          return (
            activityDate >= timeWindowStart &&
            activityDate <= explanationTime &&
            activityUser === user._id
          );
        },
      );

      // Include the new explanation as well
      const totalExplanations = explanationsInWindow.length + 1;

      if (totalExplanations >= this.config.rapidGameExplanations.threshold) {
        const description = `${user.name} kullanıcısı son ${this.config.rapidGameExplanations.timeWindowMinutes} dakika içinde ${totalExplanations} kez oyun anlattı.`;

        await this.createAnomaly({
          user: user._id,
          type: AnomalyType.RAPID_GAME_EXPLANATIONS,
          severity: this.config.rapidGameExplanations.severity,
          description,
          incidentDate: explanationTime,
          metadata: {
            explanationCount: totalExplanations,
            timeWindowMinutes: this.config.rapidGameExplanations.timeWindowMinutes,
            recentExplanations: explanationsInWindow.map((e: any) => ({
              id: e._id,
              createdAt: e.createdAt,
            })),
          },
        });

        // Send immediate notification
        await this.sendAnomalyNotification(
          AnomalyType.RAPID_GAME_EXPLANATIONS,
          user,
          description,
        );
      }
    } catch (error) {
      this.logger.error('Error detecting rapid game explanations:', error);
    }
  }

  /**
   * Create anomaly record
   */
  private async createAnomaly(data: {
    user: string;
    type: AnomalyType;
    severity: AnomalySeverity;
    description: string;
    incidentDate: Date;
    metadata?: Record<string, any>;
  }): Promise<Anomaly> {
    const anomaly = await this.anomalyModel.create({
      ...data,
      detectedAt: new Date(),
      isReviewed: false,
    });

    this.logger.warn(
      `Anomaly detected: ${data.type} for user ${data.user} - ${data.description}`,
    );

    return anomaly;
  }

  /**
   * Send anomaly notification
   */
  private async sendAnomalyNotification(
    type: AnomalyType,
    user: User,
    description: string,
  ): Promise<void> {
    try {
      // Check event notification configuration
      const eventNotifications =
        await this.notificationService.findAllEventNotifications();

      const anomalyEvent = eventNotifications.find(
        (notification) =>
          notification.event === NotificationEventType.ANOMALY_DETECTED,
      );

      if (anomalyEvent) {
        const message = {
          key: 'AnomalyDetected',
          params: {
            type:
              type === AnomalyType.RAPID_PAYMENTS
                ? 'Hızlı Ödeme'
                : 'Hızlı Oyun Anlatma',
            user: user.name,
            description,
          },
        };

        await this.notificationService.createNotification({
          type: anomalyEvent.type,
          createdBy: anomalyEvent.createdBy,
          selectedUsers: anomalyEvent.selectedUsers,
          selectedRoles: anomalyEvent.selectedRoles,
          selectedLocations: anomalyEvent.selectedLocations,
          seenBy: [],
          event: NotificationEventType.ANOMALY_DETECTED,
          message,
        });
      }
    } catch (error) {
      this.logger.error('Error sending anomaly notification:', error);
    }
  }

  /**
   * Generate daily report (for cron job)
   */
  async generateDailyReport(reportDate: Date): Promise<AnomalyReportDto> {
    const startOfDay = moment(reportDate).startOf('day').toDate();
    const endOfDay = moment(reportDate).endOf('day').toDate();

    const anomalies = await this.anomalyModel.find({
      incidentDate: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
    });

    const anomaliesByType: Record<AnomalyType, number> = {
      [AnomalyType.RAPID_PAYMENTS]: 0,
      [AnomalyType.RAPID_GAME_EXPLANATIONS]: 0,
    };

    const anomaliesBySeverity: Record<AnomalySeverity, number> = {
      [AnomalySeverity.LOW]: 0,
      [AnomalySeverity.MEDIUM]: 0,
      [AnomalySeverity.HIGH]: 0,
      [AnomalySeverity.CRITICAL]: 0,
    };

    const userAnomalyCount: Record<string, number> = {};

    anomalies.forEach((anomaly) => {
      anomaliesByType[anomaly.type]++;
      anomaliesBySeverity[anomaly.severity]++;
      userAnomalyCount[anomaly.user] =
        (userAnomalyCount[anomaly.user] || 0) + 1;
    });

    // Find users with most anomalies
    const topUsers = await Promise.all(
      Object.entries(userAnomalyCount)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(async ([userId, count]) => {
          const user = await this.userService.findById(userId);
          return {
            userId,
            userName: user?.name || 'Unknown',
            anomalyCount: count,
          };
        }),
    );

    return {
      date: moment(reportDate).format('YYYY-MM-DD'),
      totalAnomalies: anomalies.length,
      anomaliesByType,
      anomaliesBySeverity,
      topUsers,
    };
  }

  /**
   * Query anomalies
   */
  async getAnomalies(query: AnomalyQueryDto) {
    const {
      page = 1,
      limit = 10,
      user,
      type,
      severity,
      date,
      after,
      before,
    } = query;

    const filter: Record<string, any> = {};

    if (user) filter.user = user;
    if (type) filter.type = type;
    if (severity) filter.severity = severity;

    if (date && dateRanges[date]) {
      const { after: dAfter, before: dBefore } = dateRanges[date]();
      const start = this.parseLocalDate(dAfter);
      const end = this.parseLocalDate(dBefore);
      end.setHours(23, 59, 59, 999);
      filter.incidentDate = { $gte: start, $lte: end };
    } else {
      const rangeFilter: Record<string, any> = {};
      if (after) {
        const start = this.parseLocalDate(after);
        rangeFilter.$gte = start;
      }
      if (before) {
        const end = this.parseLocalDate(before);
        end.setHours(23, 59, 59, 999);
        rangeFilter.$lte = end;
      }
      if (Object.keys(rangeFilter).length) {
        filter.incidentDate = rangeFilter;
      }
    }

    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 10;
    const skip = (pageNum - 1) * limitNum;

    const [data, totalNumber] = await Promise.all([
      this.anomalyModel
        .find(filter)
        .sort({ detectedAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean()
        .exec(),
      this.anomalyModel.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(totalNumber / limitNum);

    return {
      data,
      totalNumber,
      totalPages,
      page: pageNum,
      limit: limitNum,
    };
  }

  /**
   * Mark anomaly as reviewed
   */
  async markAsReviewed(
    anomalyId: number,
    reviewedBy: string,
  ): Promise<Anomaly> {
    return this.anomalyModel.findByIdAndUpdate(
      anomalyId,
      {
        isReviewed: true,
        reviewedBy,
        reviewedAt: new Date(),
      },
      { new: true },
    );
  }
}

