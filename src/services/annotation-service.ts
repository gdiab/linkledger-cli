import { AppError } from '../lib/errors.js';
import { createRandomishId } from '../lib/ids.js';
import { nowIso } from '../lib/time.js';
import type { AnnotationType } from '../lib/types.js';
import type { ServiceContext } from './context.js';
import { SearchIndexService } from './search-index-service.js';

export interface AnnotateInput {
  itemId: string;
  type: AnnotationType;
  text: string;
  actor: string;
  confidence?: number;
  pin?: boolean;
}

export class AnnotationService {
  constructor(private readonly context: ServiceContext) {}

  execute(input: AnnotateInput) {
    const item = this.context.itemRepository.findById(input.itemId);
    if (!item) {
      throw new AppError('ITEM_NOT_FOUND', `No item found for id ${input.itemId}`, false);
    }

    const text = input.text.trim();
    if (!text) {
      throw new AppError('INVALID_ANNOTATION', 'Annotation text cannot be empty', false);
    }

    const isAgentActor = input.actor.startsWith('agent:');
    if (isAgentActor && input.confidence === undefined) {
      throw new AppError('CONFIDENCE_REQUIRED', 'Agent annotations require --confidence value between 0 and 1', false);
    }

    if (input.confidence !== undefined && (input.confidence < 0 || input.confidence > 1)) {
      throw new AppError('INVALID_CONFIDENCE', 'Confidence must be between 0 and 1', false);
    }

    const highlightCapRaw = process.env.LINKLEDGER_AGENT_HIGHLIGHT_CAP;
    const highlightCap = highlightCapRaw ? Number.parseInt(highlightCapRaw, 10) : 5;
    if (input.type === 'highlight' && isAgentActor) {
      const highlightCount = this.context.annotationRepository.countHighlightsForItem(input.itemId, 'agent:');
      if (highlightCount >= highlightCap) {
        throw new AppError(
          'HIGHLIGHT_CAP_EXCEEDED',
          `Agent highlight cap reached for item ${input.itemId} (cap=${highlightCap})`,
          false
        );
      }
    }

    const indexService = new SearchIndexService(this.context);

    const tx = this.context.db.transaction(() => {
      const annotation = this.context.annotationRepository.create({
        id: createRandomishId('ann', `${input.itemId}:${input.type}:${text}`),
        itemId: input.itemId,
        type: input.type,
        text,
        actor: input.actor,
        confidence: input.confidence ?? null,
        pinned: input.pin ?? false,
        createdAt: nowIso()
      });

      indexService.syncItem(input.itemId);
      return annotation;
    });

    return tx();
  }
}
