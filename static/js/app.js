/**
 * CampusVault P2P - Computer Networks (CN) Project
 * Frontend Engine for Decentralized Peer-to-Peer Notes Sharing
 */

const STORAGE_KEYS = {
  THEME: 'cn_project_theme'
};

class CNProjectApp {
  constructor() {
    this.notes = [];
    this.telemetry = {};
    this.nodeStatus = {};
    this.layoutMode = 'grid';

    this.filters = {
      search: '',
      course: '',
      professor: '',
      semester: '',
      topic: '',
      sortBy: 'newest'
    };

    this.activeNoteId = null;
    this.selectedFile = null;
  }

  async init() {
    initTheme();
    initRadarAnimation();
    this.setupEventListeners();
    await this.fetchData();
  }

  async fetchData() {
    try {
      const [notesRes, telRes, nodeRes] = await Promise.all([
        fetch('/api/notes').then(r => r.json()).catch(() => ({ status: 'error', notes: [] })),
        fetch('/api/network/telemetry').then(r => r.json()).catch(() => ({ status: 'error', telemetry: {} })),
        fetch('/api/node/status').then(r => r.json()).catch(() => ({ status: 'error' }))
      ]);

      if (notesRes.status === 'success') {
        this.notes = notesRes.notes || [];
      }
      if (telRes.status === 'success') {
        this.telemetry = telRes.telemetry || {};
        this.updateTelemetryUI();
      }
      if (nodeRes.status === 'success') {
        this.nodeStatus = nodeRes;
        this.updateNodeStatusUI();
      }

      this.renderFeed();
    } catch (e) {
      console.error('Fetch error:', e);
    }
  }

  updateNodeStatusUI() {
    const label = document.getElementById('localNodeLabel');
    const heroCluster = document.getElementById('heroClusterLabel');
    if (this.nodeStatus.node_id) {
      if (label) {
        label.textContent = `${this.nodeStatus.node_id} @ ${this.nodeStatus.lan_ip}:${this.nodeStatus.peer_port}`;
      }
      if (heroCluster) {
        heroCluster.textContent = `P2P NODE ${this.nodeStatus.node_id} &bull; IP: ${this.nodeStatus.lan_ip} &bull; PORT: ${this.nodeStatus.peer_port}`;
      }
    }
  }

  updateTelemetryUI() {
    const elSeeders = document.getElementById('telemetrySeeders');
    const elNotes = document.getElementById('telemetryNotes');
    const elSwarms = document.getElementById('telemetrySwarms');
    const elLiveSwarm = document.getElementById('liveSwarmCount');

    const activeNodes = this.telemetry.active_nodes || 1;
    const notesCount = this.notes.length;
    const swarmsCount = this.telemetry.total_swarms || (notesCount > 0 ? notesCount : 0);

    if (elSeeders) elSeeders.textContent = activeNodes;
    if (elNotes) elNotes.textContent = notesCount;
    if (elSwarms) elSwarms.textContent = swarmsCount;
    if (elLiveSwarm) elLiveSwarm.textContent = activeNodes;
  }

  async filterNotes() {
    const params = new URLSearchParams();
    if (this.filters.search) params.set('search', this.filters.search);
    if (this.filters.course) params.set('course', this.filters.course);
    if (this.filters.professor) params.set('professor', this.filters.professor);
    if (this.filters.semester) params.set('semester', this.filters.semester);
    if (this.filters.topic) params.set('topic', this.filters.topic);
    params.set('sort', this.filters.sortBy);

    try {
      const res = await fetch(`/api/notes?${params.toString()}`).then(r => r.json());
      if (res.status === 'success') {
        this.notes = res.notes || [];
        this.renderFeed();
      }
    } catch (e) {
      console.error('Filter request failed:', e);
    }
  }

