"""
CampusVault P2P - Quick Launcher
Starts the Central Python Server & P2P Tracker
"""

import sys
import subprocess
import os

def main():
    print("=" * 65)
    print(" CampusVault P2P - Computer Networks (CN) University Platform")
    print(" Starting Python Server with Decentralized Socket Core...")
    print("=" * 65)

    base_dir = os.path.dirname(os.path.abspath(__file__))
    server_script = os.path.join(base_dir, "server.py")
    
    try:
        subprocess.run([sys.executable, server_script])
    except KeyboardInterrupt:
        print("\n[*] Server shutdown requested by user.")

if __name__ == "__main__":
    main()
