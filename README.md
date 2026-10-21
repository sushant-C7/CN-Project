# CampusVault P2P - Computer Networks Project

A decentralized, pure Peer-to-Peer (P2P) file and notes sharing platform written in Python using raw TCP sockets, multi-threading, SHA-256 cryptographic verification, and a minimal Gruvbox web dashboard.

---

## Architecture Overview

```
                      +-------------------+
                      |  Campus Tracker   |
                      |  (Port 8900 TCP)  |
                      +---------+---------+
                                |
             Announcements & Swarm Discovery (JSON / Sockets)
                                |
         +----------------------+----------------------+
         |                                             |
+--------v---------+                         +---------v--------+
|  Peer Node A     | <--- TCP P2P Transfer -> |   Peer Node B    |
|  (Port 7001)     |      (64 KB Chunks)     |   (Port 7002)    |
|  [Seeder/Host]   |      [SHA-256 Check]    |   [Leecher/Peer] |
+------------------+                         +------------------+
```

- **Protocol**: Custom TCP binary framing (`P2P_HEADER` + length-prefixed JSON + payload).
- **Integrity**: Full SHA-256 chunk validation — files are reconstructed in memory/disk only if every chunk hash matches.
- **Multi-Machine LAN Support**: Nodes auto-detect their LAN IP and bind to `0.0.0.0` by default.

---

## Quick Setup

1. **Clone repository**:
   ```bash
   git clone git@github.com:sushant-C7/CN-Project.git
   cd CN-Project
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Start the Hub Server (Web UI + Central Tracker + Seeding Node)**:
   ```bash
   python server.py
   ```
   - **Local Web UI**: `http://127.0.0.1:5000`
   - **LAN Web UI**: `http://<YOUR-LAN-IP>:5000` (printed on startup)
   - **Seeding Socket**: `0.0.0.0:7001`
   - **Tracker**: `0.0.0.0:8900`

---

## CLI Peer Node Usage (`peer_cli.py`)

`peer_cli.py` allows you to run autonomous peer nodes via the command line to seed files, fetch files from other peers, or run independent nodes across multiple machines.

### CLI Arguments Reference

| Flag | Default | Description |
|------|---------|-------------|
| `--node <name>` | `Node-Student-Test` | Custom identifier name for this node |
| `--host <ip>` | `0.0.0.0` | Bind IP address (`0.0.0.0` listens on all interfaces) |
| `--port <int>` | `7002` | TCP port for this node to listen on |
| `--seed-file <path>` | *None* | Path to a file to load, hash with SHA-256, and seed |
| `--fetch-hash <hash>` | *None* | SHA-256 hash of the file you want to download |
| `--peer-ip <ip>` | Auto LAN IP | IP address of the target peer to download from |
| `--peer-port <int>` | `7001` | Port of the target peer to download from |

---

### Scenario 1: Two Computers on the Same Wi-Fi / LAN

#### Step 1: Start the server on Machine 1
```bash
python server.py
```
*Note the printed LAN IP (e.g., `192.168.0.103`).*

#### Step 2: Seed a file from Machine 1 (via Web UI or CLI)
- **Via Web UI**: Open `http://localhost:5000` in browser, click **"Share / Seed File"**, and upload your document. Note the generated SHA-256 hash.
- **Or via CLI**:
  ```bash
  python peer_cli.py --node "Seeder-PC" --port 7001 --seed-file "study_guide.pdf"
  ```

#### Step 3: Download the file from Machine 2
On the second computer, run:
```bash
python peer_cli.py --node "Laptop-Peer" --port 7002 --fetch-hash "<SHA-256-HASH>" --peer-ip 192.168.0.103 --peer-port 7001
```

*Output will show connection handshake, chunk transfer throughput, and cryptographic SHA-256 integrity verification.*

---

### Scenario 2: Single-Machine Testing (Two Terminals)

#### Terminal 1 — Start Seeder Node
```bash
python peer_cli.py --node "Peer-Seeder" --port 7001 --seed-file "test_note.txt"
```
The terminal will display:
```
[+] Loaded file 'test_note.txt'
    SHA-256 Hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    Size: 2450 bytes (2 KB)
[+] Now seeding on 192.168.0.103:7001!
```

#### Terminal 2 — Download File from Seeder
```bash
python peer_cli.py --node "Peer-Leecher" --port 7002 --fetch-hash "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" --peer-ip 127.0.0.1 --peer-port 7001
```

---

### Scenario 3: Run as a Standalone Listening Node
Keep an idle peer node running to participate in the swarm:
```bash
python peer_cli.py --node "Node-Lab-PC" --port 7002
```

---

## Web UI Features (Minimal Gruvbox)

- **Pure P2P**: No centralized admin accounts, no mock users, no fake files. Real files are dynamically announced to the tracker.
- **Flat Gruvbox Aesthetic**: Clean 1px borders, zero gradients, zero glow effects.
- **Dark & Light Modes**: Toggle with one click using the top-right button.
- **Live Swarm Radar**: Real-time canvas visualization of active swarm nodes and seeders.
- **P2P Transfer Simulator**: Displays socket progress and SHA-256 verification before saving files to disk.

---

## Project Structure

```
CN-Project/
├── p2p_core/               # Core Computer Networks networking package
│   ├── __init__.py         # Package exports & get_lan_ip helper
│   ├── protocol.py         # Frame serialization, headers, chunking & SHA-256
│   ├── peer_node.py        # Multi-threaded TCP socket server & client
│   └── tracker.py          # Central swarm coordinator & peer registry
├── static/
│   ├── css/styles.css      # Minimal Gruvbox dark/light stylesheet
│   └── js/app.js           # Frontend client engine (no mock data)
├── templates/
│   └── index.html          # HTML5 single-page application
├── storage/
│   ├── files/              # Seeded binary files (.bin payloads)
│   └── notes_data.json     # Active swarm catalog metadata
├── peer_cli.py             # CLI utility for terminal peer nodes
├── server.py               # Flask web server & tracker runner
├── requirements.txt        # Python dependencies (Flask, etc.)
└── README.md               # Documentation & CLI instructions
```

---

## Troubleshooting

- **Connection Refused / Timeout over LAN**: Ensure Windows Defender Firewall allows incoming connections for Python on ports `5000` (HTTP) and `7001` (TCP). Choose **Allow on Private Networks**.
- **Different Wi-Fi Networks**: Both machines must be on the same local subnet (e.g. `192.168.0.x`). For cross-internet sharing, use [Tailscale](https://tailscale.com) or `ngrok tcp 7001`.