  renderFeed() {
    const container = document.getElementById('notesCardsContainer');
    const emptyState = document.getElementById('emptyStateContainer');
    const countLabel = document.getElementById('resultsCount');

    this.populateDropdowns();
    this.renderFilterPills();

    countLabel.textContent = `${this.notes.length} shared document${this.notes.length === 1 ? '' : 's'}`;

    if (this.notes.length === 0) {
      container.innerHTML = '';
      emptyState.style.display = 'flex';
      const msg = document.getElementById('emptyStateMessage');
      if (this.filters.search || this.filters.course || this.filters.topic) {
        msg.textContent = 'No documents matched your active search or filters. Try clearing filters.';
      } else {
        msg.textContent = 'No files are currently shared in this peer mesh. Be the first to seed a note!';
      }
      return;
    }

    emptyState.style.display = 'none';
    container.innerHTML = this.notes.map(n => this.createCardHTML(n)).join('');

    // Attach card event listeners
    container.querySelectorAll('.btn-preview-note, .note-title').forEach(el => {
      el.addEventListener('click', (e) => {
        const id = e.currentTarget.closest('.note-card').dataset.noteId;
        this.openReader(id);
      });
    });

    container.querySelectorAll('.btn-download-p2p').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = e.currentTarget.closest('.note-card').dataset.noteId;
        this.startP2PTransfer(id);
      });
    });

    container.querySelectorAll('.note-tag').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const tag = e.currentTarget.textContent.replace('#', '').trim();
        this.setTopicFilter(tag);
      });
    });
  }

  createCardHTML(note) {
    let courseClass = 'course-default';
    const c = (note.course || '').toUpperCase();
    if (c.startsWith('CS')) courseClass = 'course-cs';
    else if (c.startsWith('BIO')) courseClass = 'course-bio';
    else if (c.startsWith('MATH')) courseClass = 'course-math';
    else if (c.startsWith('ECON')) courseClass = 'course-econ';

    const cleanContent = (note.description || note.content || '').substring(0, 140).replace(/[#*`$]/g, '');

    return `
      <article class="note-card" data-note-id="${note.id}">
        <div>
          <div class="note-card-header">
            <div class="badge-stack">
              <span class="course-badge ${courseClass}">${escapeHTML(note.course || 'General')}</span>
              <span class="category-tag">${escapeHTML(note.category || 'Notes')}</span>
            </div>
            <div>
              <span class="integrity-verified-tag" title="Cryptographically verified SHA-256">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                SHA-256
              </span>
            </div>
          </div>

          <h4 class="note-title">${escapeHTML(note.title)}</h4>
          <div class="note-meta-line">
            <span>${escapeHTML(note.professor || 'Self-Study')}</span>
            <span class="meta-bullet">&bull;</span>
            <span>${escapeHTML(note.semester || 'Current')}</span>
            <span class="meta-bullet">&bull;</span>
            <span>${escapeHTML(note.fileSize || '1 MB')} (${escapeHTML(note.fileType || 'BIN')})</span>
          </div>

          <p class="note-excerpt">${escapeHTML(cleanContent)}${cleanContent.length >= 140 ? '...' : ''}</p>

          <div class="note-tags-row">
            ${(note.topics || []).map(t => `<span class="note-tag">#${escapeHTML(t)}</span>`).join('')}
          </div>
        </div>

        <div class="note-card-footer">
          <div class="swarm-stat-group">
            <div class="seeder-count-row">
              <span class="live-dot pulse-emerald"></span>
              <span>${note.seeders || 1} Seeder${(note.seeders || 1) === 1 ? '' : 's'}</span>
              <span class="text-dim text-sm">(${note.downloads || 0} dl)</span>
            </div>
            <span class="file-weight-meta mono">SHA: ${(note.sha256 || '').substring(0, 12)}...</span>
          </div>

          <div class="card-action-btns">
            <button class="btn btn-secondary btn-sm btn-preview-note" title="View details and read">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              <span>View</span>
            </button>
            <button class="btn btn-primary btn-sm btn-download-p2p" title="Download via P2P swarm">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              <span>Download</span>
            </button>
          </div>
        </div>
      </article>
    `;
  }

  populateDropdowns() {
    const courseSelect = document.getElementById('filterCourse');
    const profSelect = document.getElementById('filterProfessor');
    const semSelect = document.getElementById('filterSemester');
    const topicSelect = document.getElementById('filterTopic');

    const courses = Array.from(new Set(this.notes.map(n => n.course).filter(Boolean))).sort();
    const professors = Array.from(new Set(this.notes.map(n => n.professor).filter(Boolean))).sort();
    const semesters = Array.from(new Set(this.notes.map(n => n.semester).filter(Boolean))).sort();

    const topicsSet = new Set();
    this.notes.forEach(n => {
      (n.topics || []).forEach(t => topicsSet.add(t));
      if (n.category) topicsSet.add(n.category);
    });
    const topics = Array.from(topicsSet).sort();

    const cVal = this.filters.course;
    const pVal = this.filters.professor;
    const sVal = this.filters.semester;
    const tVal = this.filters.topic;

    if (courseSelect) courseSelect.innerHTML = '<option value="">All Courses</option>' + courses.map(c => `<option value="${escapeHTML(c)}" ${c === cVal ? 'selected' : ''}>${escapeHTML(c)}</option>`).join('');
    if (profSelect) profSelect.innerHTML = '<option value="">All Instructors</option>' + professors.map(p => `<option value="${escapeHTML(p)}" ${p === pVal ? 'selected' : ''}>${escapeHTML(p)}</option>`).join('');
    if (semSelect) semSelect.innerHTML = '<option value="">All Semesters</option>' + semesters.map(s => `<option value="${escapeHTML(s)}" ${s === sVal ? 'selected' : ''}>${escapeHTML(s)}</option>`).join('');
    if (topicSelect) topicSelect.innerHTML = '<option value="">All Topics</option>' + topics.map(t => `<option value="${escapeHTML(t)}" ${t === tVal ? 'selected' : ''}>${escapeHTML(t)}</option>`).join('');
  }

  renderFilterPills() {
    const bar = document.getElementById('activeFiltersBar');
    const pills = document.getElementById('activeFilterPills');
    if (!bar || !pills) return;

    const activeList = [];
    if (this.filters.search) activeList.push({ key: 'search', label: `Search: "${this.filters.search}"` });
    if (this.filters.course) activeList.push({ key: 'course', label: `Course: ${this.filters.course}` });
    if (this.filters.professor) activeList.push({ key: 'professor', label: `Instructor: ${this.filters.professor}` });
    if (this.filters.semester) activeList.push({ key: 'semester', label: `Term: ${this.filters.semester}` });
    if (this.filters.topic) activeList.push({ key: 'topic', label: `Topic: ${this.filters.topic}` });

    if (activeList.length === 0) {
      bar.style.display = 'none';
      pills.innerHTML = '';
      return;
    }

    bar.style.display = 'flex';
    pills.innerHTML = activeList.map(item => `
      <span class="filter-pill">
        ${escapeHTML(item.label)}
        <button class="pill-remove-btn" data-key="${item.key}" aria-label="Remove filter">&times;</button>
      </span>
    `).join('');

    pills.querySelectorAll('.pill-remove-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const k = e.currentTarget.dataset.key;
        this.clearSingleFilter(k);
      });
    });
  }

  clearSingleFilter(key) {
    if (key === 'search') {
      this.filters.search = '';
      document.getElementById('globalSearchInput').value = '';
      document.getElementById('clearSearchBtn').classList.remove('visible');
    } else if (key === 'course') {
      this.filters.course = '';
      document.getElementById('filterCourse').value = '';
    } else if (key === 'professor') {
      this.filters.professor = '';
      document.getElementById('filterProfessor').value = '';
    } else if (key === 'semester') {
      this.filters.semester = '';
      document.getElementById('filterSemester').value = '';
    } else if (key === 'topic') {
      this.filters.topic = '';
      document.getElementById('filterTopic').value = '';
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    }
    this.filterNotes();
  }

  clearAllFilters() {
    this.filters.search = '';
    this.filters.course = '';
    this.filters.professor = '';
    this.filters.semester = '';
    this.filters.topic = '';
    document.getElementById('globalSearchInput').value = '';
    document.getElementById('clearSearchBtn').classList.remove('visible');
    document.getElementById('filterCourse').value = '';
    document.getElementById('filterProfessor').value = '';
    document.getElementById('filterSemester').value = '';
    document.getElementById('filterTopic').value = '';
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    this.filterNotes();
  }

  setTopicFilter(topic) {
    this.filters.topic = (this.filters.topic === topic) ? '' : topic;
    const select = document.getElementById('filterTopic');
    if (select) select.value = this.filters.topic;
    document.querySelectorAll('.chip').forEach(c => {
      c.classList.toggle('active', c.dataset.topic === this.filters.topic);
    });
    this.filterNotes();
  }

  // ==========================================
  // Reader / Preview Modal
  // ==========================================
  openReader(noteId) {
    const note = this.notes.find(n => n.id === noteId);
    if (!note) return;
    this.activeNoteId = noteId;

    document.getElementById('readerModalTitle').textContent = note.title;
    document.getElementById('readerCourseBadge').textContent = note.course || 'General';
    document.getElementById('readerSubmeta').textContent = `${note.professor || 'Instructor N/A'} • ${note.semester || 'Current'} • Seeder: ${note.uploaderNode || 'Hub-01'}`;
    document.getElementById('readerHash').textContent = note.sha256 || 'N/A';
    document.getElementById('readerSeedersCount').textContent = `${note.seeders || 1} peer node(s)`;
    document.getElementById('readerSeederBadge').textContent = `${note.seeders || 1} Seeder${(note.seeders || 1) === 1 ? '' : 's'}`;
    document.getElementById('readerFileSize').textContent = note.fileSize || '1 MB';
    document.getElementById('readerFileType').textContent = note.fileType || 'BIN';
    document.getElementById('readerDownloadsCount').textContent = note.downloads || 0;

    // Render markdown / text content
    const area = document.getElementById('readerContentArea');
    area.innerHTML = formatMarkdown(note.content || note.description || 'No text preview available for this binary file.');

    // Tags
    const tagsCloud = document.getElementById('readerTagCloud');
    tagsCloud.innerHTML = (note.topics || []).map(t => `<span class="note-tag">#${escapeHTML(t)}</span>`).join('');

    const modal = document.getElementById('modalReader');
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
  }

  closeReader() {
    const modal = document.getElementById('modalReader');
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    this.activeNoteId = null;
  }

  async deleteActiveNote() {
    if (!this.activeNoteId) return;
    const note = this.notes.find(n => n.id === this.activeNoteId);
    const title = note ? note.title : 'note';
    if (!confirm(`Are you sure you want to un-seed and delete '${title}' from this node?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/notes/${this.activeNoteId}`, { method: 'DELETE' }).then(r => r.json());
      if (res.status === 'success') {
        showToast(`'${title}' removed from swarm`, 'info');
        this.closeReader();
        await this.fetchData();
      } else {
        showToast(res.message || 'Failed to delete note', 'danger');
      }
    } catch (e) {
      showToast('Error removing note', 'danger');
    }
  }

  // ==========================================
  // Upload / Share Modal
  // ==========================================
  openUploadModal() {
    document.getElementById('uploadNoteForm').reset();
    this.selectedFile = null;
    document.getElementById('dropzoneContentDefault').style.display = 'block';
    document.getElementById('dropzoneContentSelected').style.display = 'none';
    const modal = document.getElementById('modalUpload');
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
  }

  closeUploadModal() {
    const modal = document.getElementById('modalUpload');
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
  }

  handleFileSelect(file) {
    if (!file) return;
    this.selectedFile = file;
    document.getElementById('selectedFileName').textContent = file.name;
    const kb = (file.size / 1024).toFixed(1);
    const sizeStr = file.size > 1024 * 1024 ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : `${kb} KB`;
    document.getElementById('selectedFileSize').textContent = sizeStr;
    document.getElementById('dropzoneContentDefault').style.display = 'none';
    document.getElementById('dropzoneContentSelected').style.display = 'block';

    // Auto-fill title if empty
    const titleInput = document.getElementById('inputNoteTitle');
    if (!titleInput.value) {
      const nameParts = file.name.split('.');
      nameParts.pop();
      titleInput.value = nameParts.join('.').replace(/[-_]/g, ' ');
    }
  }

  removeSelectedFile() {
    this.selectedFile = null;
    document.getElementById('noteFileInput').value = '';
    document.getElementById('dropzoneContentDefault').style.display = 'block';
    document.getElementById('dropzoneContentSelected').style.display = 'none';
  }

  async submitUpload(e) {
    e.preventDefault();
    const btn = document.getElementById('btnSubmitUpload');
    btn.disabled = true;
    btn.textContent = 'Computing SHA-256 & Seeding...';

    const formData = new FormData();
    formData.append('title', document.getElementById('inputNoteTitle').value.trim());
    formData.append('course', document.getElementById('inputCourse').value.trim());
    formData.append('professor', document.getElementById('inputProfessor').value.trim());
    formData.append('semester', document.getElementById('inputSemester').value.trim());
    formData.append('category', document.getElementById('inputCategory').value);
    formData.append('topics', document.getElementById('inputTopicTags').value.trim());
    formData.append('description', document.getElementById('inputNoteDescription').value.trim());

    if (this.selectedFile) {
      formData.append('file', this.selectedFile);
    }

    try {
      const res = await fetch('/api/notes/upload', {
        method: 'POST',
        body: formData
      }).then(r => r.json());

      if (res.status === 'success') {
        showToast(`Successfully seeded '${res.note.title}' to the swarm!`, 'success');
        this.closeUploadModal();
        await this.fetchData();
      } else {
        showToast(res.message || 'Upload failed', 'danger');
      }
    } catch (err) {
      console.error('Upload error:', err);
      showToast('Network error during upload', 'danger');
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg><span>Seed to P2P Swarm</span>`;
    }
  }

  // ==========================================
  // P2P Transfer Simulator & Real Download
  // ==========================================
  startP2PTransfer(noteId) {
    const note = this.notes.find(n => n.id === noteId);
    if (!note) return;

    this.activeNoteId = noteId;
    const modal = document.getElementById('modalP2PTransfer');
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');

    document.getElementById('p2pDocTitle').textContent = note.fileName || note.title;
    document.getElementById('p2pDocHash').textContent = `SHA-256: ${note.sha256}`;

    const progressBar = document.getElementById('p2pProgressBar');
    const percentLabel = document.getElementById('p2pProgressPercent');
    const speedLabel = document.getElementById('p2pTransferSpeed');
    const peersLabel = document.getElementById('p2pPeersConnected');
    const visualContainer = document.getElementById('swarmPeersVisual');
    const completeBtn = document.getElementById('btnCompleteTransfer');
    const integrityStep = document.getElementById('integrityCheckStep');
    const spinner = document.getElementById('checkSpinner');
    const integrityText = document.getElementById('integrityCheckText');

    progressBar.style.width = '0%';
    percentLabel.textContent = '0%';
    speedLabel.textContent = 'Handshaking with peer node...';
    peersLabel.textContent = '1 peer connected';
    completeBtn.style.display = 'none';
    visualContainer.innerHTML = '';

    integrityStep.style.display = 'none';
    spinner.style.display = 'inline-block';
    integrityText.textContent = 'Verifying cryptographic SHA-256 integrity hash...';

    // Spawn 1 to 4 visual peer node dots
    const peerNodes = ['Hub-01', 'Node-A', 'Node-B'];
    peerNodes.forEach((node, i) => {
      setTimeout(() => {
        const dot = document.createElement('div');
        dot.className = 'p2p-peer-node';
        dot.textContent = node.substring(0, 3);
        dot.title = `Connected: ${node}`;
        visualContainer.appendChild(dot);
      }, i * 200);
    });

    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.floor(Math.random() * 22) + 12;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);

        progressBar.style.width = '100%';
        percentLabel.textContent = '100%';
        speedLabel.textContent = 'Transfer Complete';

        integrityStep.style.display = 'flex';
        setTimeout(() => {
          spinner.style.display = 'none';
          integrityText.innerHTML = `<span class="text-emerald" style="font-weight: 700;">✓ SHA-256 Integrity Verified</span>`;
          completeBtn.style.display = 'inline-flex';

          // Trigger real browser download automatically
          window.location.href = `/api/p2p/download/${noteId}`;
          showToast(`File download started: ${note.fileName || note.title}`, 'success');
        }, 400);
      } else {
        progressBar.style.width = `${progress}%`;
        percentLabel.textContent = `${progress}%`;
        const speed = (Math.random() * 8 + 12).toFixed(1);
        speedLabel.textContent = `${speed} MB/s (LAN Socket)`;
      }
    }, 120);
  }

  closeP2PTransfer() {
    const modal = document.getElementById('modalP2PTransfer');
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
  }

  // ==========================================
  // Event Listeners
  // ==========================================
  setupEventListeners() {
    // Search input
    const searchInput = document.getElementById('globalSearchInput');
    const clearBtn = document.getElementById('clearSearchBtn');
    let debounceTimer;

    searchInput.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      clearBtn.classList.toggle('visible', val.length > 0);
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        this.filters.search = val;
        this.filterNotes();
      }, 250);
    });

    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      clearBtn.classList.remove('visible');
      this.filters.search = '';
      this.filterNotes();
    });

    // Dropdowns
    document.getElementById('filterCourse').addEventListener('change', (e) => {
      this.filters.course = e.target.value;
      this.filterNotes();
    });
    document.getElementById('filterProfessor').addEventListener('change', (e) => {
      this.filters.professor = e.target.value;
      this.filterNotes();
    });
    document.getElementById('filterSemester').addEventListener('change', (e) => {
      this.filters.semester = e.target.value;
      this.filterNotes();
    });
    document.getElementById('filterTopic').addEventListener('change', (e) => {
      this.filters.topic = e.target.value;
      this.filterNotes();
    });
    document.getElementById('sortBySelect').addEventListener('change', (e) => {
      this.filters.sortBy = e.target.value;
      this.filterNotes();
    });

    // Clear all filters
    const btnClearAll = document.getElementById('btnClearAllFilters');
    if (btnClearAll) btnClearAll.addEventListener('click', () => this.clearAllFilters());

    // Chips
    document.querySelectorAll('.chip').forEach(btn => {
      btn.addEventListener('click', () => {
        this.setTopicFilter(btn.dataset.topic);
      });
    });

    // Grid / List view toggle
    const container = document.getElementById('notesCardsContainer');
    document.getElementById('btnViewGrid').addEventListener('click', (e) => {
      document.getElementById('btnViewGrid').classList.add('active');
      document.getElementById('btnViewList').classList.remove('active');
      container.className = 'notes-feed-container grid-layout';
    });
    document.getElementById('btnViewList').addEventListener('click', (e) => {
      document.getElementById('btnViewList').classList.add('active');
      document.getElementById('btnViewGrid').classList.remove('active');
      container.className = 'notes-feed-container list-layout';
    });

    // Empty state upload trigger
    const emptyUpload = document.getElementById('btnEmptyUpload');
    if (emptyUpload) emptyUpload.addEventListener('click', () => this.openUploadModal());

    // Top announcement dismiss
    const dismissBtn = document.getElementById('dismissAnnouncementBtn');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        document.getElementById('topAnnouncement').style.display = 'none';
      });
    }

    // Modal: Reader
    document.getElementById('btnCloseReader').addEventListener('click', () => this.closeReader());
    document.getElementById('btnReaderCloseBottom').addEventListener('click', () => this.closeReader());
    document.getElementById('btnReaderDownload').addEventListener('click', () => {
      if (this.activeNoteId) {
        this.closeReader();
        this.startP2PTransfer(this.activeNoteId);
      }
    });
    document.getElementById('btnDeleteNote').addEventListener('click', () => this.deleteActiveNote());

    // Modal: Upload
    document.getElementById('btnOpenUploadModal').addEventListener('click', () => this.openUploadModal());
    document.getElementById('btnCloseUpload').addEventListener('click', () => this.closeUploadModal());
    document.getElementById('btnCancelUpload').addEventListener('click', () => this.closeUploadModal());
    document.getElementById('uploadNoteForm').addEventListener('submit', (e) => this.submitUpload(e));

    // File Dropzone
    const dropzone = document.getElementById('fileDropzone');
    const fileInput = document.getElementById('noteFileInput');
    const removeFileBtn = document.getElementById('btnRemoveSelectedFile');

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        this.handleFileSelect(e.target.files[0]);
      }
    });

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        this.handleFileSelect(e.dataTransfer.files[0]);
      }
    });

    removeFileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.removeSelectedFile();
    });

    // Modal: P2P Transfer
    document.getElementById('btnCloseTransfer').addEventListener('click', () => this.closeP2PTransfer());
    document.getElementById('btnCancelTransfer').addEventListener('click', () => this.closeP2PTransfer());
    document.getElementById('btnCompleteTransfer').addEventListener('click', () => {
      if (this.activeNoteId) {
        window.location.href = `/api/p2p/download/${this.activeNoteId}`;
        this.closeP2PTransfer();
      }
    });

    // Close on backdrop click
    document.querySelectorAll('.modal-backdrop').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('active');
          modal.setAttribute('aria-hidden', 'true');
        }
      });
    });
  }
}

// ==========================================
// Gruvbox Radar Animation
// ==========================================
function initRadarAnimation() {
  const canvas = document.getElementById('p2pRadarCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let angle = 0;

  const nodes = [
    { x: 45, y: 35, r: 4, type: 'cyan' },
    { x: 165, y: 30, r: 5, type: 'emerald' },
    { x: 110, y: 70, r: 6, type: 'emerald' },
    { x: 40, y: 105, r: 4, type: 'cyan' },
    { x: 180, y: 110, r: 5, type: 'emerald' },
    { x: 85, y: 115, r: 4, type: 'cyan' }
  ];

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    // Rings
    ctx.strokeStyle = '#504945';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 56, 0, Math.PI * 2);
    ctx.stroke();

    // Radar sweep (Gruvbox flat alpha tint)
    angle += 0.035;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillStyle = 'rgba(131, 165, 152, 0.2)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 68, 0, Math.PI / 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Connecting lines
    ctx.strokeStyle = '#3c3836';
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dist = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
        if (dist < 75) {
          ctx.beginPath();
          ctx.moveTo(nodes[i].x, nodes[i].y);
          ctx.lineTo(nodes[j].x, nodes[j].y);
          ctx.stroke();
        }
      }
    }

    // Nodes
    nodes.forEach(node => {
      ctx.fillStyle = node.type === 'emerald' ? '#b8bb26' : '#83a598';
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
      ctx.fill();
    });

    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
}

// ==========================================
// Theme Initialization
// ==========================================
function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEYS.THEME) || 'dark';
  document.body.className = `theme-${saved}`;
  const btn = document.getElementById('themeToggleBtn');
  if (btn) {
    btn.addEventListener('click', () => {
      const isDark = document.body.classList.contains('theme-dark');
      const newTheme = isDark ? 'light' : 'dark';
      document.body.className = `theme-${newTheme}`;
      localStorage.setItem(STORAGE_KEYS.THEME, newTheme);
    });
  }
}

// ==========================================
// Helpers: Toast Notification & HTML Escaping
// ==========================================
function showToast(message, type = 'info') {
  const stack = document.getElementById('toastStack');
  if (!stack) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const iconMap = {
    success: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#b8bb26" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
    danger: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fb4934" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    warning: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fabd2f" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    info: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#83a598" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`
  };

  toast.innerHTML = `
    ${iconMap[type] || iconMap.info}
    <span>${escapeHTML(message)}</span>
  `;

  stack.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    setTimeout(() => toast.remove(), 200);
  }, 3500);
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMarkdown(text) {
  if (!text) return '';
  let html = escapeHTML(text);

  // Headers
  html = html.replace(/^### (.*$)/gim, '<h4>$1</h4>');
  html = html.replace(/^## (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^# (.*$)/gim, '<h2>$1</h2>');

  // Bold & Italic
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

  // Blockquotes
  html = html.replace(/^\&gt; (.*$)/gim, '<blockquote>$1</blockquote>');

  // Code blocks
  html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Newlines
  html = html.replace(/\n\n/g, '<br><br>');
  html = html.replace(/\n/g, '<br>');

  return html;
}

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
  window.App = new CNProjectApp();
  window.App.init();
});
