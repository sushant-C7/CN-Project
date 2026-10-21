"""
CampusVault P2P - CLI Peer Node Utility (Computer Networks Project)
Allows running autonomous peer node instances via terminal for live testing,
demonstrations, and Computer Networks laboratory evaluations.

Supports multi-machine P2P over LAN — peers auto-detect their LAN IP
and bind to all interfaces (0.0.0.0) by default.
"""

import sys
import time
import argparse
import logging
from p2p_core.peer_node import PeerNode, get_lan_ip
from p2p_core.protocol import compute_sha256

logging.basicConfig(level=logging.INFO, format="[PEER-CLI %(asctime)s] %(message)s")


def main():
    lan_ip = get_lan_ip()

    parser = argparse.ArgumentParser(description="CampusVault P2P CLI Node Client/Server")
    parser.add_argument("--node", type=str, default="Node-Student-Test", help="Peer identifier name")
    parser.add_argument("--host", type=str, default="0.0.0.0",
                        help="Listening IP address (0.0.0.0 = all interfaces, for multi-machine LAN)")
    parser.add_argument("--port", type=int, default=7002, help="Listening TCP port for seeding")
    parser.add_argument("--seed-file", type=str, help="Path to text or PDF note to seed")
    parser.add_argument("--fetch-hash", type=str, help="SHA-256 hash to fetch from another peer")
    parser.add_argument("--peer-ip", type=str, default=None,
                        help="Target peer IP to download from (default: auto-detect LAN IP)")
    parser.add_argument("--peer-port", type=int, default=7001, help="Target peer port to download from")
    args = parser.parse_args()

    # Default peer-ip to LAN IP (same machine) or user-specified remote IP
    if args.peer_ip is None:
        args.peer_ip = lan_ip

    print("=" * 60)
    print(f" CampusVault P2P Terminal Peer Node: {args.node}")
    print(f" Bind Address: {args.host}:{args.port}")
    print(f" LAN IP (auto-detected): {lan_ip}")
    print(f" Other peers can reach you at: {lan_ip}:{args.port}")
    print("=" * 60)

    node = PeerNode(node_id=args.node, host=args.host, port=args.port)
    node.start_server()

    # If seed-file specified, add to local catalog
    if args.seed_file:
        try:
            with open(args.seed_file, "rb") as f:
                data = f.read()
                file_hash = compute_sha256(data)
                node.add_file(file_hash, data)
                print(f"\n[+] Loaded file '{args.seed_file}'")
                print(f"    SHA-256 Hash: {file_hash}")
                print(f"    Size: {len(data)} bytes ({len(data) // 1024} KB)")
                print(f"[+] Now seeding on {lan_ip}:{node.port}!")
                print(f"\n    >> On the OTHER machine, run:")
                print(f"    python peer_cli.py --fetch-hash \"{file_hash}\" --peer-ip {lan_ip} --peer-port {node.port}")
        except Exception as e:
            print(f"[-] Failed to load seed file: {e}")

    # If fetch-hash specified, connect to target peer and download chunks
    if args.fetch_hash:
        print(f"\n[*] Initiating P2P TCP Chunk Transfer from {args.peer_ip}:{args.peer_port}...")
        print(f"[*] Target SHA-256 Hash: {args.fetch_hash}")
        t0 = time.time()
        file_bytes = node.fetch_file_from_peer(args.peer_ip, args.peer_port, args.fetch_hash)
        elapsed = time.time() - t0

        if file_bytes:
            print(f"\n[✓] SUCCESS: Verified SHA-256 integrity hash!")
            print(f"    Received: {len(file_bytes)} bytes in {elapsed:.3f}s")
            print(f"    Calculated Throughput: {(len(file_bytes) / 1024 / max(0.001, elapsed)):.1f} KB/s")
        else:
            print(f"\n[✗] FAILED: Could not retrieve or verify file from peer.")

    print("\n[*] Peer server running in background. Press Ctrl+C to terminate.")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[*] Stopping peer server...")
        node.stop_server()
        print("[*] Terminated gracefully.")


if __name__ == "__main__":
    main()
