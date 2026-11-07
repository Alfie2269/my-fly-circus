# Fly Circus

A browser-based 3D multiplayer fly simulation. The Node.js server runs the authoritative fly simulation, relays players over WebSockets, serves the browser client from `public/`, and persists approved world objects in `world.json`.

Repository: [Alfie2269/my-fly-circus](https://github.com/Alfie2269/my-fly-circus)

## Requirements

- Raspberry Pi OS / Debian / Ubuntu, or another Linux system
- Node.js 22 or newer and npm
- Git
- An admin token (at least 16 characters)
- Internet access from the browser for the Three.js CDN dependency

The instructions below use the Raspberry Pi account `solver` and install the project at `/home/solver/fly-circus-server`. Change those paths if your account or install directory is different.

## 1. Install system packages

Update the operating system and install Git, curl, and OpenSSL:

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y curl git ca-certificates openssl
```

Install Node.js 22:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

Check the installed versions:

```bash
node --version
npm --version
git --version
```

Node should report version 22 or newer.

## 2. Download the project

Clone the repository:

```bash
cd /home/solver
git clone https://github.com/Alfie2269/my-fly-circus.git fly-circus-server
cd /home/solver/fly-circus-server
```

If the folder already exists, update it instead:

```bash
cd /home/solver/fly-circus-server
git pull
```

Install the exact dependency versions from the lock file:

```bash
npm ci
```

## 3. Create the admin token

The server refuses to start unless `ADMIN_TOKEN` contains at least 16 characters. Generate a random 64-character token and store it outside the repository:

```bash
sudo bash -c 'umask 077; printf "ADMIN_TOKEN=%s\\n" "$(openssl rand -hex 32)" > /etc/fly-circus.env'
sudo chmod 600 /etc/fly-circus.env
```

To display the token when you need to sign in as the administrator:

```bash
sudo cat /etc/fly-circus.env
```

Keep this value private. Do not paste it into source files, commit it to Git, or share it with players.

## 4. Test-run the server

From the project directory:

```bash
cd /home/solver/fly-circus-server
set -a
. /etc/fly-circus.env
set +a
PORT=3000 npm start
```

The server should print:

```text
Fly Circus on :3000
```

Open the site from a browser on the Pi at `http://localhost:3000`, or from another device on the same network using the Pi's LAN IP address:

```bash
hostname -I
```

For example, if the Pi's address is `192.168.1.50`, visit `http://192.168.1.50:3000`.

Stop the test server with `Ctrl+C` before setting up the background service.

## 5. Run automatically with systemd

Create a systemd service so Fly Circus starts on boot and restarts if Node exits:

```bash
sudo tee /etc/systemd/system/fly-circus.service > /dev/null <<'EOF'
[Unit]
Description=Fly Circus multiplayer server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=solver
WorkingDirectory=/home/solver/fly-circus-server
EnvironmentFile=/etc/fly-circus.env
Environment=PORT=3000
ExecStart=/usr/bin/node /home/solver/fly-circus-server/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
```

Enable and start it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now fly-circus
```

Check its status and logs:

```bash
sudo systemctl status fly-circus
sudo journalctl -u fly-circus -f
```

Useful service commands:

```bash
sudo systemctl restart fly-circus
sudo systemctl stop fly-circus
sudo systemctl start fly-circus
sudo systemctl disable fly-circus
```

## 6. Updating the server

Back up the saved world, pull the latest code, install dependencies, and restart:

```bash
cd /home/solver/fly-circus-server
sudo systemctl stop fly-circus
cp -a world.json "world.json.backup.$(date +%Y%m%d-%H%M%S)" 2>/dev/null || true
git pull
npm ci
sudo systemctl start fly-circus
sudo systemctl status fly-circus
```

If you make local code changes that you want to keep, commit or back them up before running `git pull`.

## 7. Back up and restore the world

The server stores approved world objects in `world.json` in the project directory. The file is generated when the server saves world changes; it may not exist until something has been approved.

Create a backup:

```bash
cd /home/solver/fly-circus-server
sudo systemctl stop fly-circus
cp -a world.json "world.json.backup.$(date +%Y%m%d-%H%M%S)"
sudo systemctl start fly-circus
```

Restore a backup (replace the example filename with the backup you want):

```bash
sudo systemctl stop fly-circus
cp -a world.json.backup.YYYYMMDD-HHMMSS world.json
sudo chown solver:solver world.json
sudo systemctl start fly-circus
```

To preserve a world when moving to another installation, copy `world.json` into the new project directory before starting the server.

## 8. Network access

The server listens on the port set by `PORT` (3000 by default) and serves both the website and WebSocket connection on that same port.

- **Same Wi-Fi/LAN:** visit `http://PI_LAN_IP:3000` from another device.
- **Private remote access:** use a private VPN such as Tailscale on the Pi and the devices that should connect. Visit `http://PI_TAILSCALE_IP:3000`.
- **Public access:** only expose the service through a properly configured tunnel or reverse proxy. Use HTTPS, keep the admin token private, and do not expose SSH or other Pi services as part of this setup.

Do not assume that changing the website URL or opening a browser tab keeps a tunnel running; run the tunnel as its own managed service if you use one.

## 9. Troubleshooting

Check whether the service is running:

```bash
sudo systemctl status fly-circus
```

View recent logs:

```bash
sudo journalctl -u fly-circus -n 100 --no-pager
```

Check whether port 3000 is listening:

```bash
sudo ss -ltnp | grep ':3000'
```

Check Node and npm:

```bash
node --version
npm --version
```

If the log says `Set ADMIN_TOKEN to 16+ characters.`, check that the environment file exists and contains a valid token:

```bash
sudo cat /etc/fly-circus.env
sudo chmod 600 /etc/fly-circus.env
sudo systemctl restart fly-circus
```

If port 3000 is already in use, find the process:

```bash
sudo ss -ltnp | grep ':3000'
```

Change `Environment=PORT=3000` in the systemd service and use the same new port in the browser URL, then reload systemd and restart:

```bash
sudo systemctl daemon-reload
sudo systemctl restart fly-circus
```

## Project files

- `server.js` — HTTP server, WebSocket multiplayer, fly simulation, admin approval checks, and world persistence.
- `public/index.html` — Three.js browser client.
- `package.json` and `package-lock.json` — Node.js project metadata and dependency lock.
- `world.json` — runtime world save, created by the server when it saves approved objects. It is not included in the Git repository by default.
- `/etc/fly-circus.env` — server-side admin token; intentionally kept outside the repository.

## Security and repository notes

- Never commit `/etc/fly-circus.env`, `.env`, admin tokens, or other credentials.
- The admin check is performed by the server, not just by the browser.
- The server currently accepts up to 30 connected players and limits incoming messages.
- The browser client loads Three.js r128 from cdnjs.
- This repository contains the project snapshot committed here. Files or world data that exist only on another machine must be copied separately.
