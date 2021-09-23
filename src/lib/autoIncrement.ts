import { getConnectionToken } from '@nestjs/mongoose';
import { Connection, Schema } from 'mongoose';
import * as AutoIncrementFactory from 'mongoose-sequence';

export const createAutoIncrementConfig = (
  name: string,
  _schema: any,
  index = true,
) => {
  // _schema should be strictly typed
  return {
    name,
    useFactory: async (connection: Connection) => {
      const schema = _schema as Schema;
      const AutoIncrement = AutoIncrementFactory(connection);
      schema.plugin(AutoIncrement, {
        id: `${name.toLowerCase()}Id`,
        inc_field: 'id',
      });

      if (index) {
        schema.index({ id: 1 });
      }

      return schema;
    },
    inject: [getConnectionToken()],
  };
};
