import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LocationService } from '../location/location.service';
import { NotificationEventType } from '../notification/notification.dto';
import { NotificationService } from '../notification/notification.service';
import { User } from '../user/user.schema';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import { GroupEventMailService } from './group-event-mail.service';
import {
  addDays,
  bookableRange,
  BookedEvent,
  dayAvailability,
  DayAvailability,
  eventWindow,
  GROUP_EVENT_CAPACITY,
  GROUP_EVENT_LOCATION,
  istanbulToday,
  remainingSeats,
  timeProblem,
} from './group-event.availability';
import {
  CreateGroupEventDto,
  GroupEventListQueryDto,
  UpdateGroupEventStatusDto,
} from './group-event.dto';
import { GroupEvent, GroupEventStatus } from './group-event.schema';

const MAX_AVAILABILITY_DAYS = 62;

@Injectable()
export class GroupEventService {
  private readonly logger = new Logger(GroupEventService.name);

  constructor(
    @InjectModel(GroupEvent.name)
    private readonly groupEventModel: Model<GroupEvent>,
    private readonly locationService: LocationService,
    private readonly notificationService: NotificationService,
    private readonly websocketGateway: AppWebSocketGateway,
    private readonly mailService: GroupEventMailService,
  ) {}

  private async dailyHours() {
    const location = await this.locationService.findLocationById(
      GROUP_EVENT_LOCATION,
    );
    return location?.dailyHours ?? [];
  }

  private eventsBetween(from: string, to: string): Promise<BookedEvent[]> {
    return this.groupEventModel
      .find(
        {
          date: { $gte: from, $lte: to },
          status: {
            $in: [GroupEventStatus.APPROVED, GroupEventStatus.PENDING],
          },
        },
        { date: 1, startTime: 1, endTime: 1, participantCount: 1, status: 1 },
      )
      .lean<BookedEvent[]>()
      .exec();
  }

  /** Days in [from, to] that take group events, with seats left per hour. */
  async availability(
    from?: string,
    to?: string,
  ): Promise<{ capacity: number; days: DayAvailability[] }> {
    const range = bookableRange(istanbulToday());
    const start = from && from > range.from ? from : range.from;
    let end = to && to < range.to ? to : range.to;
    if (end > addDays(start, MAX_AVAILABILITY_DAYS)) {
      end = addDays(start, MAX_AVAILABILITY_DAYS);
    }
    if (end < start) return { capacity: GROUP_EVENT_CAPACITY, days: [] };

    const [dailyHours, events] = await Promise.all([
      this.dailyHours(),
      this.eventsBetween(start, end),
    ]);
    const days: DayAvailability[] = [];
    for (let date = start; date <= end; date = addDays(date, 1)) {
      const window = eventWindow(date, dailyHours);
      if (window) days.push(dayAvailability(date, window, events));
    }
    return { capacity: GROUP_EVENT_CAPACITY, days };
  }

  private async checkTime(dto: {
    date: string;
    startTime: string;
    endTime: string;
  }) {
    const problem = timeProblem(
      eventWindow(dto.date, await this.dailyHours()),
      dto.startTime,
      dto.endTime,
    );
    if (problem) throw new BadRequestException(problem);
  }

  async createPublic(dto: CreateGroupEventDto) {
    const { website, ...fields } = dto;
    // Bots fill the hidden field; answer like a success so they move on
    if (website) return { ok: true };

    const range = bookableRange(istanbulToday());
    if (dto.date < range.from || dto.date > range.to) {
      throw new BadRequestException(
        'Applications are accepted from tomorrow up to 90 days ahead',
      );
    }
    await this.checkTime(dto);

    const events = await this.eventsBetween(dto.date, dto.date);
    const remaining = remainingSeats(
      dto.date,
      dto.startTime,
      dto.endTime,
      events,
    );
    if (dto.participantCount > remaining) {
      throw new ConflictException(
        `Only ${remaining} seats are left at the selected time`,
      );
    }

    const event = await this.groupEventModel.create({
      ...fields,
      location: GROUP_EVENT_LOCATION,
      organization: fields.organization.trim(),
      contactName: fields.contactName.trim(),
      email: fields.email.trim().toLowerCase(),
      status: GroupEventStatus.PENDING,
    });
    this.websocketGateway.emitGroupEventChanged();
    await this.notifyStaff(event);
    await this.mailService.send(event, 'received');
    return { ok: true, id: event._id };
  }

  private async notifyStaff(event: GroupEvent) {
    try {
      const events = await this.notificationService.findAllEventNotifications();
      const template = events.find(
        (n) => n.event === NotificationEventType.GROUPEVENTREQUEST,
      );
      if (!template) return;
      await this.notificationService.createNotification({
        message: {
          key: 'GroupEventRequested',
          params: {
            organization: event.organization,
            date: event.date,
            startTime: event.startTime,
            endTime: event.endTime,
            participantCount: String(event.participantCount),
          },
        },
        type: template.type,
        createdBy: template.createdBy,
        selectedUsers: template.selectedUsers,
        selectedRoles: template.selectedRoles,
        selectedLocations: template.selectedLocations,
        seenBy: [],
        event: NotificationEventType.GROUPEVENTREQUEST,
      });
    } catch (error) {
      this.logger.error('Group event notification failed', error);
    }
  }

  findAll(query: GroupEventListQueryDto) {
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.from || query.to) {
      filter.date = {
        ...(query.from ? { $gte: query.from } : {}),
        ...(query.to ? { $lte: query.to } : {}),
      };
    }
    return this.groupEventModel
      .find(filter)
      .sort({ date: 1, startTime: 1, _id: 1 })
      .lean()
      .exec();
  }

  async updateStatus(id: number, dto: UpdateGroupEventStatusDto, user: User) {
    const event = await this.groupEventModel.findById(id);
    if (!event) throw new NotFoundException('Group event not found');

    if (dto.status === GroupEventStatus.APPROVED && !dto.force) {
      const events = await this.eventsBetween(event.date, event.date);
      const remaining = remainingSeats(
        event.date,
        event.startTime,
        event.endTime,
        events,
        GROUP_EVENT_CAPACITY,
        event._id,
      );
      if (event.participantCount > remaining) {
        throw new ConflictException(
          `Only ${remaining} seats are left at this time; approve anyway to go over capacity`,
        );
      }
    }

    const previous = event.status;
    event.status = dto.status;
    if (dto.responseNote !== undefined) event.responseNote = dto.responseNote;
    event.decidedBy = user?._id;
    event.decidedAt = new Date();
    await event.save();
    this.websocketGateway.emitGroupEventChanged();

    let mailSent = false;
    if (
      previous !== dto.status &&
      (dto.status === GroupEventStatus.APPROVED ||
        dto.status === GroupEventStatus.REJECTED)
    ) {
      mailSent = await this.mailService.send(event, dto.status);
    }
    return { ...event.toObject(), mailSent };
  }
}
