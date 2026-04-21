import type { FastifyPluginAsync } from 'fastify';
import { db } from '../../db';
import { saveAudio } from '../../storage';

export const publicRecordingsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /recordings
   * Accepts multipart/form-data:
   *   - audio: audio file (binary)
   *   - respondentId: string
   *   - questionId: string
   *   - speakerRole: "A" | "B"  (default "A")
   *   - isFollowup: "true" | "false"
   *   - solo: "true" | "false"
   *   - durationSec: number (as string)
   */
  fastify.post('/', async (request, reply) => {
    const parts = request.parts();

    const fields: Record<string, string> = {};
    let audioBuffer: Buffer | null = null;
    let audioMimetype = 'audio/webm';

    for await (const part of parts) {
      if (part.type === 'file') {
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) {
          chunks.push(chunk);
        }
        audioBuffer = Buffer.concat(chunks);
        audioMimetype = part.mimetype;
      } else {
        fields[part.fieldname] = part.value as string;
      }
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      return reply.code(400).send({ error: 'MISSING_AUDIO', message: 'No audio data received' });
    }

    const { respondentId, questionId, speakerRole = 'A', isFollowup = 'false', solo = 'true', durationSec } = fields;

    if (!respondentId || !questionId) {
      return reply.code(400).send({ error: 'MISSING_FIELDS', message: 'respondentId and questionId are required' });
    }

    // Look up respondent to get sessionId (needed for storage path)
    const respondent = await db.respondent.findUnique({ where: { id: respondentId } });
    if (!respondent) {
      return reply.code(404).send({ error: 'RESPONDENT_NOT_FOUND' });
    }

    // Determine file extension from MIME type
    const extMap: Record<string, string> = {
      'audio/webm': 'webm',
      'audio/ogg': 'ogg',
      'audio/mp4': 'mp4',
      'audio/mpeg': 'mp3',
      'audio/wav': 'wav',
    };
    const ext = extMap[audioMimetype] ?? extMap[audioMimetype.split(';')[0].trim()] ?? 'webm';

    const audioKey = await saveAudio(
      respondent.sessionId,
      respondentId,
      questionId,
      speakerRole,
      audioBuffer,
      ext,
    );

    const recording = await db.recording.create({
      data: {
        respondentId,
        questionId,
        speakerRole,
        isFollowup: isFollowup === 'true',
        solo: solo === 'true',
        audioKey,
        durationSec: durationSec ? parseInt(durationSec, 10) : null,
        uploadedAt: new Date(),
      },
    });

    return reply.code(201).send(recording);
  });
};
