"""
CampusVault P2P - Computer Networks (CN) University Project
Central Flask Server & Tracker Integration
"""

import os
import json
import time
import hashlib
from typing import Dict, Any, List
from flask import Flask, render_template, request, jsonify, send_file, send_from_directory, Response

from p2p_core.tracker import CampusTracker
from p2p_core.peer_node import PeerNode
from p2p_core.protocol import compute_sha256

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STORAGE_DIR = os.path.join(BASE_DIR, "storage")
FILES_DIR = os.path.join(STORAGE_DIR, "files")
NOTES_FILE = os.path.join(STORAGE_DIR, "notes_data.json")
ACTORS_FILE = os.path.join(STORAGE_DIR, "actors_data.json")
AUDIT_FILE = os.path.join(STORAGE_DIR, "audit_data.json")

os.makedirs(FILES_DIR, exist_ok=True)

app = Flask(__name__, template_folder="templates", static_folder="static")

# Initialize Tracker & Core Peer Server
tracker = CampusTracker(host="127.0.0.1", port=8900)
local_peer = PeerNode(node_id="Campus-Hub-01", host="127.0.0.1", port=7001, storage_dir=FILES_DIR)
local_peer.start_server()


# ==========================================================================
# Helpers: File Persistence & State
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


# Load initial data
notes_db: List[Dict[str, Any]] = load_json(NOTES_FILE, [])
actors_db: List[Dict[str, Any]] = load_json(ACTORS_FILE, [])
audit_db: List[Dict[str, Any]] = load_json(AUDIT_FILE, [])

# Announce existing clean notes to tracker and compute exact SHA-256
for n in notes_db:
    content_bytes = n.get("content", "").encode("utf-8")
    actual_hash = compute_sha256(content_bytes)
    n["sha256"] = actual_hash  # Ensure exact cryptographic alignment
    if not n.get("quarantined"):
        tracker.announce_file(actual_hash, n["uploader"]["nodeId"])
        local_peer.add_file(actual_hash, content_bytes)


def log_audit(action_type: str, title: str, admin: str, target: str, reason: str, policy_ref: str, hash_val: str = "N/A"):
    entry = {
        "id": f"audit-{int(time.time() * 1000)}",
        "actionType": action_type,
        "title": title,
        "admin": admin,
        "target": target,
        "reason": reason,
        "policyRef": policy_ref,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "hash": hash_val
    }
    audit_db.insert(0, entry)
    save_json(AUDIT_FILE, audit_db)


# ==========================================================================
# Web Routes
# ==========================================================================

@app.route("/")
def index():
    return render_template("index.html")


# ==========================================================================
# REST API: Notes & Filtering
# ==========================================================================

@app.route("/api/notes", methods=["GET"])
def get_notes():
    """
    Search & Multi-Filter Endpoint:
    Query parameters:
    - search: string
    - course: string
    - professor: string
    - semester: string
    - topic: string
    - sort: 'seeders' | 'rating' | 'downloads' | 'newest'
    """
    q_search = request.args.get("search", "").lower().strip()
    q_course = request.args.get("course", "").strip()
    q_prof = request.args.get("professor", "").strip()
    q_sem = request.args.get("semester", "").strip()
    q_topic = request.args.get("topic", "").strip()
    q_sort = request.args.get("sort", "seeders")

    results = []
    for note in notes_db:
        # Search keyword
        if q_search:
            text_pool = f"{note['title']} {note['course']} {note['courseName']} {note['professor']} {' '.join(note.get('topics', []))} {note.get('content', '')}".lower()
            if q_search not in text_pool:
                continue

        # Filters
        if q_course and note["course"] != q_course:
            continue
        if q_prof and note["professor"] != q_prof:
            continue
        if q_sem and note["semester"] != q_sem:
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
    elif q_sort == "rating":
        results.sort(key=lambda x: x.get("rating", 0.0), reverse=True)
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
    return jsonify({"status": "success", "note": note})


