import Anthropic from '@anthropic-ai/sdk';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GAME_ASSISTANT_LIMITS } from './game-assistant.constants';

export const ASSISTANT_LLM = 'ASSISTANT_LLM';

// Testlerde sahtesi verilir; servis SDK'ya doğrudan bağlı değildir.
export interface AssistantLlm {
  createMessage(
    params: Anthropic.MessageCreateParamsNonStreaming,
  ): Promise<Anthropic.Message>;
}

@Injectable()
export class AnthropicAssistantLlm implements AssistantLlm {
  private client?: Anthropic;

  constructor(private readonly configService: ConfigService) {}

  // İstemci ilk istekte kurulur: ANTHROPIC_API_KEY tanımlı değilse uygulama yine
  // açılır, sadece asistan istekleri hata verip sihirbaza yönlendirir.
  private getClient(): Anthropic {
    if (!this.client) {
      const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
      this.client = new Anthropic({
        apiKey,
        timeout: GAME_ASSISTANT_LIMITS.llmTimeoutMs,
        maxRetries: 1,
      });
    }
    return this.client;
  }

  createMessage(
    params: Anthropic.MessageCreateParamsNonStreaming,
  ): Promise<Anthropic.Message> {
    return this.getClient().messages.create(params);
  }
}
