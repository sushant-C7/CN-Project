"""
CampusVault P2P - Computer Networks Project
Protocol Definitions & Frame Utilities
"""

import json
import struct
import hashlib
from typing import Dict, Any, Tuple, Optional

# Protocol Constants
PROTOCOL_VERSION = "CAMPUS-P2P/1.0"
DEFAULT_CHUNK_SIZE = 64 * 1024  # 64 KB chunks
HEADER_FORMAT = "!I"  # 4-byte unsigned int for frame length

# Packet Message Types
MSG_HANDSHAKE = "HANDSHAKE"
MSG_HANDSHAKE_ACK = "HANDSHAKE_ACK"
MSG_ANNOUNCE_SEED = "ANNOUNCE_SEED"
MSG_QUERY_SWARM = "QUERY_SWARM"
MSG_SWARM_RESPONSE = "SWARM_RESPONSE"
MSG_REQUEST_CHUNK = "REQUEST_CHUNK"
MSG_CHUNK_PAYLOAD = "CHUNK_PAYLOAD"
MSG_INTEGRITY_ALERT = "INTEGRITY_ALERT"
MSG_QUARANTINE_BROADCAST = "QUARANTINE_BROADCAST"
MSG_BAN_BROADCAST = "BAN_BROADCAST"
MSG_HEARTBEAT = "HEARTBEAT"


def compute_sha256(data: bytes) -> str:
    """Compute standard SHA-256 hexadecimal hash string."""
    h = hashlib.sha256()
    h.update(data)
    return h.hexdigest()


def send_frame(sock, message_dict: Dict[str, Any], payload: bytes = b"") -> None:
    """
    Encapsulates a JSON control packet and optional binary payload into a framed network packet:
    [4 Bytes Total Frame Length][JSON Metadata Length (2 Bytes)][JSON Header][Binary Payload]
    """
    json_bytes = json.dumps(message_dict).encode("utf-8")
    json_len = len(json_bytes)
    
    # 2 bytes for json_len, then json_bytes, then payload
    body = struct.pack("!H", json_len) + json_bytes + payload
    frame = struct.pack(HEADER_FORMAT, len(body)) + body
    sock.sendall(frame)


def recv_frame(sock) -> Optional[Tuple[Dict[str, Any], bytes]]:
    """
    Receives and decodes a framed packet from a socket.
    Returns (message_dict, binary_payload) or None on disconnect.
    """
    header = recv_all(sock, 4)
    if not header or len(header) < 4:
        return None
    
    total_len = struct.unpack(HEADER_FORMAT, header)[0]
    body = recv_all(sock, total_len)
    if not body or len(body) < total_len:
        return None
    
    # Extract JSON header length (2 bytes)
    json_len = struct.unpack("!H", body[:2])[0]
    json_bytes = body[2:2 + json_len]
    payload = body[2 + json_len:]
    
    message_dict = json.loads(json_bytes.decode("utf-8"))
    return message_dict, payload


def recv_all(sock, n: int) -> Optional[bytes]:
    """Helper to receive exactly n bytes from a socket."""
    data = bytearray()
    while len(data) < n:
        try:
            packet = sock.recv(n - len(data))
            if not packet:
                return None
            data.extend(packet)
        except Exception:
            return None
    return bytes(data)
