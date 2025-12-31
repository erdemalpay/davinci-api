import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { format, subDays } from 'date-fns';
import { Model, UpdateQuery } from 'mongoose';
import { ActivityType } from '../activity/activity.dto';
import { ActivityService } from '../activity/activity.service';
import { NotificationEventType } from '../notification/notification.dto';
import { NotificationService } from '../notification/notification.service';
import { User } from '../user/user.schema';
import { UserService } from '../user/user.service';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import { ShiftService } from './../shift/shift.service';
import { CafeActivity } from './cafeActivity.schema';
import { CreateVisitDto } from './create.visit.dto';
import {
  CafeActivityDto,
  CafeVisitDto,
  VisitDto,
  VisitSource,
  VisitTypes,
} from './visit.dto';
import { Visit } from './visit.schema';

export class VisitService {
  constructor(
    @InjectModel(Visit.name) private visitModel: Model<Visit>,
    @InjectModel(CafeActivity.name)
    private cafeActivityModel: Model<CafeActivity>,
    private readonly websocketGateway: AppWebSocketGateway,
    private readonly userService: UserService,
    private readonly notificationService: NotificationService,
    private readonly shiftService: ShiftService,
    private readonly activityService: ActivityService,
  ) {}

  findByDateAndLocation(date: string, location: number) {
    return this.visitModel.find({ date, location });
  }

  findMonthlyByLocation(date: string, location: number) {
    return this.visitModel.find({
      date: { $gte: `${date}-01`, $lte: `${date}-31` },
      location,
    });
  }

  findOneByQuery(visitDto: VisitDto) {
    return this.visitModel.findOne(visitDto);
  }

  async create(user: User, createVisitDto: CreateVisitDto) {
    const visit = await this.visitModel.create({
      ...createVisitDto,
      user: user._id,
      visitStartSource: createVisitDto.visitStartSource,
    });

    const shifts = await this.shiftService.findQueryShifts({
      after: createVisitDto.date,
      before: createVisitDto.date,
      location: createVisitDto.location,
    });
    const foundShift = shifts[0]?.shifts?.find((shift) => {
      return shift.user.includes(user._id);
    });
    if (foundShift && createVisitDto.startHour > foundShift.shift) {
      const notificationEvents =
        await this.notificationService.findAllEventNotifications();
      const lateshiftstartEvent = notificationEvents.find(
        (notification) =>
          notification.event === NotificationEventType.LATESHIFTSTART,
      );

      if (lateshiftstartEvent) {
        const message = {
          key: 'ShiftLateNotice',
          params: {
            user: user.name,
            shift: foundShift.shift,
            enteredAt: createVisitDto.startHour,
          },
        };

        await this.notificationService.createNotification({
          type: lateshiftstartEvent.type,
          createdBy: lateshiftstartEvent.createdBy,
          selectedUsers: lateshiftstartEvent.selectedUsers,
          selectedRoles: lateshiftstartEvent.selectedRoles,
          selectedLocations: lateshiftstartEvent.selectedLocations,
          seenBy: [],
          event: NotificationEventType.LATESHIFTSTART,
          message,
        });
      }
    }

    try {
      await this.activityService.addActivity(
        user,
        ActivityType.CREATE_VISIT,
        visit,
      );
    } catch (error) {
      console.error('Failed to add activity:', error);
    }

    this.websocketGateway.emitVisitChanged();
    return visit;
  }

  createManually(visitDto: VisitDto) {
    return this.visitModel.create(visitDto);
  }

