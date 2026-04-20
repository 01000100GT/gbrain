/**
 * Embedding Service — v0.14+ thin delegation to src/core/ai/gateway.ts.
 *
 * The gateway handles provider resolution, retry, error normalization, and
 * dimension-parameter passthrough (preserving existing 1536-dim brains).
 */

import {
  embed as gatewayEmbed,
  embedOne as gatewayEmbedOne,
  getEmbeddingModel as gatewayGetModel,
  getEmbeddingDimensions as gatewayGetDims,
} from './ai/gateway.ts';

/** Embed one text. */
export async function embed(text: string): Promise<Float32Array> {
  return gatewayEmbedOne(text);
}

/** Embed a batch of texts. */
export async function embedBatch(texts: string[]): Promise<Float32Array[]> {
  return gatewayEmbed(texts);
}

/** Currently-configured embedding model (short form without provider prefix). */
export function getEmbeddingModelName(): string {
  return gatewayGetModel().split(':').slice(1).join(':') || 'text-embedding-3-large';
}

/** Currently-configured embedding dimensions. */
export function getEmbeddingDimensions(): number {
  return gatewayGetDims();
}

// Back-compat exports for tests that imported these from v0.13 (now evaluate lazily).
export const EMBEDDING_MODEL = 'text-embedding-3-large';
export const EMBEDDING_DIMENSIONS = 1536;
