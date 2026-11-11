/** The three AI tasks, run against a local model. */
import type { ResumeDoc } from '../types';
import type { AiClient } from './providers';
import { draftAnswerPrompt, parseResumePrompt, tailorPrompt } from './prompts';
import { jsonSchema, readDraftReply, readResumeReply, readTailorReply, ResumeDocSchema, TailorSchema, type TailorReply } from './schema';

type Options = { signal?: AbortSignal; onProgress?: (chars: number) => void };

export async function runTailor(client: AiClient, input: Parameters<typeof tailorPrompt>[0], options: Options = {}): Promise<TailorReply> {
  const reply = await client.chat({ prompt: tailorPrompt(input), schema: jsonSchema(TailorSchema), ...options });
  return readTailorReply(reply);
}

export async function runParseResume(client: AiClient, text: string, options: Options = {}): Promise<ResumeDoc> {
  const reply = await client.chat({ prompt: parseResumePrompt(text), schema: jsonSchema(ResumeDocSchema), ...options });
  return readResumeReply(reply);
}

export async function runDraft(client: AiClient, input: Parameters<typeof draftAnswerPrompt>[0], options: Options = {}): Promise<string> {
  const reply = await client.chat({ prompt: draftAnswerPrompt(input), ...options });
  const text = readDraftReply(reply);
  return input.maxLength && text.length > input.maxLength ? text.slice(0, input.maxLength) : text;
}
