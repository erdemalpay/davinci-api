import { getConnectionToken } from '@nestjs/mongoose';
import { Connection, Schema } from 'mongoose';
import * as AutoIncrementFactory from 'mongoose-sequence';

const configuredSchemasByConnection = new WeakMap<
  Connection,
  WeakSet<Schema>
>();

export const createAutoIncrementConfig = (name: string, _schema: any) => {
  return {
    name,
    useFactory: async (connection: Connection) => {
      const schema = _schema as Schema;
      let configuredSchemas = configuredSchemasByConnection.get(connection);
      if (!configuredSchemas) {
        configuredSchemas = new WeakSet<Schema>();
        configuredSchemasByConnection.set(connection, configuredSchemas);
      }
      if (configuredSchemas.has(schema)) {
        return schema;
      }

      const AutoIncrement = AutoIncrementFactory(connection);
      schema.plugin(AutoIncrement, {
        id: `${name.toLowerCase()}Id`,
        inc_field: '_id',
      });
      configuredSchemas.add(schema);

      return schema;
    },
    inject: [getConnectionToken()],
  };
};
