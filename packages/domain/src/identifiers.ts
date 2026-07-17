declare const brand: unique symbol;

export type Brand<Value, Name extends string> = Value & {
  readonly [brand]: Name;
};

export type UserId = Brand<string, 'UserId'>;
export type DeviceId = Brand<string, 'DeviceId'>;
export type GoalId = Brand<string, 'GoalId'>;
export type ProjectId = Brand<string, 'ProjectId'>;
export type TaskId = Brand<string, 'TaskId'>;
export type LifeDayId = Brand<string, 'LifeDayId'>;
export type TaskEventId = Brand<string, 'TaskEventId'>;
export type ChangeEventId = Brand<string, 'ChangeEventId'>;
export type JournalEntryId = Brand<string, 'JournalEntryId'>;
export type ReminderId = Brand<string, 'ReminderId'>;
export type OperationId = Brand<string, 'OperationId'>;
export type CorrelationId = Brand<string, 'CorrelationId'>;
