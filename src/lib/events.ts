// Emitted when someone's availability for game master calls may have
// changed: a break, game explanation or middleman shift started or ended, or
// someone checked in or out of the cafe.
export const STAFF_AVAILABILITY_CHANGED = 'staff.availabilityChanged';

// Emitted when a game explanation (gameplay) is added to a table.
export const TABLE_GAMEPLAY_ADDED = 'table.gameplayAdded';

export interface TableGameplayAddedEvent {
  location: number;
  date: string;
  tableName: string;
  // Who explains the game.
  mentor: string;
}