@app.route("/api/notes/upload", methods=["POST"])
def upload_note():
    """Upload & Seed note into campus P2P swarm."""
    title = request.form.get("title")
    course = request.form.get("course")
    professor = request.form.get("professor")
    semester = request.form.get("semester")
    category = request.form.get("category", "General Notes")
    topics_raw = request.form.get("topics", "")
    description = request.form.get("description", "")
    uploader_name = request.form.get("uploader_name", "Alex Chen")
    uploader_node = request.form.get("uploader_node", "Node #4092-B")
    
    if not (title and course and professor and semester):
        return jsonify({"status": "error", "message": "Missing required fields"}), 400

    # Check if uploader is banned
    actor = next((a for a in actors_db if a["nodeId"] == uploader_node), None)
    if actor and actor.get("status") == "Banned":
        return jsonify({"status": "error", "message": "Uploader node is banned under Academic Integrity Policy"}), 403

    uploaded_file = request.files.get("file")
    if uploaded_file and uploaded_file.filename:
        file_bytes = uploaded_file.read()
        file_size_str = f"{len(file_bytes) / (1024 * 1024):.1f} MB"
        file_type = uploaded_file.filename.split(".")[-1].upper()
    else:
        file_bytes = f"# {title}\nCourse: {course}\nInstructor: {professor}\nTerm: {semester}\n\n{description}".encode("utf-8")
        file_size_str = "2.4 MB"
        file_type = "PDF"

    # Compute cryptographic SHA-256
    file_sha256 = compute_sha256(file_bytes)

    # Save to disk
    fpath = os.path.join(FILES_DIR, f"{file_sha256}.bin")
    with open(fpath, "wb") as f:
        f.write(file_bytes)

    # Cache in local peer and register with tracker
    local_peer.add_file(file_sha256, file_bytes)
    tracker.announce_file(file_sha256, uploader_node)

    topics = [t.strip() for t in topics_raw.split(",") if t.strip()] or [category]

    new_note = {
        "id": f"note-{int(time.time() * 1000)}",
        "title": title,
        "course": course,
        "courseName": course,
        "professor": professor,
        "semester": semester,
        "category": category,
        "topics": topics,
        "uploader": {
            "name": uploader_name,
            "year": "Student",
            "nodeId": uploader_node,
            "trust": actor["trustScore"] if actor else 95.0
        },
        "sha256": file_sha256,
        "fileSize": file_size_str,
        "pages": 12,
        "fileType": file_type,
        "seeders": 16,
        "downloads": 1,
        "rating": 5.0,
        "upvotes": 1,
        "facultyVerified": True,
        "flagged": false,
        "quarantined": false,
        "content": f"# {title}\n**Course:** {course} | **Instructor:** {professor} | **Term:** {semester}\n*Cryptographically signed by {uploader_name} ({uploader_node})*\n\n---\n\n### Document Overview\n{description}\n\n```text\nSHA-256: {file_sha256}\nCampus Node: {uploader_node}\nVerified Clean under University Honor Policy\n```"
    }

    notes_db.insert(0, new_note)
    save_json(NOTES_FILE, notes_db)

    # Update actor upload count
    if actor:
        actor["uploads"] = actor.get("uploads", 0) + 1
        save_json(ACTORS_FILE, actors_db)

    log_audit("upload", f"New Note Seeded: {title}", f"{uploader_name} ({uploader_node})", course, "Adheres to University Honor Code", "Campus Mesh Protocol", file_sha256)

    return jsonify({"status": "success", "note": new_note})


# ==========================================================================
# REST API: Academic Integrity & Moderation
# ==========================================================================

@app.route("/api/notes/<note_id>/flag", methods=["POST"])
def flag_note(note_id):
    note = next((n for n in notes_db if n["id"] == note_id), None)
    if not note:
        return jsonify({"status": "error", "message": "Note not found"}), 404

    data = request.get_json() or {}
    category = data.get("category", "General Integrity Concern")
    reason = data.get("reason", "Reported by campus user")
    reporter = data.get("reporter", "Student Report")

    note["flagged"] = True
    note["flagDetails"] = {
        "reporter": reporter,
        "category": category,
        "reason": reason,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "riskScore": "HIGH (88%)"
    }
    save_json(NOTES_FILE, notes_db)

    # Penalize uploader
    actor = next((a for a in actors_db if a["nodeId"] == note["uploader"]["nodeId"]), None)
    if actor:
        actor["flagsCount"] = actor.get("flagsCount", 0) + 1
        actor["trustScore"] = max(10.0, round(actor["trustScore"] - 15.0, 1))
        if actor["flagsCount"] >= 2 and actor["status"] == "Active":
            actor["status"] = "Under Review"
        save_json(ACTORS_FILE, actors_db)

    log_audit("flag", f"Academic Violation Reported: {note['title']}", reporter, note["uploader"]["nodeId"], reason, "Academic Integrity § 4.2", note["sha256"])

    return jsonify({"status": "success", "message": "Flag registered"})


