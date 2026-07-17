export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}

export function isDefined<Value>(value: Value | null | undefined): value is Value {
  return value !== null && value !== undefined;
}
