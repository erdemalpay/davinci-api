import { Model } from 'mongoose';
import {
  countMiddlemanShares,
  MiddlemanRecord,
  MiddlemanShare,
} from '../buttonCall/buttonCall.assignment';
import { Location } from '../location/location.schema';
import { Shift } from '../shift/shift.schema';
import { Middleman } from './middleman.schema';

// Middleman days and days worked in the middleman hours, per person, from
// `after` up to `before` (both "yyyy-MM-dd", inclusive), at every location.
export async function findMiddlemanShares(
  models: {
    middleman: Model<Middleman>;
    shift: Model<Shift>;
    location: Model<Location>;
  },
  after: string,
  before: string,
): Promise<Map<string, MiddlemanShare>> {
  const date = { $gte: after, $lte: before };
  const [records, shifts, locations] = await Promise.all([
    models.middleman
      .find({ date })
      .select('user location date startHour finishHour coveringFor awayOnCall')
      .lean(),
    models.shift.find({ day: date }).select('day location shifts').lean(),
    models.location.find().select('shifts').lean(),
  ]);
  const shiftsByLocation = new Map(
    locations.map((l) => [Number(l._id), l.shifts ?? []]),
  );
  return countMiddlemanShares(
    records as unknown as MiddlemanRecord[],
    shifts.map((s) => ({
      day: s.day,
      slots: s.shifts ?? [],
      locationShifts: shiftsByLocation.get(Number(s.location)) ?? [],
    })),
  );
}
