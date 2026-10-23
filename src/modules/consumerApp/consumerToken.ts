// The customer app's token. It is signed with the panel's JWT_SECRET but
// carries the consumer instead of a user, so JwtStrategy turns it away from
// the panel's routes and only ConsumerAuthGuard / the websocket accept it.
export const CONSUMER_TOKEN_TYPE = 'consumer';
export const CONSUMER_TOKEN_EXPIRES_IN = '30d';

// Marks the customer app's routes (see ConsumerProtected).
export const CONSUMER_PROTECTED_METADATA = 'consumerProtected';

export interface ConsumerTokenPayload {
  type: typeof CONSUMER_TOKEN_TYPE;
  consumer: number;
}

export function isConsumerTokenPayload(
  payload: unknown,
): payload is ConsumerTokenPayload {
  const candidate = payload as Partial<ConsumerTokenPayload> | null;
  return (
    candidate?.type === CONSUMER_TOKEN_TYPE &&
    typeof candidate.consumer === 'number'
  );
}

// The customer app connects to the websocket with { app: CONSUMER_APP }.
export const CONSUMER_APP = 'consumer';

// Websocket rooms: every customer app connection, and one per consumer.
export const CONSUMER_ROOM = 'consumers';
export const consumerRoom = (consumerId: number) => `consumer:${consumerId}`;
