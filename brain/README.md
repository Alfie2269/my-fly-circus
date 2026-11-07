# FlyWire brain compatibility

Fly Circus can optionally use a **mapped subset of FlyWire connectome connectivity** to influence which need a fly chooses next. The server remains authoritative: all players see the same fly decisions and movement.

## Important distinction

A connectome is a wiring diagram, not a ready-made behaviour simulator. FlyWire does not label neurons as the game's hunger, energy, fun or social drives. You must choose and document the neuron IDs used for each input and output mapping. The runtime propagates simple activity signals through the imported edges; it is an experimental, connectome-informed decision layer, **not a biologically accurate fly-brain simulation**.

## Supported file

Put a compact, curated JSON export at:

`brain/flywire-network.json`

Shape:

```json
{
  "dataset": "FlyWire FAFB",
  "version": "v783",
  "inputs": {
    "hunger": ["INPUT_NEURON_ID"],
    "energy": ["INPUT_NEURON_ID"],
    "fun": ["INPUT_NEURON_ID"],
    "social": ["INPUT_NEURON_ID"]
  },
  "outputs": {
    "hunger": ["OUTPUT_NEURON_ID"],
    "energy": ["OUTPUT_NEURON_ID"],
    "fun": ["OUTPUT_NEURON_ID"],
    "social": ["OUTPUT_NEURON_ID"]
  },
  "edges": [
    { "source": "PRESYNAPTIC_NEURON_ID", "target": "POSTSYNAPTIC_NEURON_ID", "weight": 0.8 }
  ]
}
```

Use string IDs to avoid losing precision with large integer neuron IDs. Weights should be signed, normalised connection strengths. Keep the file to at most 150,000 edges for the current server runtime. A full FlyWire export is much larger and should not be committed to this game repository.

## How it works

1. The server loads `flywire-network.json` on startup.
2. Each fly's need deficits are supplied to the mapped input neurons.
3. The runtime propagates activity across the imported directed edges for two sparse rounds.
4. Mapped output activity contributes to the next need choice.
5. If the file is missing, invalid, or has no usable mappings, the existing needs-based AI continues unchanged.

Only the server needs the connectome file. Browser clients receive the normal authoritative fly snapshots.

## Getting data

Use the official [FlyWire Codex](https://codex.flywire.ai/) and [Virtual Fly Brain download guide](https://virtualflybrain.org/docs/data/download-connectomes/) to select a dataset/version and obtain neuron annotations and connectivity. FlyWire releases and neuron IDs are version-specific. Record the dataset, release, source and licence with your export. Public datasets commonly use CC BY 4.0; retain the required attribution and citation.

The official bulk connection table can be around 1.1 GB, so download only the selected neurons and their relevant connections, then convert them to the compact JSON shape above. Do not put API tokens or private credentials in this file.

## Enable

No package installation is required. Place the prepared file at `brain/flywire-network.json` and restart the service:

```bash
sudo systemctl restart fly-circus
sudo journalctl -u fly-circus -n 50 --no-pager
```

The startup log reports whether the optional brain data loaded. If it does not load, the normal AI fallback is used.
