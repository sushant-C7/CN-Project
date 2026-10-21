"""
CampusVault P2P - Computer Networks (CN) University Project
Decentralized Peer-to-Peer File & Notes Sharing Swarm
"""

import os
import json
import time
from typing import Dict, Any, List
from flask import Flask, render_template, request, jsonify, send_file, Response

from p2p_core.tracker import CampusTracker
from p2p_core.peer_node import PeerNode, get_lan_ip
from p2p_core.protocol import compute_sha256

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STORAGE_DIR = os.path.join(BASE_DIR, "storage")
FILES_DIR = os.path.join(STORAGE_DIR, "files")
NOTES_FILE = os.path.join(STORAGE_DIR, "notes_data.json")

os.makedirs(FILES_DIR, exist_ok=True)

app = Flask(__name__, template_folder="templates", static_folder="static")

# Initialize Tracker & Core Peer Server (bind to all interfaces for LAN peer access)
lan_ip = get_lan_ip()
tracker = CampusTracker(host="0.0.0.0", port=8900)
local_peer = PeerNode(node_id="Campus-Hub-01", host="0.0.0.0", port=7001, storage_dir=FILES_DIR)
local_peer.start_server()
tracker.register_peer(local_peer.node_id, lan_ip, local_peer.port, name="Campus Hub Node")


# ==========================================================================
# File Persistence Helpers
# ==========================================================================

def load_json(filepath: str, default: Any) -> Any:
    if os.path.exists(filepath):
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return default


def save_json(filepath: str, data: Any) -> None:
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


# Load shared notes
notes_db: List[Dict[str, Any]] = load_json(NOTES_FILE, [])

# Announce any existing files to tracker and local peer
for n in notes_db:
    sha = n.get("sha256")
    if sha:
        fpath = os.path.join(FILES_DIR, f"{sha}.bin")
        if os.path.exists(fpath):
            with open(fpath, "rb") as f:
                content_bytes = f.read()
            local_peer.add_file(sha, content_bytes)
            tracker.announce_file(sha, local_peer.node_id)


# ==========================================================================
# Web Routes
# ==========================================================================

@app.route("/")
def index():
    return render_template("index.html")


# ==========================================================================
# REST API: Peer Node Status & Network Telemetry
# ==========================================================================

@app.route("/api/node/status", methods=["GET"])
def get_node_status():
    """Returns local peer node identity and connection endpoints."""
    return jsonify({
        "status": "success",
        "node_id": local_peer.node_id,
        "lan_ip": get_lan_ip(),
        "peer_port": local_peer.port,
        "tracker_port": tracker.port,
        "files_hosted": len(local_peer.hosted_files),
        "active_peers": max(1, len(tracker.peers))
    })


@app.route("/api/network/telemetry", methods=["GET"])
def get_telemetry():
    t_data = tracker.get_network_telemetry()
    t_data["total_notes"] = len(notes_db)
    t_data["lan_ip"] = get_lan_ip()
    t_data["node_id"] = local_peer.node_id
    t_data["peer_port"] = local_peer.port
    return jsonify({"status": "success", "telemetry": t_data})


# ==========================================================================
# REST API: Notes Catalog & Filtering
# ==========================================================================

@app.route("/api/notes", methods=["GET"])
def get_notes():
    """
    Search & Multi-Filter Endpoint:
    - search: keyword string
    - course: course code filter
    - professor: professor/instructor filter
    - semester: semester filter
    - topic: topic filter
    - sort: 'seeders' | 'downloads' | 'newest'
    """
    q_search = request.args.get("search", "").lower().strip()
    q_course = request.args.get("course", "").strip()
    q_prof = request.args.get("professor", "").strip()
    q_sem = request.args.get("semester", "").strip()
    q_topic = request.args.get("topic", "").strip()
    q_sort = request.args.get("sort", "newest")

    results = []
    for note in notes_db:
        # Dynamic seeders count from tracker
        sha = note.get("sha256", "")
        seeders_set = tracker.get_seeders(sha)
        note["seeders"] = max(1, len(seeders_set)) if sha in local_peer.hosted_files else len(seeders_set)

        # Search keyword
        if q_search:
            text_pool = f"{note.get('title', '')} {note.get('course', '')} {note.get('professor', '')} {' '.join(note.get('topics', []))} {note.get('description', '')}".lower()
            if q_search not in text_pool:
                continue

        # Filters
        if q_course and note.get("course") != q_course:
            continue
        if q_prof and note.get("professor") != q_prof:
            continue
        if q_sem and note.get("semester") != q_sem:
            continue
        if q_topic:
            topics_lower = [t.lower() for t in note.get("topics", [])]
            cat_lower = note.get("category", "").lower()
            if q_topic.lower() not in topics_lower and q_topic.lower() != cat_lower:
                continue

        results.append(note)

    # Sort
    if q_sort == "seeders":
        results.sort(key=lambda x: x.get("seeders", 0), reverse=True)
    elif q_sort == "downloads":
        results.sort(key=lambda x: x.get("downloads", 0), reverse=True)
    elif q_sort == "newest":
        results.sort(key=lambda x: x.get("id", ""), reverse=True)

    return jsonify({
        "status": "success",
        "count": len(results),
        "notes": results
    })


@app.route("/api/notes/<note_id>", methods=["GET"])
def get_note(note_id):
    note = next((n for n in notes_db if n["id"] == note_id), None)
    if not note:
        return jsonify({"status": "error", "message": "Note not found"}), 404

    # Update real seeders from tracker
    sha = note.get("sha256", "")
    seeders_set = tracker.get_seeders(sha)
    note["seeders"] = max(1, len(seeders_set)) if sha in local_peer.hosted_files else len(seeders_set)
    return jsonify({"status": "success", "note": note})


