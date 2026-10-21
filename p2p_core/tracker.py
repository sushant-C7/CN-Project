"""
CampusVault P2P - Central Campus Tracker & Swarm Coordinator
Maintains registered campus nodes, active seeders per file hash,
and enforces academic integrity quarantines and actor blacklists.
"""

import time
import threading
import logging
from typing import Dict, Set, List, Any, Optional

logging.basicConfig(level=logging.INFO, format="[TRACKER %(asctime)s] %(levelname)s: %(message)s")


class CampusTracker:
    def __init__(self, host: str = "127.0.0.1", port: int = 8900):
        self.host = host
        self.port = port
        self.lock = threading.RLock()
        
        # Peer Registry: { peer_id: { "ip": str, "port": int, "trust": float, "status": str, "last_seen": float } }
        self.peers: Dict[str, Dict[str, Any]] = {}
        
        # Swarm Map: { file_hash: set(peer_id, ...) }
        self.swarms: Dict[str, Set[str]] = {}
        
        # Quarantined File Hashes: { file_hash: { "reason": str, "timestamp": float } }
        self.quarantined_files: Dict[str, Dict[str, Any]] = {}
        
        # Banned Node IDs: { peer_id: { "reason": str, "timestamp": float } }
        self.banned_actors: Dict[str, Dict[str, Any]] = {}

        # Pre-seed tracker with sample nodes
        self._init_defaults()

    def _init_defaults(self):
        with self.lock:
            # Pre-registered nodes
            self.peers["Node #4092-B"] = {
                "ip": "127.0.0.1",
                "port": 7001,
                "name": "Alex Chen (CS '26)",
                "trust": 99.4,
                "status": "Active",
                "last_seen": time.time()
            }
            self.peers["Node #2104-A"] = {
                "ip": "127.0.0.1",
                "port": 7002,
                "name": "Maya Patel (Bio '25)",
                "trust": 98.7,
                "status": "Active",
                "last_seen": time.time()
            }
            self.peers["Node #7712-C"] = {
                "ip": "127.0.0.1",
                "port": 7003,
                "name": "Liam O'Connor (Math '27)",
                "trust": 95.2,
                "status": "Active",
                "last_seen": time.time()
            }
            self.peers["Node #9948"] = {
                "ip": "127.0.0.1",
                "port": 7004,
                "name": "Student #88219 (Probation)",
                "trust": 32.0,
                "status": "Under Review",
                "last_seen": time.time()
            }
            self.peers["Node #1042"] = {
                "ip": "192.168.1.105",
                "port": 7005,
                "name": "External Proxy",
                "trust": 12.0,
                "status": "Banned",
                "last_seen": time.time()
            }
            self.banned_actors["Node #1042"] = {
                "reason": "Trojan / Keylogger payload injection attempt",
                "timestamp": time.time() - 3600
            }

    def register_peer(self, peer_id: str, ip: str, port: int, name: str = "", trust: float = 90.0) -> bool:
        """Register or update an active peer node in the campus registry."""
        with self.lock:
            if peer_id in self.banned_actors:
                logging.warning(f"Registration rejected for banned peer: {peer_id}")
                return False
            
            if peer_id not in self.peers:
                self.peers[peer_id] = {
                    "ip": ip,
                    "port": port,
                    "name": name or peer_id,
                    "trust": trust,
                    "status": "Active",
                    "last_seen": time.time()
                }
            else:
                self.peers[peer_id].update({
                    "ip": ip,
                    "port": port,
                    "last_seen": time.time()
                })
            logging.info(f"Peer registered/updated: {peer_id} @ {ip}:{port}")
            return True

    def announce_file(self, file_hash: str, peer_id: str) -> bool:
        """A peer announces they are seeding a file hash."""
        with self.lock:
            # Reject if file is quarantined
            if file_hash in self.quarantined_files:
                logging.warning(f"Announce rejected for quarantined file: {file_hash} from {peer_id}")
                return False
            
            # Reject if peer is banned
            if peer_id in self.banned_actors or self.peers.get(peer_id, {}).get("status") == "Banned":
                logging.warning(f"Announce rejected: peer {peer_id} is banned.")
                return False

            if file_hash not in self.swarms:
                self.swarms[file_hash] = set()
            self.swarms[file_hash].add(peer_id)
            logging.info(f"Swarm updated for {file_hash[:12]}: added seeder {peer_id}")
            return True

    def get_seeders(self, file_hash: str) -> List[Dict[str, Any]]:
        """Retrieve list of active, unbanned seeders for a requested file hash."""
        with self.lock:
            if file_hash in self.quarantined_files:
                return []
            
            peer_ids = self.swarms.get(file_hash, set())
            seeders = []
            for pid in peer_ids:
                if pid not in self.banned_actors and pid in self.peers:
                    peer_info = self.peers[pid]
                    if peer_info.get("status") != "Banned":
                        seeders.append({
                            "peer_id": pid,
                            "ip": peer_info["ip"],
                            "port": peer_info["port"],
                            "trust": peer_info["trust"]
                        })
            return seeders

    def quarantine_file(self, file_hash: str, reason: str = "Academic Integrity Violation") -> None:
        """Administrative action: Halt swarm distribution immediately."""
        with self.lock:
            self.quarantined_files[file_hash] = {
                "reason": reason,
                "timestamp": time.time()
            }
            # Purge from active swarms
            if file_hash in self.swarms:
                evicted = len(self.swarms[file_hash])
                self.swarms[file_hash].clear()
                logging.info(f"Quarantined file {file_hash[:12]}: severed {evicted} active seeders.")

    def lift_quarantine(self, file_hash: str) -> None:
        """Administrative action: Restore cleared file to swarm circulation."""
        with self.lock:
            if file_hash in self.quarantined_files:
                del self.quarantined_files[file_hash]
                logging.info(f"Quarantine lifted for file {file_hash[:12]}")

    def ban_actor(self, peer_id: str, reason: str = "Honor Code Violation") -> None:
        """Administrative action: Ban a student / node from the peer mesh."""
        with self.lock:
            self.banned_actors[peer_id] = {
                "reason": reason,
                "timestamp": time.time()
            }
            if peer_id in self.peers:
                self.peers[peer_id]["status"] = "Banned"
                self.peers[peer_id]["trust"] = 0.0

            # Remove peer from all swarms
            for f_hash, seeders in self.swarms.items():
                seeders.discard(peer_id)
            logging.info(f"Peer {peer_id} banned across all campus swarms. Reason: {reason}")

    def reinstate_actor(self, peer_id: str) -> None:
        """Administrative action: Reinstate a student node."""
        with self.lock:
            if peer_id in self.banned_actors:
                del self.banned_actors[peer_id]
            if peer_id in self.peers:
                self.peers[peer_id]["status"] = "Active"
                self.peers[peer_id]["trust"] = 85.0
            logging.info(f"Peer {peer_id} reinstated.")

    def get_network_telemetry(self) -> Dict[str, Any]:
        """Provides real-time network telemetry for dashboard radar and metrics."""
        with self.lock:
            active_count = sum(1 for p in self.peers.values() if p["status"] == "Active")
            total_seeders = sum(len(s) for s in self.swarms.values())
            return {
                "active_nodes": active_count,
                "total_registered_peers": len(self.peers),
                "total_swarms": len(self.swarms),
                "quarantined_count": len(self.quarantined_files),
                "banned_count": len(self.banned_actors),
                "total_seeder_connections": total_seeders,
                "average_trust": round(sum(p["trust"] for p in self.peers.values()) / max(1, len(self.peers)), 1)
            }