  async finish(
    user: User,
    id: number,
    finishHour: string,
    visitFinishSource: VisitSource,
  ) {
    const existingVisit = await this.visitModel.findById(id);
    if (!existingVisit) {
      throw new NotFoundException(`Visit with id ${id} not found`);
    }

    if (existingVisit.user.toString() !== user._id.toString()) {
      throw new BadRequestException('You can only finish your own visits');
    }

    const visit = await this.visitModel.findByIdAndUpdate(
      id,
      { finishHour, visitFinishSource },
      {
        new: true,
      },
    );

    if (!existingVisit.finishHour) {
      const shifts = await this.shiftService.findQueryShifts({
        after: visit.date,
        before: visit.date,
        location: visit.location as unknown as number,
      });
      const foundShift = shifts[0]?.shifts?.find((shift) => {
        return shift.user.includes(user._id);
      });

      if (foundShift && foundShift.shiftEndHour) {
        const isNightShift = foundShift.shiftEndHour < foundShift.shift;
        let isEarlyExit = false;

        if (isNightShift) {
          isEarlyExit =
            finishHour >= foundShift.shift ||
            finishHour < foundShift.shiftEndHour;
        } else if (finishHour >= foundShift.shift) {
          isEarlyExit = finishHour < foundShift.shiftEndHour;
        }

        if (isEarlyExit) {
          const notificationEvents =
            await this.notificationService.findAllEventNotifications();
          const earlyShiftEndEvent = notificationEvents.find(
            (notification) =>
              notification.event === NotificationEventType.EARLYSHIFTEND,
          );

          if (earlyShiftEndEvent) {
            const message = {
              key: 'ShiftEndEarlyNotice',
              params: {
                user: user.name,
                shiftEnd: foundShift.shiftEndHour,
                exitedAt: finishHour,
              },
            };

            await this.notificationService.createNotification({
              type: earlyShiftEndEvent.type,
              createdBy: earlyShiftEndEvent.createdBy,
              selectedUsers: earlyShiftEndEvent.selectedUsers,
              selectedRoles: earlyShiftEndEvent.selectedRoles,
              selectedLocations: earlyShiftEndEvent.selectedLocations,
              seenBy: [],
              event: NotificationEventType.EARLYSHIFTEND,
              message,
            });
          }
        }
      }
    }

    try {
      await this.activityService.addActivity(
        user,
        ActivityType.FINISH_VISIT,
        visit,
      );
    } catch (error) {
      console.error('Failed to add activity:', error);
    }

    this.websocketGateway.emitVisitChanged();
    return visit;
  }
  async remove(user: User, id: number) {
    const visit = await this.visitModel.findByIdAndDelete(id);
    if (!visit) {
      throw new NotFoundException(`Visit with id ${id} not found`);
    }

    try {
      await this.activityService.addActivity(
        user,
        ActivityType.DELETE_VISIT,
        visit,
      );
    } catch (error) {
      console.error('Failed to add activity:', error);
    }

    this.websocketGateway.emitVisitChanged();
    return visit;
  }

  async getVisits(startDate: string, endDate?: string, user?: string) {
    let query: any = { date: { $gte: startDate } };
    if (endDate) {
      query = { ...query, date: { ...query.date, $lte: endDate } };
    }
    if (user) {
      query = { ...query, user };
    }
    const visits = await this.visitModel
      .find(query)
      .populate({
        path: 'user',
        select: '-password',
      })
      .sort({ date: 1, location: 1 })
      .lean();

    return visits.map((visit) => {
      return {
        ...visit,
        role: visit.user.role,
        user: visit.user._id,
      };
    });
  }

  async getUniqueVisits(startDate: string, endDate?: string) {
    let matchStage: any = { date: { $gte: startDate } };
    if (endDate) {
      matchStage.date.$lte = endDate;
    }

    const visits = await this.visitModel.aggregate([
      { $match: matchStage },
      {
        $sort: { date: 1, user: 1, startHour: 1 },
      },
      {
        $group: {
          _id: { user: '$user', date: '$date' },
          visit: { $first: '$$ROOT' },
        },
      },
      {
        $replaceRoot: { newRoot: '$visit' },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'user',
          foreignField: '_id',
          as: 'user',
        },
      },
      {
        $unwind: '$user',
      },
      {
        $project: {
          user: '$user._id',
          role: '$user.role',
          location: 1,
          date: 1,
          startHour: 1,
          finishHour: 1,
        },
      },
    ]);

