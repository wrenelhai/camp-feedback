/**
 * Transcription pipeline — OpenAI gpt-4o-transcribe + Claude redaction.
 * The TranscriptionProvider interface makes it easy to swap in a different
 * provider (e.g. self-hosted Whisper) later.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { config } from './config';

// ── Provider interface ────────────────────────────────────────────────────────

export interface TranscriptionProvider {
  transcribe(audioBuffer: Buffer, mimeType: string): Promise<string>;
}

// ── OpenAI implementation ─────────────────────────────────────────────────────

export class OpenAITranscriptionProvider implements TranscriptionProvider {
  async transcribe(audioBuffer: Buffer, mimeType: string): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const OpenAI = require('openai').default ?? require('openai');
    const client = new OpenAI({ apiKey: config.OPENAI_API_KEY });

    // Write buffer to a temp file — the OpenAI SDK needs a readable stream with a filename
    const ext = mimeType.split('/')[1]?.split(';')[0] ?? 'webm';
    const tmpPath = path.join(os.tmpdir(), `transcribe-${Date.now()}.${ext}`);
    fs.writeFileSync(tmpPath, audioBuffer);

    try {
      const response = await client.audio.transcriptions.create({
        model: 'gpt-4o-transcribe',
        file: fs.createReadStream(tmpPath),
        response_format: 'text',
      });
      return typeof response === 'string' ? response : response.text;
    } finally {
      fs.unlinkSync(tmpPath);
    }
  }
}

// ── Claude redaction pass ─────────────────────────────────────────────────────

export async function redactTranscript(transcript: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Anthropic = require('@anthropic-ai/sdk').default ?? require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: `You are a privacy assistant. Redact the following transcript from a music camp feedback interview.

Rules:
- Replace last names with [LAST NAME] unless the person is clearly a named instructor or staff member
- Replace phone numbers with [PHONE]
- Replace email addresses with [EMAIL]
- Replace any other clearly personal identifying information (home addresses, ID numbers) with [REDACTED]
- Do NOT redact first names, nicknames, or general place names
- Return ONLY the redacted transcript text with no explanation or preamble

Transcript:
${transcript}`,
      },
    ],
  });

  const block = message.content[0];
  if (block.type !== 'text') throw new Error('Unexpected response type from Claude');
  return block.text.trim();
}

// ── Default provider singleton ────────────────────────────────────────────────

let _provider: TranscriptionProvider | null = null;

export function getTranscriptionProvider(): TranscriptionProvider {
  if (!_provider) _provider = new OpenAITranscriptionProvider();
  return _provider;
}
