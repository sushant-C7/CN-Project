"""
CampusVault P2P - Peer Node Socket Engine
Dual Client/Server Architecture:
- Server Component: Listens on dedicated TCP port to seed chunks to peer nodes.
- Client Component: Fetches chunks concurrently from multiple peer seeders,
  verifies cryptographic SHA-256 integrity, and reassembles files.
"""

import os
import socket
import threading
import logging
from typing import Dict, List, Optional
from .protocol import (
    compute_sha256,
    send_frame,
    recv_frame,
    MSG_HANDSHAKE,
    MSG_HANDSHAKE_ACK,
    MSG_REQUEST_CHUNK,
    MSG_CHUNK_PAYLOAD,
    DEFAULT_CHUNK_SIZE
)


def get_lan_ip() -> str:
    """Auto-detect the machine's LAN IP address for multi-machine P2P.
    Falls back to 127.0.0.1 if no network is available."""
    try:
        # Connect to a public DNS to determine which local interface is used
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(2)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

logging.basicConfig(level=logging.INFO, format="[PEER %(asctime)s] %(levelname)s: %(message)s")


class PeerNode:
    def __init__(self, node_id: str, host: str = "0.0.0.0", port: int = 7001, storage_dir: str = "./storage/files"):
        self.node_id = node_id
        self.host = host
        self.port = port
        self.storage_dir = storage_dir
        self.is_running = False
        self.server_sock: Optional[socket.socket] = None
        self.listen_thread: Optional[threading.Thread] = None

        # Hosted files in memory/cache: { file_hash: file_bytes }
        self.hosted_files: Dict[str, bytes] = {}

        os.makedirs(self.storage_dir, exist_ok=True)

    def start_server(self) -> None:
        """Starts multi-threaded TCP listener to serve chunks to other peers."""
        if self.is_running:
            return
        
        self.server_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        
        # Try binding to requested port, or fallback to auto-assigned port if taken
        try:
            self.server_sock.bind((self.host, self.port))
        except OSError:
            logging.warning(f"Port {self.port} occupied, selecting dynamic OS port...")
            self.server_sock.bind((self.host, 0))
            self.port = self.server_sock.getsockname()[1]

        self.server_sock.listen(10)
        self.is_running = True
        
        self.listen_thread = threading.Thread(target=self._listen_loop, daemon=True)
        self.listen_thread.start()
        logging.info(f"PeerNode '{self.node_id}' listening on {self.host}:{self.port}")

    def stop_server(self) -> None:
        """Gracefully closes listening socket."""
        self.is_running = False
        if self.server_sock:
            try:
                self.server_sock.close()
            except Exception:
                pass
        logging.info(f"PeerNode '{self.node_id}' server stopped.")

    def _listen_loop(self) -> None:
        while self.is_running:
            try:
                client_sock, addr = self.server_sock.accept()
                threading.Thread(target=self._handle_client, args=(client_sock, addr), daemon=True).start()
            except Exception:
                break

    def _handle_client(self, client_sock: socket.socket, addr) -> None:
        """Handles incoming peer requests for handshake and file chunks."""
        try:
            while self.is_running:
                packet = recv_frame(client_sock)
                if not packet:
                    break
                header, payload = packet
                msg_type = header.get("type")

                if msg_type == MSG_HANDSHAKE:
                    # Acknowledge handshake
                    send_frame(client_sock, {
                        "type": MSG_HANDSHAKE_ACK,
                        "node_id": self.node_id,
                        "status": "READY"
                    })

                elif msg_type == MSG_REQUEST_CHUNK:
                    file_hash = header.get("file_hash")
                    chunk_idx = header.get("chunk_idx", 0)
                    chunk_size = header.get("chunk_size", DEFAULT_CHUNK_SIZE)

                    data = self.get_file_bytes(file_hash)
                    if not data:
                        send_frame(client_sock, {
                            "type": MSG_CHUNK_PAYLOAD,
                            "file_hash": file_hash,
                            "chunk_idx": chunk_idx,
                            "status": "NOT_FOUND"
                        })
                        continue

                    # Slice chunk
                    start = chunk_idx * chunk_size
                    end = min(len(data), start + chunk_size)
                    chunk_bytes = data[start:end]
                    chunk_hash = compute_sha256(chunk_bytes)

                    send_frame(client_sock, {
                        "type": MSG_CHUNK_PAYLOAD,
                        "file_hash": file_hash,
                        "chunk_idx": chunk_idx,
                        "total_chunks": (len(data) + chunk_size - 1) // chunk_size,
                        "chunk_hash": chunk_hash,
                        "status": "OK"
                    }, payload=chunk_bytes)

        except Exception as e:
            logging.debug(f"Connection with {addr} closed: {e}")
        finally:
            try:
                client_sock.close()
            except Exception:
                pass

    def add_file(self, file_hash: str, data: bytes) -> None:
        """Adds a complete file buffer to this node's seeding catalog."""
        self.hosted_files[file_hash] = data

    def get_file_bytes(self, file_hash: str) -> Optional[bytes]:
        """Looks up file in memory or on local disk."""
        if file_hash in self.hosted_files:
            return self.hosted_files[file_hash]
        
        # Check disk
        fpath = os.path.join(self.storage_dir, f"{file_hash}.bin")
        if os.path.exists(fpath):
            with open(fpath, "rb") as f:
                data = f.read()
                self.hosted_files[file_hash] = data
                return data
        return None

    def fetch_file_from_peer(self, peer_ip: str, peer_port: int, file_hash: str, chunk_size: int = DEFAULT_CHUNK_SIZE) -> Optional[bytes]:
        """
        Connects to a peer via TCP socket, streams chunks, validates SHA-256,
        and returns complete verified file bytes.
        """
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5.0)
        try:
            sock.connect((peer_ip, peer_port))
            
            # Step 1: Handshake
            send_frame(sock, {
                "type": MSG_HANDSHAKE,
                "node_id": self.node_id
            })
            resp = recv_frame(sock)
            if not resp or resp[0].get("type") != MSG_HANDSHAKE_ACK:
                logging.error(f"Handshake failed with {peer_ip}:{peer_port}")
                return None

            # Step 2: Request chunks sequentially
            chunks: List[bytes] = []
            chunk_idx = 0
            total_chunks = 1

            while chunk_idx < total_chunks:
                send_frame(sock, {
                    "type": MSG_REQUEST_CHUNK,
                    "file_hash": file_hash,
                    "chunk_idx": chunk_idx,
                    "chunk_size": chunk_size
                })
                
                chunk_resp = recv_frame(sock)
                if not chunk_resp:
                    logging.error(f"Peer connection dropped while receiving chunk {chunk_idx}")
                    return None
                
                header, chunk_data = chunk_resp
                if header.get("status") != "OK":
                    logging.error(f"Peer returned error for chunk {chunk_idx}: {header.get('status')}")
                    return None
                
                # Verify chunk integrity
                expected_chunk_hash = header.get("chunk_hash")
                if compute_sha256(chunk_data) != expected_chunk_hash:
                    logging.critical(f"INTEGRITY ERROR: Chunk {chunk_idx} SHA-256 mismatch from {peer_ip}:{peer_port}")
                    return None
                
                chunks.append(chunk_data)
                total_chunks = header.get("total_chunks", 1)
                chunk_idx += 1

            # Step 3: Reassemble and verify complete file hash
            full_file = b"".join(chunks)
            if compute_sha256(full_file) != file_hash:
                logging.critical(f"INTEGRITY CORRUPTION: Total file SHA-256 mismatch for {file_hash}")
                return None

            # Cache the verified file
            self.add_file(file_hash, full_file)
            logging.info(f"File {file_hash[:12]} successfully downloaded and SHA-256 verified from {peer_ip}:{peer_port}!")
            return full_file

        except Exception as e:
            logging.error(f"Failed to fetch from peer {peer_ip}:{peer_port} - {e}")
            return None
        finally:
            try:
                sock.close()
            except Exception:
                pass
