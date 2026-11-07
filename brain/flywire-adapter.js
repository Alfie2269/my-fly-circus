"use strict";

// Optional FlyWire connectome runtime. The game keeps running without a dataset.
// Input format is documented in brain/README.md.
const fs = require("fs");
const path = require("path");

function loadBrain(file = path.join(__dirname, "flywire-network.json")) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!Array.isArray(raw.edges) || !raw.inputs || !raw.outputs) throw new Error("Missing edges, inputs or outputs");
    if (raw.edges.length > 150000) throw new Error("Connectome exceeds the 150,000-edge runtime safety limit");
    const edges = [];
    for (const e of raw.edges) {
      if (!e || e.source == null || e.target == null || !Number.isFinite(e.weight)) continue;
      edges.push({ source: String(e.source), target: String(e.target), weight: Math.max(-2, Math.min(2, e.weight)) });
    }
    const groups = {};
    for (const [name, ids] of Object.entries(raw.outputs)) {
      if (!Array.isArray(ids)) continue;
      groups[name] = ids.map(String);
    }
    const inputs = {};
    for (const [name, ids] of Object.entries(raw.inputs)) {
      if (!Array.isArray(ids)) continue;
      inputs[name] = ids.map(String);
    }
    if (!Object.keys(inputs).length || !Object.keys(groups).length) throw new Error("No usable input/output neuron mappings");
    return { version: raw.version || "unspecified", dataset: raw.dataset || "FlyWire", edges, inputs, outputs: groups };
  } catch (err) {
    if (err.code !== "ENOENT") console.warn("[brain] Connectome not loaded:", err.message);
    return null;
  }
}

function createBrainRuntime(network) {
  if (!network) return null;
  const inputIds = Object.values(network.inputs).flat();
  const outputIds = Object.values(network.outputs).flat();
  const relevant = new Set([...inputIds, ...outputIds]);
  // Keep the imported graph bounded and only retain edges that can be reached
  // from a mapped input or lead directly to a mapped output.
  const edges = network.edges;
  const outgoing = new Map();
  for (const e of edges) {
    if (!outgoing.has(e.source)) outgoing.set(e.source, []);
    outgoing.get(e.source).push(e);
  }
  return {
    dataset: network.dataset,
    version: network.version,
    chooseNeed(needs, previous = {}) {
      const activation = new Map();
      for (const [need, ids] of Object.entries(network.inputs)) {
        const drive = Math.max(0, Math.min(1, (100 - (Number(needs[need]) || 0)) / 100));
        for (const id of ids) activation.set(id, Math.max(activation.get(id) || 0, drive));
      }
      // Two sparse propagation rounds. This is a decision signal, not a
      // biologically faithful whole-brain simulator.
      for (let round = 0; round < 2; round++) {
        const next = new Map(activation);
        for (const [source, value] of activation) {
          if (value <= 0.001) continue;
          for (const edge of outgoing.get(source) || []) {
            const contribution = value * edge.weight;
            next.set(edge.target, Math.max(-1, Math.min(1, (next.get(edge.target) || 0) + contribution)));
          }
        }
        activation.clear();
        for (const [id, value] of next) activation.set(id, Math.max(0, value * 0.72));
      }
      let best = null, bestScore = -Infinity;
      for (const [need, ids] of Object.entries(network.outputs)) {
        if (!ids.length || needs[need] == null) continue;
        const neural = ids.reduce((sum, id) => sum + Math.max(0, activation.get(id) || 0), 0) / ids.length;
        const homeostatic = Math.max(0, (100 - needs[need]) / 100);
        const score = neural + homeostatic * 0.2 + (previous[need] || 0) * 0.03;
        if (score > bestScore) { bestScore = score; best = need; }
      }
      return best;
    }
  };
}

module.exports = { loadBrain, createBrainRuntime };
