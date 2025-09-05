import { ClientSession } from 'mongoose';

export function withSession<T extends object>(
  opts: T,
  session?: ClientSession,
): T {
  return (session ? { ...opts, session } : opts) as T;
}
export type SessionOpts = { session?: ClientSession; deferEmit?: boolean };
