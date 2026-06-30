const autoIncrementPlugin = jest.fn();
const autoIncrementFactory = jest.fn(() => autoIncrementPlugin);

jest.mock('mongoose-sequence', () => autoIncrementFactory);

import { createAutoIncrementConfig } from './autoIncrement';

describe('createAutoIncrementConfig', () => {
  beforeEach(() => {
    autoIncrementPlugin.mockClear();
    autoIncrementFactory.mockClear();
  });

  it('attaches a sequence plugin only once when a schema is registered repeatedly', async () => {
    const schema = {
      plugin: jest.fn((plugin, options) => plugin(schema, options)),
    };
    const connection = {} as never;

    await createAutoIncrementConfig('Gameplay', schema).useFactory(connection);
    await createAutoIncrementConfig('Gameplay', schema).useFactory(connection);

    expect(schema.plugin).toHaveBeenCalledTimes(1);
    expect(autoIncrementPlugin).toHaveBeenCalledWith(schema, {
      id: 'gameplayId',
      inc_field: '_id',
    });
  });
});