    return visits;
  }

  async createVisitFromCafe(cafeVisitDto: CafeVisitDto) {
    const user = await this.userService.findByCafeId(cafeVisitDto.userData);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (cafeVisitDto?.type === VisitTypes.ENTRY) {
      const lastVisit = await this.visitModel
        .findOne({
          user: user._id,
          date: cafeVisitDto.date,
          location: cafeVisitDto.location,
        })
        .sort({ startHour: -1 });
      if (lastVisit && !lastVisit.finishHour) {
        return lastVisit;
      }
      const visit = await this.visitModel.create({
        user: user._id,
        location: cafeVisitDto.location,
        date: cafeVisitDto.date,
        startHour: cafeVisitDto.hour,
        visitStartSource: VisitSource.FACE_RECOGNITION,
      });
      const shifts = await this.shiftService.findQueryShifts({
        after: cafeVisitDto.date,
        before: cafeVisitDto.date,
        location: cafeVisitDto.location,
      });
      const foundShift = shifts[0]?.shifts?.find((shift) => {
        return shift.user.includes(user._id);
      });
      if (foundShift && cafeVisitDto.hour > foundShift.shift) {
        const notificationEvents =
          await this.notificationService.findAllEventNotifications();
        const lateshiftstartEvent = notificationEvents.find(
          (notification) =>
            notification.event === NotificationEventType.LATESHIFTSTART,
        );

        if (lateshiftstartEvent) {
          const message = {
            key: 'ShiftLateNotice',
            params: {
              user: user.name,
              shift: foundShift.shift,
              enteredAt: cafeVisitDto.hour,
            },
          };

          await this.notificationService.createNotification({
            type: lateshiftstartEvent.type,
            createdBy: lateshiftstartEvent.createdBy,
            selectedUsers: lateshiftstartEvent.selectedUsers,
            selectedRoles: lateshiftstartEvent.selectedRoles,
            selectedLocations: lateshiftstartEvent.selectedLocations,
            seenBy: [],
            event: NotificationEventType.LATESHIFTSTART,
            message,
          });
        }
      }

      try {
        await this.activityService.addActivity(
          user,
          ActivityType.CREATE_VISIT,
          visit,
        );
      } catch (error) {
        console.error('Failed to add activity:', error);
      }

      this.websocketGateway.emitVisitChanged();
      return visit;
    }
    if (cafeVisitDto?.type === VisitTypes.EXIT) {
      const previousDay = format(
        subDays(new Date(cafeVisitDto.date), 1),
        'yyyy-MM-dd',
      );
      const lastVisit = await this.visitModel
        .findOne({
          user: user._id,
          location: cafeVisitDto.location,
          $or: [
            { date: cafeVisitDto.date },
            { date: previousDay, startHour: { $gt: cafeVisitDto.hour } },
          ],
        })
        .sort({ date: -1, startHour: -1 });
      if (lastVisit) {
        if (!lastVisit.finishHour) {
          const shifts = await this.shiftService.findQueryShifts({
            after: cafeVisitDto.date,
            before: cafeVisitDto.date,
            location: cafeVisitDto.location,
          });
          const foundShift = shifts[0]?.shifts?.find((shift) => {
            return shift.user.includes(user._id);
          });

          if (foundShift && foundShift.shiftEndHour) {
            const isNightShift = foundShift.shiftEndHour < foundShift.shift;
            let isEarlyExit = false;

            if (isNightShift) {
              isEarlyExit =
                cafeVisitDto.hour >= foundShift.shift ||
                cafeVisitDto.hour < foundShift.shiftEndHour;
            } else if (cafeVisitDto.hour >= foundShift.shift) {
              isEarlyExit = cafeVisitDto.hour < foundShift.shiftEndHour;
            }

            if (isEarlyExit) {
              const notificationEvents =
                await this.notificationService.findAllEventNotifications();
              const earlyShiftEndEvent = notificationEvents.find(
                (notification) =>
                  notification.event === NotificationEventType.EARLYSHIFTEND,
              );

              if (earlyShiftEndEvent) {
                const message = {
                  key: 'ShiftEndEarlyNotice',
                  params: {
                    user: user.name,
                    shiftEnd: foundShift.shiftEndHour,
                    exitedAt: cafeVisitDto.hour,
                  },
                };

                await this.notificationService.createNotification({
                  type: earlyShiftEndEvent.type,
                  createdBy: earlyShiftEndEvent.createdBy,
                  selectedUsers: earlyShiftEndEvent.selectedUsers,
                  selectedRoles: earlyShiftEndEvent.selectedRoles,
                  selectedLocations: earlyShiftEndEvent.selectedLocations,
                  seenBy: [],
                  event: NotificationEventType.EARLYSHIFTEND,
                  message,
                });
              }
            }
          }
        }

        await lastVisit.updateOne({
          finishHour: cafeVisitDto.hour,
          visitFinishSource: VisitSource.FACE_RECOGNITION,
        });

        try {
          await this.activityService.addActivity(
            user,
            ActivityType.FINISH_VISIT,
            lastVisit,
          );
        } catch (error) {
          console.error('Failed to add activity:', error);
        }

        this.websocketGateway.emitVisitChanged();
        return lastVisit;
      }
      const visit = await this.visitModel.create({
        user: user._id,
        location: cafeVisitDto.location,
        date: cafeVisitDto.date,
        startHour: cafeVisitDto.hour,
        finishHour: cafeVisitDto.hour,
        visitStartSource: VisitSource.FACE_RECOGNITION,
        visitFinishSource: VisitSource.FACE_RECOGNITION,
      });
      const shifts = await this.shiftService.findQueryShifts({
        after: cafeVisitDto.date,
        before: cafeVisitDto.date,
        location: cafeVisitDto.location,
      });
      const foundShift = shifts[0]?.shifts?.find((shift) => {
        return shift.user.includes(user._id);
      });
      if (foundShift && foundShift.shiftEndHour) {
        const isNightShift = foundShift.shiftEndHour < foundShift.shift;
        let isEarlyExit = false;

        if (isNightShift) {
          isEarlyExit =
            cafeVisitDto.hour >= foundShift.shift ||
            cafeVisitDto.hour < foundShift.shiftEndHour;
        } else if (cafeVisitDto.hour >= foundShift.shift) {
          isEarlyExit = cafeVisitDto.hour < foundShift.shiftEndHour;
        }

        if (isEarlyExit) {
          const notificationEvents =
            await this.notificationService.findAllEventNotifications();
          const earlyShiftEndEvent = notificationEvents.find(
            (notification) =>
              notification.event === NotificationEventType.EARLYSHIFTEND,
          );

          if (earlyShiftEndEvent) {
            const message = {
              key: 'ShiftEndEarlyNotice',
              params: {
                user: user.name,
                shiftEnd: foundShift.shiftEndHour,
                exitedAt: cafeVisitDto.hour,
              },
            };

            await this.notificationService.createNotification({
              type: earlyShiftEndEvent.type,
              createdBy: earlyShiftEndEvent.createdBy,
              selectedUsers: earlyShiftEndEvent.selectedUsers,
              selectedRoles: earlyShiftEndEvent.selectedRoles,
              selectedLocations: earlyShiftEndEvent.selectedLocations,
              seenBy: [],
              event: NotificationEventType.EARLYSHIFTEND,
              message,
            });
          }
        }
      }

      try {
        await this.activityService.addActivity(
          user,
          ActivityType.FINISH_VISIT,
          visit,
        );
      } catch (error) {
        console.error('Failed to add activity:', error);
      }

      this.websocketGateway.emitVisitChanged();
      return visit;
    }
    throw new BadRequestException();
  }

  async createCafeActivity(dto: CafeActivityDto) {
    const activity = await this.cafeActivityModel.create(dto);
    this.websocketGateway.emitActivityChanged();
    return activity;
  }

  async findAllCafeActivity() {
    return this.cafeActivityModel.find().exec();
  }
  async updateCafeActivity(id: number, updates: UpdateQuery<CafeActivityDto>) {
    const activity = await this.cafeActivityModel.findOneAndUpdate(
      { _id: id },
      updates,
      { new: true },
    );
    if (!activity) {
      throw new NotFoundException(`CafeActivity with id ${id} not found`);
    }
    this.websocketGateway.emitActivityChanged();
    return activity;
  }

  async deleteCafeActivity(id: number) {
    const activity = await this.cafeActivityModel.findOneAndDelete({ _id: id });
    if (!activity) {
      throw new NotFoundException(`CafeActivity with id ${id} not found`);
    }
    this.websocketGateway.emitActivityChanged();
    return activity;
  }

  async notifyUnfinishedVisits() {
    // Bildirim spamı olmaması için son 2 gündeki kapanmamış vardiyaları kontrol etmek istiyorum:
    const twoDaysAgo = format(subDays(new Date(), 2), 'yyyy-MM-dd');

    // Bitiş saati olmayan VE notification gönderilmeyenleri topluyorum:
    const openVisits = await this.visitModel
      .find({
        finishHour: { $exists: false },
        date: { $gte: twoDaysAgo },
        $or: [
          { notificationSent: { $exists: false } }, // deploy ettiğimiz tarihe göre eski kayıtlar için (field yoksa)
          { notificationSent: false }, // yeni kayıtlar için
        ],
      })
      .populate({
        path: 'user',
        select: 'name _id',
      })
      .populate({
        path: 'location',
        select: 'name _id',
      })
      .lean();

    if (openVisits.length === 0) {
      return 0;
    }

    const notificationEvents =
      await this.notificationService.findAllEventNotifications();
    const unfinishedVisitEvent = notificationEvents.find(
      (notification) =>
        notification.event === NotificationEventType.UNFINISHEDVISIT,
    );

    if (!unfinishedVisitEvent) {
      return 0;
    }

    // Bildirim gönderilmesi
    for (const visit of openVisits) {
      const managerMessage = {
        key: 'UnfinishedVisit',
        params: {
          user: visit.user.name,
          location: visit.location.name,
          date: visit.date,
          startHour: visit.startHour,
        },
      };

      await this.notificationService.createNotification({
        type: unfinishedVisitEvent.type,
        createdBy: unfinishedVisitEvent.createdBy,
        selectedUsers: unfinishedVisitEvent.selectedUsers,
        selectedRoles: unfinishedVisitEvent.selectedRoles,
        selectedLocations: unfinishedVisitEvent.selectedLocations,
        seenBy: [],
        event: NotificationEventType.UNFINISHEDVISIT,
        message: managerMessage,
      });

      const employeeMessage = {
        key: 'UnfinishedVisitEmployee',
        params: {
          location: visit.location.name,
          date: visit.date,
          startHour: visit.startHour,
        },
      };

      await this.notificationService.createNotification({
        type: unfinishedVisitEvent.type,
        createdBy: unfinishedVisitEvent.createdBy,
        selectedUsers: [visit.user._id],
        selectedRoles: unfinishedVisitEvent.selectedRoles,
        selectedLocations: unfinishedVisitEvent.selectedLocations,
        seenBy: [],
        event: NotificationEventType.UNFINISHEDVISIT,
        message: employeeMessage,
      });

      await this.visitModel.findByIdAndUpdate(visit._id, {
        notificationSent: true,
      });
    }

    return openVisits.length;
  }
}
