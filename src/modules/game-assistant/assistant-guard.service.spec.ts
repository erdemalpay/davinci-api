import { AssistantGuardService } from './assistant-guard.service';

jest.mock('../panelControl/panelControl.service', () => ({
  PanelControlService: class PanelControlService {},
}));

describe('AssistantGuardService', () => {
  const setup = (opts: {
    settings?: {
      isGameAssistantEnabled?: boolean;
      gameAssistantDailyBudgetUsd?: number;
    } | null;
    spentMicroUsd?: number | null;
    counters?: number[];
  }) => {
    const counters = [...(opts.counters ?? [1, 1])];
    const redisService = {
      get: jest.fn().mockResolvedValue(opts.spentMicroUsd ?? null),
      increment: jest
        .fn()
        .mockImplementation(async () => counters.shift() ?? 1),
    };
    const panelControlService = {
      findPanelSettings: jest.fn().mockResolvedValue(opts.settings ?? null),
    };
    const service = new AssistantGuardService(
      redisService as never,
      panelControlService as never,
    );
    return { service, redisService };
  };

  describe('isMeaningless', () => {
    const { service } = setup({});
    it.each(['', '   ', '😀😀', '???', 'https://spam.example.com/x'])(
      'rejects %p',
      (text) => expect(service.isMeaningless(text)).toBe(true),
    );
    it.each(['4 kişiyiz', 'catan gibi', 'hi'])('accepts %p', (text) =>
      expect(service.isMeaningless(text)).toBe(false),
    );
  });

  describe('isAvailable', () => {
    it('is closed when the panel switch is off or missing', async () => {
      expect(await setup({ settings: null }).service.isAvailable()).toBe(false);
      expect(
        await setup({
          settings: { isGameAssistantEnabled: false },
        }).service.isAvailable(),
      ).toBe(false);
    });

    it('is closed when today’s spend reached the budget', async () => {
      const { service } = setup({
        settings: {
          isGameAssistantEnabled: true,
          gameAssistantDailyBudgetUsd: 5,
        },
        spentMicroUsd: 5_000_000,
      });
      expect(await service.isAvailable()).toBe(false);
    });

    it('uses the default budget when the field is missing', async () => {
      const { service } = setup({
        settings: { isGameAssistantEnabled: true },
        spentMicroUsd: 4_999_999,
      });
      expect(await service.isAvailable()).toBe(true);
    });
  });

  describe('isRateLimited', () => {
    it('limits a browser after 30 messages per hour', async () => {
      const { service } = setup({ counters: [31, 1] });
      expect(await service.isRateLimited('client-1', '1.2.3.4')).toBe(true);
    });

    it('limits an IP only after 300 messages per hour', async () => {
      expect(
        await setup({ counters: [1, 300] }).service.isRateLimited('c', 'ip'),
      ).toBe(false);
      expect(
        await setup({ counters: [1, 301] }).service.isRateLimited('c', 'ip'),
      ).toBe(true);
    });
  });

  it('adds spend in micro-dollars to today’s key', async () => {
    const { service, redisService } = setup({});
    await service.addSpend(0.0123456);
    const [key, ttl, by] = redisService.increment.mock.calls[0];
    expect(key).toMatch(/^game-assistant-spend:\d{4}-\d{2}-\d{2}$/);
    expect(ttl).toBe(2 * 24 * 60 * 60);
    expect(by).toBe(12346);
  });
});
