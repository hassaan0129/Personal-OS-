import type { Brand } from './identifiers';

export type Revision = Brand<number, 'Revision'>;

export const INITIAL_REVISION = 1 as Revision;
