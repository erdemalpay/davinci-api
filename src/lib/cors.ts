import { CorsOptionsDelegate } from "@nestjs/common/interfaces/external/cors-options.interface";
import * as config from 'config';

export const setCors: CorsOptionsDelegate<Request> = (req, cb) => {
  if (process.env.NODE_ENV !== 'production') {
    return cb(null, { origin: true, credentials: true });
  }

  const whiteListConfig = config.get('corsWhitelist') as string[];

  return cb(null, {
    origin: whiteListConfig.map((host) => new RegExp(host)),
    credentials: true,
  });
};