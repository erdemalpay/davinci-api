import { Model } from 'mongoose';
import { Break } from '../break/break.schema';
import {
  BusyRecord,
  countMiddlemanShares,
  MiddlemanRecord,
  MiddlemanShare,
} from '../buttonCall/buttonCall.assignment';
import { ASSIGNED_CALL_TYPES } from '../buttonCall/dto/create-buttonCall.dto';
import { ButtonCall } from '../buttonCall/schemas/buttonCall.schema';
import { GameplayTime } from '../gameplaytime/gameplaytime.schema';
import { Location } from '../location/location.schema';
import { Shift } from '../shift/shift.schema';
import { Middleman } from './middleman.schema';

// Middleman time (without the time on a call, explaining or busy) and time
// worked in the middleman hours, per person, from `after` up to `before`
// (both "yyyy-MM-dd", inclusive), at every location.
export async function findMiddlemanShares(
  models: {
    middleman: Model<Middleman>;
    shift: Model<Shift>;
    location: Model<Location>;
    buttonCall: Model<ButtonCall>;
    break: Model<Break>;
    gameplayTime: Model<GameplayTime>;
  },
  after: string,
  before: string,
): Promise<Map<string, MiddlemanShare>> {
  const date = { $gte: after, $lte: before };
  const finished = { $exists: true };
  const [records, shifts, locations, calls, breaks, explanations] =
    await Promise.all([
      models.middleman
        .find({ date })
        .select('user location date startHour finishHour coveringFor awayOnCall')
        .lean(),
      models.shift.find({ day: date }).select('day location shifts').lean(),
      models.location.find().select('shifts').lean(),
      models.buttonCall
        .find({
          date,
          type: { $in: ASSIGNED_CALL_TYPES },
          assignedTo: { $exists: true },
          assignedHour: { $exists: true },
          finishHour: finished,
        })
        .select('assignedTo date assignedHour finishHour')
        .lean(),
      models.break
        .find({ date, finishHour: finished })
        .select('user date startHour finishHour')
        .lean(),
      models.gameplayTime
        .find({ date, finishHour: finished })
        .select('user date startHour finishHour')
        .lean(),
    ]);
  const shiftsByLocation = new Map(
    locations.map((l) => [Number(l._id), l.shifts ?? []]),
  );
  const busy: BusyRecord[] = [
    ...calls.map((c) => ({
      user: String(c.assignedTo),
      date: c.date,
      startHour: c.assignedHour,
      finishHour: c.finishHour,
    })),
    ...[...breaks, ...explanations].map((b) => ({
      user: String(b.user),
      date: b.date,
      startHour: b.startHour,
      finishHour: b.finishHour,
    })),
  ];
  return countMiddlemanShares(
    records as unknown as MiddlemanRecord[],
    shifts.map((s) => ({
      day: s.day,
      slots: s.shifts ?? [],
      locationShifts: shiftsByLocation.get(Number(s.location)) ?? [],
    })),
    busy,
  );
}