@app.route("/api/notes/<note_id>/dismiss", methods=["POST"])
def dismiss_flag(note_id):
    note = next((n for n in notes_db if n["id"] == note_id), None)
    if not note:
        return jsonify({"status": "error", "message": "Note not found"}), 404

    note["flagged"] = False
    note.pop("flagDetails", None)
    save_json(NOTES_FILE, notes_db)

    tracker.lift_quarantine(note["sha256"])
    log_audit("dismiss", f"Flag Dismissed: {note['title']}", "Honor Council Chair", note["uploader"]["nodeId"], "Educational fair-use clearance", "Honor Council Rule § 2.4", note["sha256"])

    return jsonify({"status": "success", "message": "Flag dismissed and file verified clean"})


@app.route("/api/notes/<note_id>/quarantine", methods=["POST"])
def quarantine_note(note_id):
    note = next((n for n in notes_db if n["id"] == note_id), None)
    if not note:
        return jsonify({"status": "error", "message": "Note not found"}), 404

    note["quarantined"] = True
    note["seeders"] = 0
    save_json(NOTES_FILE, notes_db)

    tracker.quarantine_file(note["sha256"], reason="Honor Council Emergency Quarantine")
    log_audit("quarantine", f"Emergency Swarm Quarantine: {note['title']}", "Office of Academic Integrity", note["uploader"]["nodeId"], "Swarm dissemination halted pending committee review", "Campus Security Rule § 7.1", note["sha256"])

    return jsonify({"status": "success", "message": "File quarantined. Swarm propagation suspended."})


@app.route("/api/notes/<note_id>/takedown", methods=["DELETE"])
def takedown_note(note_id):
    idx = next((i for i, n in enumerate(notes_db) if n["id"] == note_id), None)
    if idx is None:
        return jsonify({"status": "error", "message": "Note not found"}), 404

    removed = notes_db.pop(idx)
    save_json(NOTES_FILE, notes_db)

    tracker.quarantine_file(removed["sha256"], reason="Permanent Takedown")
    
    # Penalize uploader actor
    actor = next((a for a in actors_db if a["nodeId"] == removed["uploader"]["nodeId"]), None)
    if actor:
        actor["trustScore"] = max(0.0, round(actor["trustScore"] - 25.0, 1))
        if actor["trustScore"] < 40.0:
            actor["status"] = "Banned"
            tracker.ban_actor(actor["nodeId"], reason="Automatic ban after severe file takedown")
        save_json(ACTORS_FILE, actors_db)

    log_audit("takedown", f"Permanent File Purge: {removed['title']}", "Dean Miller / Provost Board", removed["uploader"]["nodeId"], "Hard takedown ordered. Purged across all campus nodes.", "Univ. Penal Code § 14.1", removed["sha256"])

    return jsonify({"status": "success", "message": "File purged from campus network"})


# ==========================================================================
# REST API: Malicious Actor Governance
# ==========================================================================

@app.route("/api/admin/actors", methods=["GET"])
def get_actors():
    return jsonify({"status": "success", "actors": actors_db})


@app.route("/api/admin/actors/<node_id>/warn", methods=["POST"])
def warn_actor(node_id):
    actor = next((a for a in actors_db if a["nodeId"] == node_id), None)
    if not actor:
        return jsonify({"status": "error", "message": "Actor not found"}), 404

    actor["trustScore"] = max(10.0, round(actor["trustScore"] - 10.0, 1))
    save_json(ACTORS_FILE, actors_db)

    log_audit("warn", f"Honor Code Warning: {actor['name']} ({node_id})", "Academic Integrity Board", node_id, "Formal disciplinary warning recorded in campus dossier", "Honor Code § 3.1")
    return jsonify({"status": "success", "message": f"Warning issued to {actor['name']}"})


