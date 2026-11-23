import Anthropic from '@anthropic-ai/sdk';
import { ASSISTANT_TEXTS } from './game-assistant.constants';
import { GameAssistantService } from './game-assistant.service';
import { CatalogGame } from './game-catalog';

jest.mock('./game-catalog.service', () => ({
  GameCatalogService: class GameCatalogService {},
}));
jest.mock('./assistant-guard.service', () => ({
  AssistantGuardService: class AssistantGuardService {},
}));

const catan: CatalogGame = {
  id: 13,
  name: 'Catan',
  playersMin: 3,
  playersMax: 4,
  best: [4],
  minutesMin: 60,
  minutesMax: 120,
  weight: 2.28,
  minAge: 10,
  styles: ['family'],
  codes: [1],
  popularity: 1930,
  davinciGame: false,
  onlineStoreUrl: null,
};

const usage = { input_tokens: 1000, output_tokens: 100 };
const toolUse = (name: string, input: unknown, id = name): Anthropic.Message =>
  ({
    stop_reason: 'tool_use',
    content: [{ type: 'tool_use', id, name, input }],
    usage,
  } as unknown as Anthropic.Message);
const endTurn = (text: string): Anthropic.Message =>
  ({
    stop_reason: 'end_turn',
    content: [{ type: 'text', text }],
    usage,
  } as unknown as Anthropic.Message);

const dto = (text: string) => ({
  clientId: 'client-123',
  messages: [
    { role: 'assistant' as const, text: 'Size nasıl yardımcı olabiliriz?' },
    { role: 'user' as const, text },
  ],
});

describe('GameAssistantService.chat', () => {
  const setup = (
    replies: Anthropic.Message[] | Error,
    guard: { available?: boolean; limited?: boolean } = {},
  ) => {
    const llm = {
      createMessage: jest.fn().mockImplementation(async () => {
        if (replies instanceof Error) throw replies;
        return replies.shift();
      }),
    };
    const guardService = {
      isAvailable: jest.fn().mockResolvedValue(guard.available ?? true),
      isRateLimited: jest.fn().mockResolvedValue(guard.limited ?? false),
      isMeaningless: jest.fn((t: string) => !/[a-zçğıöşü0-9]/i.test(t)),
      addSpend: jest.fn().mockResolvedValue(undefined),
    };
    const catalogService = {
      getCatalog: jest.fn().mockResolvedValue([catan]),
    };
    const logModel = { create: jest.fn().mockResolvedValue({}) };
    const service = new GameAssistantService(
      logModel as never,
      llm as never,
      catalogService as never,
      guardService as never,
    );
    return { service, llm, guardService, logModel };
  };

  it('runs tools and returns only validated cards', async () => {
    const { service, logModel } = setup([
      toolUse('search_games', { players: 4 }),
      toolUse('show_games', {
        games: [
          { id: 13, reason: 'Klasik' },
          { id: 999, reason: 'x' },
        ],
      }),
      endTurn('Bunu öneririm.'),
    ]);

    const res = await service.chat(dto('4 kişiyiz'), '1.2.3.4');

    expect(res.fallbackToWizard).toBe(false);
    expect(res.games.map((g) => g.id)).toEqual([13]);
    expect(res.text).toBe('Bunu öneririm.');
    expect(logModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ shownGameIds: [13], unanswered: false }),
    );
  });

  it('stops the loop after the tool call limit', async () => {
    const { service, llm } = setup(
      Array.from({ length: 10 }, (_, i) =>
        toolUse('search_games', {}, `t${i}`),
      ),
    );

    const res = await service.chat(dto('oyun'), 'ip');

    expect(llm.createMessage).toHaveBeenCalledTimes(5);
    expect(res.fallbackToWizard).toBe(false);
  });

  it('does not call the model for meaningless or too long messages', async () => {
    const { service, llm } = setup([]);
    expect((await service.chat(dto('😀😀'), 'ip')).text).toBe(
      ASSISTANT_TEXTS.offTopic,
    );
    expect((await service.chat(dto('a'.repeat(301)), 'ip')).text).toBe(
      ASSISTANT_TEXTS.tooLong,
    );
    expect(llm.createMessage).not.toHaveBeenCalled();
  });

  it('falls back to the wizard when closed, on errors and on refusals', async () => {
    expect(
      (await setup([], { available: false }).service.chat(dto('a'), 'ip'))
        .fallbackToWizard,
    ).toBe(true);
    expect(
      (await setup(new Error('boom')).service.chat(dto('a'), 'ip'))
        .fallbackToWizard,
    ).toBe(true);
    const refusal = {
      stop_reason: 'refusal',
      content: [],
      usage,
    } as unknown as Anthropic.Message;
    expect(
      (await setup([refusal]).service.chat(dto('a'), 'ip')).fallbackToWizard,
    ).toBe(true);
  });

  it('answers rate limited users without calling the model', async () => {
    const { service, llm } = setup([], { limited: true });
    const res = await service.chat(dto('4 kişiyiz'), 'ip');
    expect(llm.createMessage).not.toHaveBeenCalled();
    expect(res.text).toBe(ASSISTANT_TEXTS.rateLimited);
  });

  it('records spend from token usage', async () => {
    const { service, guardService } = setup([endTurn('Merhaba')]);
    await service.chat(dto('selam'), 'ip');
    // 1000 girdi x 0.10 + 100 çıktı x 0.50, milyon token başına
    expect(guardService.addSpend).toHaveBeenCalledWith(0.00015);
  });

  it('sends the shown games so "the first one" can be resolved', async () => {
    const { service, llm } = setup([endTurn('Catan...')]);
    await service.chat({ ...dto('ilkini anlat'), shownGameIds: [13] }, 'ip');
    const params = llm.createMessage.mock.calls[0][0];
    const last = params.messages[params.messages.length - 1];
    expect(JSON.stringify(last.content)).toContain('1) Catan (13)');
  });

  it('starts the model conversation with the first user message', async () => {
    const { service, llm } = setup([endTurn('ok')]);
    await service.chat(dto('selam'), 'ip');
    expect(llm.createMessage.mock.calls[0][0].messages[0].role).toBe('user');
  });
});
