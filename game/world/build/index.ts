import type { ChunkData } from "../format";
import { buildBuildings } from "./buildings";
import { buildRoadSegments, buildWalls } from "./collision";
import { buildGround, buildWater } from "./ground";
import { transferables, type MeshBuffers } from "./writer";

export interface BuiltChunk {
  key: string;
  ground: MeshBuffers | null;
  buildings: MeshBuffers | null;
  water: MeshBuffers | null;
  /** Flat [x, z, kind, scale, ...] in meters. */
  trees: Float32Array;
  /** Building wall segments for collisions. */
  walls: Float32Array;
  /** Road segments for surface queries and the minimap. */
  roads: Float32Array;
}

export const buildChunk = (chunk: ChunkData): BuiltChunk => {
  const trees = new Float32Array(chunk.trees.length);
  for (let i = 0; i < chunk.trees.length; i += 4) {
    trees[i] = chunk.trees[i]! / 10;
    trees[i + 1] = chunk.trees[i + 1]! / 10;
    trees[i + 2] = chunk.trees[i + 2]!;
    trees[i + 3] = chunk.trees[i + 3]! / 10;
  }
  return {
    key: chunk.key,
    ground: buildGround(chunk),
    buildings: buildBuildings(chunk),
    water: buildWater(chunk),
    trees,
    walls: buildWalls(chunk),
    roads: buildRoadSegments(chunk),
  };
};

export const chunkTransferables = (c: BuiltChunk): ArrayBuffer[] => [
  ...transferables(c.ground),
  ...transferables(c.buildings),
  ...transferables(c.water),
  c.trees.buffer as ArrayBuffer,
  c.walls.buffer as ArrayBuffer,
  c.roads.buffer as ArrayBuffer,
];

export type { MeshBuffers };