@app.route("/api/admin/actors/<node_id>/status", methods=["POST"])
def update_actor_status(node_id):
    data = request.get_json() or {}
    new_status = data.get("status", "Active")

    actor = next((a for a in actors_db if a["nodeId"] == node_id), None)
    if not actor:
        return jsonify({"status": "error", "message": "Actor not found"}), 404

    actor["status"] = new_status
    if new_status == "Banned":
        actor["trustScore"] = min(actor["trustScore"], 10.0)
        tracker.ban_actor(node_id, reason="Administrative mesh ban")
    elif new_status == "Active":
        actor["trustScore"] = max(actor["trustScore"], 85.0)
        tracker.reinstate_actor(node_id)
    save_json(ACTORS_FILE, actors_db)

    log_audit("ban" if new_status == "Banned" else "reinstate", f"Actor Status -> {new_status}: {actor['name']}", "Security Administration", node_id, f"Governance status changed to {new_status}", "Trust Standard § 8.0")
    return jsonify({"status": "success", "message": f"Status updated to {new_status}"})


@app.route("/api/admin/actors/blacklist", methods=["POST"])
def blacklist_actor():
    data = request.get_json() or {}
    node_id = data.get("node_id", "").strip()
    reason = data.get("reason", "Malicious swarm activity")

    if not node_id:
        return jsonify({"status": "error", "message": "Missing node_id"}), 400

    tracker.ban_actor(node_id, reason=reason)

    actor = next((a for a in actors_db if a["nodeId"] == node_id or a["studentId"] == node_id), None)
    if actor:
        actor["status"] = "Banned"
        actor["trustScore"] = 0.0
    else:
        new_actor = {
            "id": f"actor-{int(time.time() * 1000)}",
            "name": f"Blacklisted ({node_id})",
            "studentId": node_id,
            "affiliation": "Restricted Entity",
            "nodeId": node_id if node_id.startswith("Node") else f"Node #{node_id}",
            "trustScore": 0.0,
            "uploads": 0,
            "flagsCount": 1,
            "status": "Banned",
            "ipAddress": "Blocked"
        }
        actors_db.append(new_actor)

    save_json(ACTORS_FILE, actors_db)
    log_audit("ban", f"Manual Blacklist: {node_id}", "Security Enforcement", node_id, reason, "Blacklist Registry")
    return jsonify({"status": "success", "message": f"Node {node_id} added to permanent blacklist"})


@app.route("/api/admin/audit", methods=["GET"])
def get_audit():
    return jsonify({"status": "success", "audit": audit_db})


# ==========================================================================
# REST API: P2P Network Telemetry & Real File Downloads
# ==========================================================================

@app.route("/api/network/telemetry", methods=["GET"])
def get_telemetry():
    t_data = tracker.get_network_telemetry()
    t_data["total_notes"] = len(notes_db)
    t_data["pending_flags"] = sum(1 for n in notes_db if n.get("flagged"))
    return jsonify({"status": "success", "telemetry": t_data})


@app.route("/api/p2p/download/<note_id>", methods=["GET"])
def download_note(note_id):
    note = next((n for n in notes_db if n["id"] == note_id), None)
    if not note:
        return "Note not found", 404

    if note.get("quarantined"):
        return "Access Forbidden: File is quarantined under Academic Honesty Order", 403

    # Increment download counter
    note["downloads"] = note.get("downloads", 0) + 1
    save_json(NOTES_FILE, notes_db)

    # Return file content
    content = f"# CampusVault P2P Academic Exchange\n# Course: {note['course']} ({note['courseName']})\n# Professor: {note['professor']} | Term: {note['semester']}\n# SHA-256 Hash: {note['sha256']}\n\n{note.get('content', '')}"
    return Response(
        content,
        mimetype="text/markdown",
        headers={"Content-Disposition": f"attachment;filename={note['course']}_{note['id']}.md"}
    )


if __name__ == "__main__":
    print("=" * 70)
    print(" CampusVault P2P - Computer Networks (CN) University Platform")
    print(" Decentralized Academic Integrity & Peer Notes Mesh")
    print(" Central Tracker: Listening on 127.0.0.1:8900")
    print(" Local Peer Engine: Listening on 127.0.0.1:7001")
    print(" Web Interface: http://127.0.0.1:5000")
    print("=" * 70)
    app.run(host="127.0.0.1", port=5000, debug=False)
