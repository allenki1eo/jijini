"use client";

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { DM, type CityManifest, type NavGraph } from "./format";

const CLASS_COLORS = ["#FF5A4F", "#FFC72C", "#00A3DD", "#FFF6E5", "#9AA3B5", "#B9714A", "#7D8698"].map((c) => new THREE.Color(c));

const lineMaterial = (opacity: number) =>
  new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity, depthTest: false, fog: false });

/** The AI traffic graph: edges colored by road class, nodes as dots. */
export function NavGraphOverlay({ baseUrl }: { baseUrl: string }) {
  const [graph, setGraph] = useState<NavGraph | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${baseUrl}/navgraph.json`)
      .then((r) => r.json() as Promise<NavGraph>)
      .then((g) => !cancelled && setGraph(g))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [baseUrl]);

  const objects = useMemo(() => {
    if (!graph) return null;
    const positions: number[] = [];
    const colors: number[] = [];
    const y = 0.8;
    for (const e of graph.edges) {
      const pts = [graph.nodes[e.a * 2]!, graph.nodes[e.a * 2 + 1]!, ...(e.p ?? []), graph.nodes[e.b * 2]!, graph.nodes[e.b * 2 + 1]!];
      const c = CLASS_COLORS[e.c] ?? CLASS_COLORS[3]!;
      for (let i = 2; i < pts.length; i += 2) {
        positions.push(pts[i - 2]! / DM, y, pts[i - 1]! / DM, pts[i]! / DM, y, pts[i + 1]! / DM);
        colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
      }
    }
    const lines = new THREE.BufferGeometry();
    lines.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    lines.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    const nodes = new THREE.BufferGeometry();
    const np: number[] = [];
    for (let i = 0; i < graph.nodes.length; i += 2) np.push(graph.nodes[i]! / DM, y, graph.nodes[i + 1]! / DM);
    nodes.setAttribute("position", new THREE.Float32BufferAttribute(np, 3));
    return {
      lines: new THREE.LineSegments(lines, lineMaterial(0.95)),
      nodes: new THREE.Points(nodes, new THREE.PointsMaterial({ color: "#FFFFFF", size: 5, sizeAttenuation: false, depthTest: false, fog: false })),
    };
  }, [graph]);

  useEffect(
    () => () => {
      if (!objects) return;
      for (const o of [objects.lines, objects.nodes]) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    },
    [objects],
  );

  if (!objects) return null;
  return (
    <group renderOrder={20}>
      <primitive object={objects.lines} renderOrder={20} />
      <primitive object={objects.nodes} renderOrder={21} />
    </group>
  );
}

/** Chunk tile outlines: streamed chunks in yellow, the rest faint. */
export function ChunkGridOverlay({ manifest, loadedKeys }: { manifest: CityManifest; loadedKeys: string[] }) {
  const lines = useMemo(() => {
    const loaded = new Set(loadedKeys);
    const s = manifest.chunkSize;
    const positions: number[] = [];
    const colors: number[] = [];
    const on = new THREE.Color("#FFC72C");
    const off = new THREE.Color("#5A6378");
    const y = 1;
    for (const ref of manifest.chunks) {
      const x0 = ref.cx * s + 1;
      const z0 = ref.cz * s + 1;
      const x1 = x0 + s - 2;
      const z1 = z0 + s - 2;
      const c = loaded.has(ref.key) ? on : off;
      positions.push(x0, y, z0, x1, y, z0, x1, y, z0, x1, y, z1, x1, y, z1, x0, y, z1, x0, y, z1, x0, y, z0);
      for (let i = 0; i < 8; i++) colors.push(c.r, c.g, c.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return new THREE.LineSegments(g, lineMaterial(0.9));
  }, [manifest, loadedKeys]);

  useEffect(
    () => () => {
      lines.geometry.dispose();
      (lines.material as THREE.Material).dispose();
    },
    [lines],
  );

  return <primitive object={lines} renderOrder={19} />;
}
