// Emitted when someone's availability for game master calls may have
// changed: a break, game explanation or middleman shift started or ended, or
// someone checked in or out of the cafe.
export const STAFF_AVAILABILITY_CHANGED = 'staff.availabilityChanged';

// Emitted when declining a call put someone in a busy state (a break
// record) without going through BreakService.create.
export const BUSY_STATE_STARTED_ON_DECLINE = 'break.busyStateStartedOnDecline';

export interface BusyStateStartedEvent {
  breakRecord: { user: string; location: number; date: string; type: string };
}

// Emitted when a game explanation (gameplay) is added to a table.
export const TABLE_GAMEPLAY_ADDED = 'table.gameplayAdded';

export interface TableGameplayAddedEvent {
  location: number;
  date: string;
  tableName: string;
  // Who explains the game.
  mentor: string;
}
