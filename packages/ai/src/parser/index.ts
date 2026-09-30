import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

import { parseMealText, type ParsedItem } from '@atlas/core';

import { FOOD_EXTRACTION_SYSTEM } from './prompt';
import { aiParsedSchema, type AiParsed } from './schema';

export interface FoodParseResult {
  items: ParsedItem[];
  source: 'ai' | 'rules';
}

/** Superfície mínima do SDK usada aqui (permite um cliente falso nos testes). */
export interface MessagesParseClient {
  messages: Pick<Anthropic['messages'], 'parse'>;
}

export interface FoodParserOptions {
  /** `AI_MODEL_FAST` (ADR-025). Sem modelo: só regras. */
  model?: string | undefined;
  apiKey?: string | undefined;
  timeoutMs?: number;
  client?: MessagesParseClient;
  onError?: (error: unknown) => void;
}

function toParsedItems(parsed: AiParsed): ParsedItem[] {
  return parsed.items
    .filter((i) => i.food_query.trim() !== '' && i.quantity > 0)
    .map((i) => ({
      raw: i.raw,
      foodQuery: i.food_query.trim().toLowerCase(),
      quantity: i.quantity,
      unit: i.unit,
      preparation: i.preparation,
    }));
}

/**
 * Parser de texto de refeição: IA quando configurada, com fallback para regras em
 * falta de chave/modelo, erro, recusa, saída inválida ou timeout (P6.2, ADR-025).
 */
export function createFoodParser(options: FoodParserOptions = {}) {
  const { model, timeoutMs = 4000, onError } = options;
  const client: MessagesParseClient | null =
    options.client ??
    (model && options.apiKey ? new Anthropic({ apiKey: options.apiKey, maxRetries: 0 }) : null);

  const rules = (text: string): FoodParseResult => ({
    items: parseMealText(text),
    source: 'rules',
  });

  return {
    enabled: client !== null && !!model,

    async parse(text: string): Promise<FoodParseResult> {
      if (!client || !model) return rules(text);
      try {
        const response = await client.messages.parse(
          {
            model,
            max_tokens: 2000,
            system: FOOD_EXTRACTION_SYSTEM,
            messages: [{ role: 'user', content: text }],
            output_config: { format: zodOutputFormat(aiParsedSchema) },
          },
          { timeout: timeoutMs },
        );
        if (response.stop_reason !== 'end_turn' || !response.parsed_output) return rules(text);
        const items = toParsedItems(response.parsed_output);
        return items.length > 0 ? { items, source: 'ai' } : rules(text);
      } catch (error) {
        onError?.(error);
        return rules(text);
      }
    },
  };
}

export type FoodParser = ReturnType<typeof createFoodParser>;
