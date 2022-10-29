export const Shift = {
  Morning: '11-21',
  Noon: '12-22',
  Afternoon: '13-23',
  Close: '14-24',
  Half: '18-23',
};

export const ShiftRequestType = {
  Prefer: 'prefer',
  Available: 'Available',
  NA: 'Not Available',
};

type ShiftKeys = keyof typeof Shift;
export type ShiftValues = typeof Shift[ShiftKeys];

type ShiftRequestTypeKey = keyof typeof ShiftRequestType;
export type ShiftRequestTypeValues =
  typeof ShiftRequestType[ShiftRequestTypeKey];
