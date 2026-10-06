import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseLiveStations, shouldStartStream, STATION_GROUPS } from "./stations";

test("parseLiveStations keeps named https streams and drops the rest", () => {
  const stations = parseLiveStations({
    live: [
      { id: "ok", name: "Radio One", url: "https://example.com/stream", freq: "89.7", city: "Dar es Salaam", genre: "hits", group: "dar", source: "example" },
      { name: "No url" },
      { name: "Plain http", url: "http://example.com/stream" },
      { url: "https://example.com/other" },
      { name: "Blank", url: "   " },
      "nope",
    ],
  });
  assert.equal(stations.length, 1);
  assert.equal(stations[0]?.id, "live:ok");
  assert.equal(stations[0]?.city, "Dar es Salaam");
  assert.equal(stations[0]?.genre, "hits");
  assert.equal(stations[0]?.group, "dar");
  assert.equal(stations[0]?.source, "example");
});

test("parseLiveStations assigns stable unique ids and ignores unknown labels", () => {
  const stations = parseLiveStations({
    live: [
      { id: "Same!", name: "A", url: "https://a.example/a" },
      { id: "same", name: "B", url: "https://b.example/b", genre: "opera", group: "moon" },
    ],
  });
  assert.deepEqual(stations.map((s) => s.id), ["live:same", "live:same-2"]);
  assert.equal(stations[1]?.genre, undefined);
  assert.equal(stations[1]?.group, undefined);
  assert.equal(stations[0]?.freq, "LIVE");
});

test("parseLiveStations accepts an empty or broken catalog", () => {
  assert.deepEqual(parseLiveStations(null), []);
  assert.deepEqual(parseLiveStations({}), []);
  assert.deepEqual(parseLiveStations({ live: {} }), []);
});

test("shouldStartStream holds a paused station but lets the listener choose another", () => {
  assert.equal(shouldStartStream("follow", true, "live:wasafi-fm", "live:wasafi-fm"), false);
  assert.equal(shouldStartStream("follow", true, "live:wasafi-fm", "live:tbc-taifa"), true);
  assert.equal(shouldStartStream("user", true, "live:wasafi-fm", "live:wasafi-fm"), true);
  assert.equal(shouldStartStream("follow", false, "live:wasafi-fm", "live:wasafi-fm"), true);
});

test("the shipped catalog is https-only, sourced, and covers every group", () => {
  const raw = JSON.parse(readFileSync(new URL("../../public/radio/stations.json", import.meta.url), "utf8")) as unknown;
  const stations = parseLiveStations(raw);
  assert.ok(stations.length >= 8);
  assert.equal(stations.every((s) => s.url.startsWith("https://") && s.source && s.group && s.city), true);
  for (const group of STATION_GROUPS) assert.ok(stations.some((s) => s.group === group), group);
  assert.equal(new Set(stations.map((s) => s.id)).size, stations.length);
});
