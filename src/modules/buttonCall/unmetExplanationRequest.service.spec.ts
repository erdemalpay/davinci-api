import { UnmetExplanationRequestService } from './unmetExplanationRequest.service';
import {
  GameAvailabilityStatus,
  GmCallReasonEnum,
} from './dto/create-buttonCall.dto';

describe('UnmetExplanationRequestService.checkGameAvailability', () => {
  function build(status: GameAvailabilityStatus) {
    const unmetRequestModel = {
      findOneAndUpdate: jest.fn(async () => null),
      create: jest.fn(async () => ({})),
    };
    const service = new UnmetExplanationRequestService(
      unmetRequestModel as never,
      {} as never,
      {
        getGameAvailability: jest.fn(async () => ({ status })),
      } as never,
    );
    return { service, unmetRequestModel };
  }
  const dto = { location: 1, tableName: '5', game: 10 };

  it('records a question nobody can answer now, with its reason', async () => {
    const { service, unmetRequestModel } = build(
      GameAvailabilityStatus.UNAVAILABLE,
    );

    await service.checkGameAvailability({
      ...dto,
      gmCallReason: GmCallReasonEnum.QUESTION,
    });

    expect(unmetRequestModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        game: 10,
        status: GameAvailabilityStatus.UNAVAILABLE,
        gmCallReason: GmCallReasonEnum.QUESTION,
      }),
    );
  });

  it('treats a request without a reason as an explanation', async () => {
    const { service, unmetRequestModel } = build(GameAvailabilityStatus.BUSY);

    await service.checkGameAvailability(dto);

    expect(unmetRequestModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ gmCallReason: GmCallReasonEnum.EXPLANATION }),
    );
  });

  it('records nothing when someone can help now', async () => {
    const { service, unmetRequestModel } = build(
      GameAvailabilityStatus.AVAILABLE,
    );

    await service.checkGameAvailability(dto);

    expect(unmetRequestModel.create).not.toHaveBeenCalled();
  });
});
