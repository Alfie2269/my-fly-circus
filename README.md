# Fly Circus

A browser-based 3D multiplayer fly simulation. The Node.js server runs the authoritative fly simulation and WebSocket multiplayer relay, serves the client from `public/`, and persists approved world objects in `world.json`.

## Requirements

- Node.js 22 or a compatible modern Node.js release
- npm
- An admin token of at least 16 characters

## Run locally

```bash
npm ci
ADMIN_TOKEN='replace-with-a-long-random-secret' npm start
```

Then open `http://localhost:3000`.

On the Raspberry Pi deployment, keep the admin token in the external systemd environment file (currently `/etc/fly-circus.env`). Do not commit that file, its contents, or the token to this repository.

## Data

- `public/index.html` is the Three.js browser client.
- `server.js` is the Node.js HTTP and WebSocket server.
- `world.json` is runtime persistence for approved world objects. It is created/updated by the server; copy the existing save from the Pi separately if you need to preserve the live world.

## Notes

The browser client currently loads Three.js r128 from cdnjs. The repository snapshot was assembled from files saved in ChatGPT; it may not include later changes or files that exist only on the Raspberry Pi.