@app.route("/api/notes/<note_id>", methods=["DELETE"])
def delete_note(note_id):
    """Allow a peer to un-seed and remove a note from local catalog."""
    idx = next((i for i, n in enumerate(notes_db) if n["id"] == note_id), None)
    if idx is None:
        return jsonify({"status": "error", "message": "Note not found"}), 404

    removed = notes_db.pop(idx)
    save_json(NOTES_FILE, notes_db)

    sha = removed.get("sha256")
    if sha:
        local_peer.hosted_files.pop(sha, None)
        if sha in tracker.swarms:
            tracker.swarms[sha].discard(local_peer.node_id)

    return jsonify({"status": "success", "message": f"Note '{removed.get('title')}' removed from swarm"})


@app.route("/api/notes/upload", methods=["POST"])
def upload_note():
    """Upload & Seed note into campus P2P swarm."""
    title = request.form.get("title", "").strip()
    course = request.form.get("course", "").strip()
    professor = request.form.get("professor", "").strip()
    semester = request.form.get("semester", "").strip()
    category = request.form.get("category", "General Notes").strip()
    topics_raw = request.form.get("topics", "").strip()
    description = request.form.get("description", "").strip()
    uploader_node = request.form.get("uploader_node", local_peer.node_id).strip()

    if not title:
        return jsonify({"status": "error", "message": "Document title is required"}), 400

    uploaded_file = request.files.get("file")
    if uploaded_file and uploaded_file.filename:
        file_bytes = uploaded_file.read()
        file_size_bytes = len(file_bytes)
        file_name = uploaded_file.filename
        file_type = file_name.split(".")[-1].upper()
    else:
        file_name = f"{title.replace(' ', '_')}.md"
        content_text = f"# {title}\nCourse: {course or 'General'}\nInstructor: {professor or 'N/A'}\nTerm: {semester or 'Current'}\n\n{description}"
        file_bytes = content_text.encode("utf-8")
        file_size_bytes = len(file_bytes)
        file_type = "MD"

    if file_size_bytes < 1024:
        file_size_str = f"{file_size_bytes} B"
    elif file_size_bytes < 1024 * 1024:
        file_size_str = f"{file_size_bytes / 1024:.1f} KB"
    else:
        file_size_str = f"{file_size_bytes / (1024 * 1024):.1f} MB"

    # Compute cryptographic SHA-256
    file_sha256 = compute_sha256(file_bytes)

    # Save binary payload to storage
    fpath = os.path.join(FILES_DIR, f"{file_sha256}.bin")
    with open(fpath, "wb") as f:
        f.write(file_bytes)

    # Register in local peer node memory and announce to central tracker
    local_peer.add_file(file_sha256, file_bytes)
    tracker.announce_file(file_sha256, uploader_node)

    topics = [t.strip() for t in topics_raw.split(",") if t.strip()] or [category]

    new_note = {
        "id": f"note-{int(time.time() * 1000)}",
        "title": title,
        "course": course or "General",
        "professor": professor or "Self-Study",
        "semester": semester or "Fall 2026",
        "category": category,
        "topics": topics,
        "description": description,
        "fileName": file_name,
        "uploaderNode": uploader_node,
        "sha256": file_sha256,
        "fileSize": file_size_str,
        "fileType": file_type,
        "seeders": 1,
        "downloads": 0,
        "timestamp": time.strftime("%Y-%m-%d %H:%M"),
        "content": description or f"File '{file_name}' hosted via local P2P node {uploader_node}."
    }

    notes_db.insert(0, new_note)
    save_json(NOTES_FILE, notes_db)

    return jsonify({"status": "success", "note": new_note})


# ==========================================================================
# REST API: P2P File Download
# ==========================================================================

@app.route("/api/p2p/download/<note_id>", methods=["GET"])
def download_note(note_id):
    """Download actual file payload verified against SHA-256."""
    note = next((n for n in notes_db if n["id"] == note_id), None)
    if not note:
        return "Note not found", 404

    # Increment download counter
    note["downloads"] = note.get("downloads", 0) + 1
    save_json(NOTES_FILE, notes_db)

    sha = note.get("sha256", "")
    fpath = os.path.join(FILES_DIR, f"{sha}.bin")

    if os.path.exists(fpath):
        fname = note.get("fileName") or f"{note.get('course', 'doc')}_{note['id']}.{note.get('fileType', 'bin').lower()}"
        return send_file(
            fpath,
            as_attachment=True,
            download_name=fname
        )
    else:
        content = note.get("content", "")
        return Response(
            content,
            mimetype="text/markdown",
            headers={"Content-Disposition": f"attachment;filename={note.get('course', 'doc')}_{note['id']}.md"}
        )


if __name__ == "__main__":
    current_lan_ip = get_lan_ip()
    print("=" * 70)
    print(" CampusVault P2P - Computer Networks University Platform")
    print(" Decentralized Peer-to-Peer Academic Notes Swarm")
    print(" Central Tracker: Listening on 0.0.0.0:8900")
    print(f" Local Peer Engine: Listening on 0.0.0.0:7001 (Node: {local_peer.node_id})")
    print(f" LAN IP (auto-detected): {current_lan_ip}")
    print(f" Web Interface: http://{current_lan_ip}:5000  (or http://127.0.0.1:5000)")
    print(f" CLI peers can seed/fetch from: {current_lan_ip}:7001")
    print("=" * 70)
    app.run(host="0.0.0.0", port=5000, debug=False)
