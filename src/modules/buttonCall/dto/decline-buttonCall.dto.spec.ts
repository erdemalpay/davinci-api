import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  DeclineButtonCallDto,
  DeclineReasonEnum,
} from './create-buttonCall.dto';

const errorsFor = (body: object) =>
  validate(plainToInstance(DeclineButtonCallDto, body));

describe('DeclineButtonCallDto', () => {
  it('accepts a listed reason without a note', async () => {
    expect(
      await errorsFor({ reason: DeclineReasonEnum.PREPARING_ORDER }),
    ).toHaveLength(0);
  });

  it('requires a note for "other"', async () => {
    expect(
      await errorsFor({ reason: DeclineReasonEnum.OTHER }),
    ).not.toHaveLength(0);
    expect(
      await errorsFor({ reason: DeclineReasonEnum.OTHER, note: 'Depodayım' }),
    ).toHaveLength(0);
  });

  it('rejects a missing or unknown reason', async () => {
    expect(await errorsFor({})).not.toHaveLength(0);
    expect(await errorsFor({ reason: 'BUSY' })).not.toHaveLength(0);
  });
});
