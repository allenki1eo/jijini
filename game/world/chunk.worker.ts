/**
 * Chunk worker: downloads a baked chunk and turns it into transferable
 * geometry buffers so the main thread never parses JSON or triangulates.
 */
import { fetchJson } from "@/lib/fetchJson";
import { buildChunk, chunkTransferables, type BuiltChunk } from "./build";
import type { ChunkData } from "./format";

export interface ChunkRequest {
  id: number;
  url: string;
}

export type ChunkResponse = { id: number; ok: true; chunk: BuiltChunk } | { id: number; ok: false; error: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = async (event: MessageEvent<ChunkRequest>) => {
  const { id, url } = event.data;
  try {
    const chunk = buildChunk(await fetchJson<ChunkData>(url));
    scope.postMessage({ id, ok: true, chunk } satisfies ChunkResponse, chunkTransferables(chunk));
  } catch (error) {
    scope.postMessage({ id, ok: false, error: (error as Error).message } satisfies ChunkResponse);
  }
};
