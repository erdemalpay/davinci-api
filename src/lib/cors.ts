import { CorsOptionsDelegate } from '@nestjs/common/interfaces/external/cors-options.interface';
import * as config from 'config';

export const setCors: CorsOptionsDelegate<Request> = (_req, cb) => {
  if (process.env.NODE_ENV !== 'production') {
    return cb(null, { origin: true, credentials: true });
  }

  const whiteListConfig = config.get('corsWhitelist') as string[];

  return cb(null, {
    origin: (origin, callback) => {
      if (!origin || whiteListConfig.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  });
};
