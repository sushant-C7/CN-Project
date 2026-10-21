# Computer Networks (CN) Academic Project Report
## CampusVault: University Peer-to-Peer Academic Notes & Integrity Exchange

---

### 1. Abstract & Problem Statement
In university environments, students frequently share lecture notes, formula sheets, and study materials over centralized platforms (like Google Drive or Telegram). These centralized systems suffer from single points of failure, excessive external bandwidth usage, and lack native mechanisms to enforce academic honesty or rapidly contain unauthorized exam leaks and malicious payloads.

**CampusVault P2P** is an intra-campus decentralized peer-to-peer file sharing architecture engineered in **Python**. It features:
- Decentralized multi-node peer chunk transfer over TCP sockets.
- Centralized campus tracker coordinator for active peer discovery and swarm health.
- Multi-faceted academic indexing (Course, Professor, Semester, Topic).
- Provost-level Academic Integrity controls (instant swarm quarantine, hard takedown, and malicious node blacklisting).

---

### 2. Network Architecture & OSI Mapping

```
+-------------------------------------------------------------------------+
|                         APPLICATION LAYER                               |
|  Web Dashboard (Flask / Jinja2 / REST API) + Terminal CLI Node          |
|  JSON Framing & Chunk Control Protocol (CAMPUS-P2P/1.0)                 |
+-------------------------------------------------------------------------+
                                    |
+-------------------------------------------------------------------------+
|                         TRANSPORT LAYER                                 |
|  TCP Sockets: Port 8900 (Tracker), Port 7001..7005 (Peer Nodes)         |
|  Reliable Stream Delivery & Flow Control                                |
+-------------------------------------------------------------------------+
                                    |
+-------------------------------------------------------------------------+
|                          NETWORK LAYER                                  |
|  IPv4 Intra-Campus Subnet (e.g. 10.14.x.x / 127.0.0.1 Loopback)         |
+-------------------------------------------------------------------------+
```

#### Node Classification:
1. **Central Tracker (Campus Hub - Port 8900)**:
   - Maintains peer registry `(IP, Port, NodeID, TrustScore)`.
   - Maps file hashes to active seeders `swarms: { file_hash: set(peer_ids) }`.
   - Maintains real-time Quarantine and Blacklist tables.
2. **Peer Nodes (Students & Faculty - Ports 7001..7005)**:
   - **Seeder (Server Role)**: Listens for incoming socket connections and serves 64 KB binary chunks.
   - **Leecher (Client Role)**: Discovers seeders from tracker, opens TCP sockets, requests chunks, validates SHA-256, and reassembles files.

---

### 3. Custom Socket Protocol Specification (`CAMPUS-P2P/1.0`)

All peer-to-peer communication uses binary framed packets over stream-oriented TCP sockets:

```
+-----------------------+---------------------+-------------------+---------------------+
| Total Length (4 bytes)| JSON Len (2 bytes)  | JSON Header Bytes | Binary Chunk Payload|
|  (Big-Endian uint32)  | (Big-Endian uint16) |  (UTF-8 String)   |      (Raw Data)     |
+-----------------------+---------------------+-------------------+---------------------+
```

#### Protocol Message Types:
- `HANDSHAKE`: Node identification and protocol compatibility negotiation.
- `HANDSHAKE_ACK`: Acknowledgement with node status.
- `REQUEST_CHUNK`: Queries chunk index $i$ of file hash $H$ with chunk size $S$ (default 64 KB).
- `CHUNK_PAYLOAD`: Delivers requested chunk with chunk-level SHA-256 hash stamp.
- `QUARANTINE_BROADCAST`: Tracker broadcasts emergency halt on a file hash.
- `BAN_BROADCAST`: Tracker disconnects and blacklists compromised node IDs.

---

### 4. Academic Integrity & Security Model

1. **Cryptographic SHA-256 Authentication**:
   - Each file is cryptographically hashed upon upload: $H = \text{SHA-256}(\text{Data})$.
   - When a peer receives chunks, each chunk is verified individually before reassembly.
   - Corrupted or modified chunks are discarded immediately.
2. **Dynamic Peer Trust Scoring**:
   - Active students maintain reputation trust scores between 0.0% and 100.0%.
   - Clean uploads and active seeding increase score; flagged files and policy breaches decrease trust score.
3. **Administrative Containment (Quarantine vs Takedown)**:
   - **Quarantine**: Freezes peer swarm distribution across tracker tables while maintaining audit logs for committee investigation.
   - **Permanent Takedown**: Hard deletes chunks from disk caches, invalidates swarms, and logs permanent disciplinary penalties.
4. **Node Blacklisting**:
   - Rogue student IDs or external proxy IPs distributing malware or stolen exam keys are permanently banned.

---

### 5. Running the Demonstration

#### A. Launch Central Platform (Flask + Tracker + Peer Engine):
```powershell
python "C:\Users\MSI\.gemini\antigravity-ide\scratch\cn project\server.py"
```
Access the web dashboard in any browser at:
`http://127.0.0.1:5000`

#### B. Launch a Standalone Terminal Peer (For Lab Viva Demo):
Open a new terminal and run:
```powershell
python "C:\Users\MSI\.gemini\antigravity-ide\scratch\cn project\peer_cli.py" --node "Node-StudentB" --port 7002
```

To fetch and verify a note directly over raw TCP sockets:
```powershell
python "C:\Users\MSI\.gemini\antigravity-ide\scratch\cn project\peer_cli.py" --node "Node-StudentB" --port 7002 --fetch-hash 7fa3e9182bb04c5a981de3f40019e0789ab526d18721c456891234bcdafe012a
```
