import { Type } from 'class-transformer';
import { IsNumber, IsString, Matches } from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class UserTimelineQueryDto {
  @IsString()
  user: string;

  @Matches(DAY)
  date: string;
}

export class LoadQueryDto {
  @Type(() => Number)
  @IsNumber()
  location: number;

  @Matches(DAY)
  date: string;
}

export class TableTimelineQueryDto {
  @Type(() => Number)
  @IsNumber()
  table: number;
}

export type TimelineKind =
  // Person
  | 'shift'
  | 'visit'
  | 'break'
  | 'middleman'
  | 'tableOpened'
  // Both
  | 'gameplay'
  | 'explanation'
  | 'call'
  | 'order'
  | 'payment';

export type TimelineOrderAction =
  | 'created'
  | 'prepared'
  | 'delivered'
  | 'cancelled';

// What happened to a call, from one person's point of view.
export type TimelineCallOutcome =
  // Assigned or taken over, and closed by them or someone else.
  | 'handled'
  | 'declined'
  // Someone else took it over.
  | 'takenOver'
  // Still theirs (the call is open).
  | 'open'
  // Closed without being assigned to them.
  | 'closed';

export interface TimelineCallHistoryEntry {
  user: string;
  action: string;
  hour: string;
  reason?: string;
  note?: string;
  game?: number;
  fromUser?: string;
}

export interface TimelineOrderLine {
  order: number;
  item: number;
  quantity: number;
  status: string;
  kitchen?: string;
}

// One thing on a timeline, in cafe time ("HH:mm:ss"). `end` for things that
// last (a break, a game, a call); none for moments (an order placed).
export interface TimelineItem {
  kind: TimelineKind;
  start: string;
  end?: string;
  location?: number;
  table?: number;
  tableName?: string;
  // The person (who explained, who took the order...): the other side of
  // the item on a person's timeline, the staff member on a table's.
  user?: string;
  game?: number;
  playerCount?: number;
  // shift
  isServiceStaff?: boolean;
  isMiddleman?: boolean;
  isOutsideOperation?: boolean;
  // break
  breakType?: string;
  note?: string;
  // call
  callId?: number;
  callType?: string;
  gmCallReason?: string;
  callStart?: string;
  callEnd?: string;
  closedBy?: string;
  outcome?: TimelineCallOutcome;
  declineReason?: string;
  history?: TimelineCallHistoryEntry[];
  // order
  orderAction?: TimelineOrderAction;
  orders?: TimelineOrderLine[];
  // payment
  amount?: number;
  paymentMethod?: string;
  cancelled?: boolean;
  cancelledBy?: string;
}

export interface TableTimeline {
  table: {
    _id: number;
    name: string;
    date: string;
    location: number;
    startHour: string;
    finishHour?: string;
    playerCount: number;
    type?: string;
    createdBy?: string;
  };
  items: TimelineItem[];
}

export interface UserTimeline {
  user: string;
  date: string;
  items: TimelineItem[];
}
