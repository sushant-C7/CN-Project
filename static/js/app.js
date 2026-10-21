/**
 * CampusVault P2P - Computer Networks Project
 * Frontend Engine & Flask API Integration
 */

const STORAGE_KEYS = {
  USER_VOTES: 'cn_project_votes',
  BOOKMARKS: 'cn_project_bookmarks',
  THEME: 'cn_project_theme'
};

class CNProjectApp {
  constructor() {
    this.notes = [];
    this.actors = [];
    this.auditLog = [];
    this.telemetry = {};
    this.userVotes = this.loadLocal(STORAGE_KEYS.USER_VOTES, {});
    this.bookmarks = this.loadLocal(STORAGE_KEYS.BOOKMARKS, []);

    this.currentView = 'student';
    this.adminSubView = 'queue';
    this.activePersona = 'student_alex';
    this.layoutMode = 'grid';

    this.filters = {
      search: '',
      course: '',
      professor: '',
      semester: '',
      topic: '',
      sortBy: 'seeders'
    };

    this.activeNoteId = null;
    this.noteForFlagging = null;
  }

  loadLocal(key, fallback) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : fallback;
    } catch {
      return fallback;
    }
  }

  saveLocal(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      console.warn('Storage write error:', e);
    }
  }

  async fetchAllData() {
    try {
      const [notesRes, actorsRes, auditRes, telemetryRes] = await Promise.all([
        fetch('/api/notes').then(r => r.json()),
        fetch('/api/admin/actors').then(r => r.json()),
        fetch('/api/admin/audit').then(r => r.json()),
        fetch('/api/network/telemetry').then(r => r.json())
      ]);

      if (notesRes.status === 'success') this.notes = notesRes.notes;
      if (actorsRes.status === 'success') this.actors = actorsRes.actors;
      if (auditRes.status === 'success') this.auditLog = auditRes.audit;
      if (telemetryRes.status === 'success') this.telemetry = telemetryRes.telemetry;
    } catch (e) {
      console.error('API Fetch error:', e);
    }
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
        this.notes = res.notes;
        this.renderStudentFeed();
      }
    } catch (e) {
      console.error('Filter request failed:', e);
    }
  }

  renderStudentFeed() {
    const container = document.getElementById('notesCardsContainer');
    const emptyState = document.getElementById('emptyStateContainer');
    const countLabel = document.getElementById('resultsCount');

    this.populateDropdowns();
    this.renderFilterPills();

    // Student view filters out quarantined
    let visibleNotes = this.notes.filter(n => !(n.quarantined && this.currentView === 'student'));

    countLabel.textContent = `Showing ${visibleNotes.length} verified study material${visibleNotes.length === 1 ? '' : 's'}`;

    if (visibleNotes.length === 0) {
      container.innerHTML = '';
      emptyState.style.display = 'flex';
      return;
    }

    emptyState.style.display = 'none';
    container.innerHTML = visibleNotes.map(n => this.createCardHTML(n)).join('');

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

    container.querySelectorAll('.btn-flag-note').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = e.currentTarget.closest('.note-card').dataset.noteId;
        this.openFlagModal(id);
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
    if (note.course.startsWith('CS')) courseClass = 'course-cs';
    else if (note.course.startsWith('BIO')) courseClass = 'course-bio';
    else if (note.course.startsWith('MATH')) courseClass = 'course-math';
    else if (note.course.startsWith('ECON')) courseClass = 'course-econ';

    return `
      <article class="note-card" data-note-id="${note.id}">
        <div>
          <div class="note-card-header">
            <div class="badge-stack">
              <span class="course-badge ${courseClass}">${escapeHTML(note.course)}</span>
              <span class="category-tag">${escapeHTML(note.category)}</span>
            </div>
            <div>
              ${note.flagged ? `
                <span class="integrity-flagged-tag" title="Flagged for academic review">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
                  Under Review
                </span>
              ` : `
                <span class="integrity-verified-tag" title="SHA-256 Verified Clean">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                  Verified Clean
                </span>
              `}
            </div>
          </div>

          <h4 class="note-title">${escapeHTML(note.title)}</h4>
          <div class="note-meta-line">
            <span>${escapeHTML(note.professor)}</span>
            <span class="meta-bullet">&bull;</span>
            <span>${escapeHTML(note.semester)}</span>
            <span class="meta-bullet">&bull;</span>
            <span>${note.pages} pages (${note.fileSize})</span>
          </div>

          <p class="note-excerpt">${escapeHTML((note.content || '').substring(0, 160).replace(/[#*`$]/g, ''))}...</p>

          <div class="note-tags-row">
            ${(note.topics || []).map(t => `<span class="note-tag">#${escapeHTML(t)}</span>`).join('')}
          </div>
        </div>

        <div class="note-card-footer">
          <div class="swarm-stat-group">
            <div class="seeder-count-row">
              <span class="live-dot pulse-emerald"></span>
              <span>${note.seeders} Seeders</span>
              <span class="text-dim text-sm">(${note.downloads} dl)</span>
            </div>
            <span class="file-weight-meta mono">SHA: ${(note.sha256 || '').substring(0, 10)}...</span>
          </div>

          <div class="card-action-btns">
            <button class="btn btn-secondary btn-sm btn-preview-note" title="Read note">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              <span>Read</span>
            </button>
            <button class="btn btn-primary btn-sm btn-download-p2p" title="Initiate campus swarm download">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              <span>P2P</span>
            </button>
            <button class="icon-btn btn-sm btn-flag-note" title="Report Violation">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
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

    const courses = Array.from(new Set(this.notes.map(n => n.course))).sort();
    const professors = Array.from(new Set(this.notes.map(n => n.professor))).sort();
    const semesters = Array.from(new Set(this.notes.map(n => n.semester))).sort();
    
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

    courseSelect.innerHTML = '<option value="">All Courses</option>' + courses.map(c => `<option value="${escapeHTML(c)}" ${c === cVal ? 'selected' : ''}>${escapeHTML(c)}</option>`).join('');
    profSelect.innerHTML = '<option value="">All Professors</option>' + professors.map(p => `<option value="${escapeHTML(p)}" ${p === pVal ? 'selected' : ''}>${escapeHTML(p)}</option>`).join('');
    semSelect.innerHTML = '<option value="">All Semesters</option>' + semesters.map(s => `<option value="${escapeHTML(s)}" ${s === sVal ? 'selected' : ''}>${escapeHTML(s)}</option>`).join('');
    topicSelect.innerHTML = '<option value="">All Topics</option>' + topics.map(t => `<option value="${escapeHTML(t)}" ${t === tVal ? 'selected' : ''}>${escapeHTML(t)}</option>`).join('');
  }

  renderFilterPills() {
    const container = document.getElementById('activeFilterPills');
    const clearBtn = document.getElementById('btnResetFilters');
    const f = this.filters;

    const activePills = [];
    if (f.search) activePills.push({ type: 'search', label: `Search: "${f.search}"` });
    if (f.course) activePills.push({ type: 'course', label: `Course: ${f.course}` });
    if (f.professor) activePills.push({ type: 'professor', label: `Prof: ${f.professor}` });
    if (f.semester) activePills.push({ type: 'semester', label: `Term: ${f.semester}` });
    if (f.topic) activePills.push({ type: 'topic', label: `Topic: ${f.topic}` });

    if (activePills.length === 0) {
      container.innerHTML = '';
      clearBtn.style.display = 'none';
      return;
    }

    clearBtn.style.display = 'inline-block';
    container.innerHTML = activePills.map(p => `
      <span class="filter-pill" data-filter-type="${p.type}">
        <span>${escapeHTML(p.label)}</span>
        <button class="pill-remove-btn">&times;</button>
      </span>
    `).join('');

    container.querySelectorAll('.filter-pill').forEach(pill => {
      pill.querySelector('.pill-remove-btn').addEventListener('click', () => {
        const type = pill.dataset.filterType;
        if (type === 'search') {
          this.filters.search = '';
          document.getElementById('searchInput').value = '';
          document.getElementById('clearSearchBtn').classList.remove('visible');
        } else if (type === 'course') {
          this.filters.course = '';
          document.getElementById('filterCourse').value = '';
        } else if (type === 'professor') {
          this.filters.professor = '';
          document.getElementById('filterProfessor').value = '';
        } else if (type === 'semester') {
          this.filters.semester = '';
          document.getElementById('filterSemester').value = '';
        } else if (type === 'topic') {
          this.filters.topic = '';
          document.getElementById('filterTopic').value = '';
          document.querySelectorAll('#quickTopicChips .chip').forEach(c => c.classList.remove('active'));
        }
        this.filterNotes();
      });
    });
  }

  setTopicFilter(topic) {
    this.filters.topic = topic;
    document.getElementById('filterTopic').value = topic;
    document.querySelectorAll('#quickTopicChips .chip').forEach(c => {
      c.classList.toggle('active', c.dataset.topic === topic);
    });
    this.filterNotes();
  }

  renderAdminPortal() {
    const pendingCount = this.notes.filter(n => n.flagged).length;
    const quarantinedCount = this.notes.filter(n => n.quarantined).length;
    const bannedCount = this.actors.filter(a => a.status === 'Banned').length;
    const cleanCount = this.notes.filter(n => !n.flagged && !n.quarantined).length;

    document.getElementById('adminKpiPending').textContent = pendingCount;
    document.getElementById('adminKpiQuarantine').textContent = quarantinedCount;
    document.getElementById('adminKpiBanned').textContent = bannedCount;
    document.getElementById('adminKpiVerified').textContent = cleanCount;
    document.getElementById('adminQueueCountBadge').textContent = pendingCount;
    document.getElementById('adminPendingBadge').textContent = pendingCount;

    this.renderFlaggedQueue();
    this.renderActorsTable();
    this.renderAuditLedger();
  }

  renderFlaggedQueue() {
    const tbody = document.getElementById('flaggedFilesTableBody');
    const flagged = this.notes.filter(n => n.flagged);

    if (flagged.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2" style="margin-bottom: 0.5rem;"><polyline points="20 6 9 17 4 12"/></svg>
            <div>All clear! No pending student or faculty reports awaiting adjudication.</div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = flagged.map(note => {
      const details = note.flagDetails || {
        category: 'Honor Violation',
        reporter: 'Faculty Report',
        reason: 'Pending review',
        riskScore: 'HIGH'
      };

      return `
        <tr data-note-id="${note.id}">
          <td>
            <span class="table-doc-title">${escapeHTML(note.title)}</span>
            <span class="table-doc-meta">Uploader: ${escapeHTML(note.uploader.name)} (${escapeHTML(note.uploader.nodeId)})</span>
          </td>
          <td>
            <strong>${escapeHTML(note.course)}</strong>
            <div class="text-dim text-sm">${escapeHTML(note.professor)}</div>
          </td>
          <td>
            <span class="risk-badge risk-high">${escapeHTML(details.category)}</span>
          </td>
          <td style="max-width: 260px;">
            <div class="text-sm font-semibold">${escapeHTML(details.reporter)}</div>
            <div class="text-dim text-sm">${escapeHTML(details.reason)}</div>
          </td>
          <td>
            ${note.quarantined ? `<span class="risk-badge risk-high">QUARANTINED</span>` : `<span class="risk-badge risk-med">ACTIVE SWARM</span>`}
          </td>
          <td class="text-right">
            <div class="table-actions-cell">
              <button class="btn btn-secondary btn-sm btn-admin-inspect">Inspect</button>
              <button class="btn btn-secondary btn-sm btn-admin-dismiss">Dismiss</button>
              ${!note.quarantined ? `<button class="btn btn-secondary btn-sm btn-admin-quarantine">Quarantine</button>` : ''}
              <button class="btn btn-danger btn-sm btn-admin-takedown">Purge</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.btn-admin-inspect').forEach(b => {
      b.addEventListener('click', e => this.openReader(e.currentTarget.closest('tr').dataset.noteId));
    });

    tbody.querySelectorAll('.btn-admin-dismiss').forEach(b => {
      b.addEventListener('click', async e => {
        const id = e.currentTarget.closest('tr').dataset.noteId;
        await fetch(`/api/notes/${id}/dismiss`, { method: 'POST' });
        await this.fetchAllData();
        this.renderAdminPortal();
        this.renderStudentFeed();
        showToast('Flag dismissed and material cleared.', 'success');
      });
    });

    tbody.querySelectorAll('.btn-admin-quarantine').forEach(b => {
      b.addEventListener('click', async e => {
        const id = e.currentTarget.closest('tr').dataset.noteId;
        await fetch(`/api/notes/${id}/quarantine`, { method: 'POST' });
        await this.fetchAllData();
        this.renderAdminPortal();
        this.renderStudentFeed();
        showToast('File quarantined! Swarm seeding terminated immediately.', 'warning');
      });
    });

    tbody.querySelectorAll('.btn-admin-takedown').forEach(b => {
      b.addEventListener('click', async e => {
        const id = e.currentTarget.closest('tr').dataset.noteId;
        if (confirm('Permanently purge this document across all campus nodes?')) {
          await fetch(`/api/notes/${id}/takedown`, { method: 'DELETE' });
          await this.fetchAllData();
          this.renderAdminPortal();
          this.renderStudentFeed();
          showToast('Document purged from network.', 'danger');
        }
      });
    });
  }

  renderActorsTable() {
    const tbody = document.getElementById('actorsTableBody');
    tbody.innerHTML = this.actors.map(actor => {
      let trustColor = 'var(--emerald)';
      if (actor.trustScore < 50) trustColor = 'var(--rose)';
      else if (actor.trustScore < 80) trustColor = 'var(--amber)';

      let statusBadge = `<span class="risk-badge risk-low">${actor.status}</span>`;
      if (actor.status === 'Banned') statusBadge = `<span class="risk-badge risk-high">BANNED</span>`;
      else if (actor.status === 'Under Review') statusBadge = `<span class="risk-badge risk-med">PROBATION</span>`;

      return `
        <tr data-node-id="${actor.nodeId}">
          <td>
            <span class="table-doc-title">${escapeHTML(actor.name)}</span>
            <span class="table-doc-meta">${escapeHTML(actor.nodeId)} &bull; ${escapeHTML(actor.studentId)}</span>
          </td>
          <td>
            <span>${escapeHTML(actor.affiliation)}</span>
            <div class="text-dim text-sm mono">IP: ${escapeHTML(actor.ipAddress)}</div>
          </td>
          <td>
            <div class="trust-meter" style="color: ${trustColor};">
              <div class="trust-bar-bg">
                <div class="trust-bar-fill" style="width: ${actor.trustScore}%; background: ${trustColor};"></div>
              </div>
              <span>${actor.trustScore}%</span>
            </div>
          </td>
          <td><strong>${actor.uploads}</strong> notes</td>
          <td>
            ${actor.flagsCount > 0 ? `<span class="text-rose font-semibold">${actor.flagsCount} flags</span>` : `<span class="text-dim">0 offenses</span>`}
          </td>
          <td>${statusBadge}</td>
          <td class="text-right">
            <div class="table-actions-cell">
              ${actor.status !== 'Banned' ? `
                <button class="btn btn-secondary btn-sm btn-actor-warn">Warn</button>
                <button class="btn btn-danger btn-sm btn-actor-ban">Ban Node</button>
              ` : `
                <button class="btn btn-success btn-sm btn-actor-reinstate">Reinstate</button>
              `}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.btn-actor-warn').forEach(b => {
      b.addEventListener('click', async e => {
        const nodeId = e.currentTarget.closest('tr').dataset.nodeId;
        await fetch(`/api/admin/actors/${encodeURIComponent(nodeId)}/warn`, { method: 'POST' });
        await this.fetchAllData();
        this.renderActorsTable();
        showToast(`Formal Honor Warning issued to ${nodeId}`, 'warning');
      });
    });

    tbody.querySelectorAll('.btn-actor-ban').forEach(b => {
      b.addEventListener('click', async e => {
        const nodeId = e.currentTarget.closest('tr').dataset.nodeId;
        if (confirm(`Sever network connection and ban ${nodeId}?`)) {
          await fetch(`/api/admin/actors/${encodeURIComponent(nodeId)}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'Banned' })
          });
          await this.fetchAllData();
          this.renderActorsTable();
          showToast(`Actor ${nodeId} banned from campus peer mesh.`, 'danger');
        }
      });
    });

    tbody.querySelectorAll('.btn-actor-reinstate').forEach(b => {
      b.addEventListener('click', async e => {
        const nodeId = e.currentTarget.closest('tr').dataset.nodeId;
        await fetch(`/api/admin/actors/${encodeURIComponent(nodeId)}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'Active' })
        });
        await this.fetchAllData();
        this.renderActorsTable();
        showToast(`Privileges reinstated for ${nodeId}.`, 'success');
      });
    });
  }

  renderAuditLedger() {
    const container = document.getElementById('auditTimelineContainer');
    container.innerHTML = this.auditLog.map(log => {
      let cardClass = '';
      let badgeColor = 'var(--primary)';
      if (log.actionType === 'takedown') { cardClass = 'action-takedown'; badgeColor = 'var(--rose)'; }
      else if (log.actionType === 'ban') { cardClass = 'action-ban'; badgeColor = 'var(--purple)'; }
      else if (log.actionType === 'dismiss' || log.actionType === 'reinstate') { cardClass = 'action-dismiss'; badgeColor = 'var(--emerald)'; }
      else if (log.actionType === 'quarantine') { cardClass = 'action-takedown'; badgeColor = 'var(--amber)'; }

      return `
        <div class="timeline-card ${cardClass}">
          <div class="timeline-main">
            <div class="timeline-header-row">
              <span class="timeline-tag" style="background: rgba(255,255,255,0.08); color: ${badgeColor};">
                ${escapeHTML(log.actionType)}
              </span>
              <span class="timeline-title">${escapeHTML(log.title)}</span>
            </div>
            <div class="timeline-details">
              <strong>Source:</strong> ${escapeHTML(log.admin)} &bull; <strong>Target:</strong> ${escapeHTML(log.target)}
            </div>
            <div class="text-dim text-sm">${escapeHTML(log.reason)}</div>
          </div>
          <div class="timeline-meta">
            <div>${escapeHTML(log.timestamp)}</div>
            <div class="mono text-dim" style="font-size: 0.7rem; margin-top: 4px;">Ref: ${escapeHTML(log.policyRef)}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  openReader(noteId) {
    const note = this.notes.find(n => n.id === noteId);
    if (!note) return;

    this.activeNoteId = noteId;
    const modal = document.getElementById('modalReader');

    document.getElementById('readerCourseBadge').textContent = note.course;
    document.getElementById('readerModalTitle').textContent = note.title;
    document.getElementById('readerSubmeta').textContent = `${note.professor} • ${note.semester} • Seeded by ${note.uploader.name}`;
    document.getElementById('readerHash').textContent = (note.sha256 || '').substring(0, 16) + '...';
    document.getElementById('readerSeedersCount').textContent = `${note.seeders} nodes online`;
    document.getElementById('readerFileSize').textContent = `${note.fileSize} (${note.pages} pages)`;
    document.getElementById('readerUpvoteCount').textContent = note.upvotes;

    const btnUpvote = document.getElementById('btnUpvoteNote');
    btnUpvote.classList.toggle('active', !!this.userVotes[note.id]);

    const btnBookmark = document.getElementById('btnBookmarkNote');
    const isBookmarked = this.bookmarks.includes(note.id);
    btnBookmark.classList.toggle('active', isBookmarked);
    btnBookmark.querySelector('span').textContent = isBookmarked ? 'Saved in Binder' : 'Save to Binder';

    document.getElementById('readerTagCloud').innerHTML = (note.topics || []).map(t => `<span class="note-tag">#${escapeHTML(t)}</span>`).join('');
    document.getElementById('readerContentArea').innerHTML = renderMarkdown(note.content || '');

    modal.classList.add('active');
  }

  openFlagModal(noteId) {
    const note = this.notes.find(n => n.id === noteId);
    if (!note) return;

    this.noteForFlagging = note;
    document.getElementById('flaggedDocName').value = `[${note.course}] ${note.title} (SHA: ${(note.sha256 || '').substring(0, 12)}...)`;
    document.getElementById('flagReportForm').reset();
    document.getElementById('modalFlag').classList.add('active');
  }

  startP2PTransfer(noteId) {
    const note = this.notes.find(n => n.id === noteId);
    if (!note) return;

    const modal = document.getElementById('modalP2PTransfer');
    const docTitle = document.getElementById('p2pDocTitle');
    const docHash = document.getElementById('p2pDocHash');
    const progressBar = document.getElementById('p2pProgressBar');
    const progressText = document.getElementById('p2pProgressPercent');
    const speedText = document.getElementById('p2pTransferSpeed');
    const peersText = document.getElementById('p2pPeersConnected');
    const visualContainer = document.getElementById('swarmPeersVisual');
    const completeBtn = document.getElementById('btnCompleteTransfer');
    const checkText = document.getElementById('integrityCheckText');
    const spinner = document.getElementById('checkSpinner');

    docTitle.textContent = `${note.title} (${note.fileSize})`;
    docHash.textContent = `SHA-256: ${note.sha256}`;
    progressBar.style.width = '0%';
    progressText.textContent = '0%';
    speedText.textContent = 'Locating local subnet peers via TCP...';
    peersText.textContent = `${note.seeders} seeders`;
    completeBtn.style.display = 'none';
    checkText.textContent = 'Verifying cryptographic hash with university campus ledger...';
    spinner.style.display = 'block';

    visualContainer.innerHTML = '';
    const numPeers = Math.min(10, note.seeders || 6);
    for (let i = 0; i < numPeers; i++) {
      const peer = document.createElement('div');
      peer.className = 'p2p-peer-node';
      peer.textContent = `N${i + 1}`;
      peer.title = `Campus Node 127.0.0.1:${7000 + i}`;
      visualContainer.appendChild(peer);
    }

    modal.classList.add('active');

    let progress = 0;
    const timer = setInterval(() => {
      progress += Math.floor(Math.random() * 20) + 12;
      if (progress >= 100) {
        progress = 100;
        clearInterval(timer);
        progressBar.style.width = '100%';
        progressText.textContent = '100%';
        speedText.textContent = 'TCP Socket Transfer Complete (24.8 MB/s)';
        spinner.style.display = 'none';
        checkText.innerHTML = '<span class="text-emerald font-semibold">&#10003; SHA-256 Authenticity Stamp Confirmed. Honor Code Compliant.</span>';
        completeBtn.style.display = 'inline-flex';

        completeBtn.onclick = () => {
          window.location.href = `/api/p2p/download/${note.id}`;
          modal.classList.remove('active');
          showToast(`Downloaded "${note.title}" via P2P swarm.`, 'success');
        };
      } else {
        progressBar.style.width = `${progress}%`;
        progressText.textContent = `${progress}%`;
        speedText.textContent = `${(Math.random() * 8 + 18).toFixed(1)} MB/s LAN Cache`;
      }
    }, 150);
  }
}

// Global instance
const App = new CNProjectApp();

document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initPersonaSelector();
  initRadarAnimation();
  initNavigation();
  initFormAndModals();

  await App.fetchAllData();
  App.renderStudentFeed();
  App.renderAdminPortal();

  // Polling / telemetry update
  setInterval(async () => {
    try {
      const res = await fetch('/api/network/telemetry').then(r => r.json());
      if (res.status === 'success') {
        const el = document.getElementById('telemetrySeeders');
        if (el) el.textContent = res.telemetry.total_seeder_connections || 429;
        const noteEl = document.getElementById('telemetryNotes');
        if (noteEl) noteEl.textContent = res.telemetry.total_notes || App.notes.length;
      }
    } catch {}
  }, 5000);
});

// UI Event Handlers
function initNavigation() {
  const tabStudent = document.getElementById('tabStudentHub');
  const tabAdmin = document.getElementById('tabAdminPortal');
  const viewStudent = document.getElementById('viewStudentHub');
  const viewAdmin = document.getElementById('viewAdminPortal');

  tabStudent.addEventListener('click', () => {
    App.currentView = 'student';
    tabStudent.classList.add('active');
    tabAdmin.classList.remove('active');
    viewStudent.classList.add('active');
    viewAdmin.classList.remove('active');
    App.renderStudentFeed();
  });

  tabAdmin.addEventListener('click', () => {
    App.currentView = 'admin';
    tabAdmin.classList.add('active');
    tabStudent.classList.remove('active');
    viewAdmin.classList.add('active');
    viewStudent.classList.remove('active');
    App.renderAdminPortal();
  });

  const subtabs = document.querySelectorAll('.admin-subtab');
  const panels = {
    queue: document.getElementById('adminQueuePanel'),
    actors: document.getElementById('adminActorsPanel'),
    audit: document.getElementById('adminAuditPanel')
  };

  subtabs.forEach(tab => {
    tab.addEventListener('click', () => {
      subtabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.subview;
      App.adminSubView = target;
      Object.keys(panels).forEach(k => {
        panels[k].style.display = k === target ? 'block' : 'none';
      });
    });
  });

  document.getElementById('btnBulkAuditPassed').addEventListener('click', () => {
    showToast('Verified all active non-flagged course notes under cryptographic campus seal.', 'success');
  });

  document.getElementById('btnExportAuditLog').addEventListener('click', () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(App.auditLog, null, 2));
    const dl = document.createElement('a');
    dl.setAttribute('href', dataStr);
    dl.setAttribute('download', `cn_project_audit_${Date.now()}.json`);
    document.body.appendChild(dl);
    dl.click();
    dl.remove();
    showToast('Cryptographic audit ledger exported successfully.', 'info');
  });

  document.getElementById('dismissAnnouncementBtn').addEventListener('click', () => {
    document.getElementById('topAnnouncement').style.display = 'none';
  });
}

function initFormAndModals() {
  // Search
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  let debounce;

  searchInput.addEventListener('input', (e) => {
    clearTimeout(debounce);
    const val = e.target.value;
    clearSearchBtn.classList.toggle('visible', val.length > 0);
    debounce = setTimeout(() => {
      App.filters.search = val;
      App.filterNotes();
    }, 180);
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearSearchBtn.classList.remove('visible');
    App.filters.search = '';
    App.filterNotes();
  });

  // Filters
  document.getElementById('filterCourse').addEventListener('change', e => {
    App.filters.course = e.target.value;
    App.filterNotes();
  });
  document.getElementById('filterProfessor').addEventListener('change', e => {
    App.filters.professor = e.target.value;
    App.filterNotes();
  });
  document.getElementById('filterSemester').addEventListener('change', e => {
    App.filters.semester = e.target.value;
    App.filterNotes();
  });
  document.getElementById('filterTopic').addEventListener('change', e => {
    App.filters.topic = e.target.value;
    App.filterNotes();
  });
  document.getElementById('sortBySelect').addEventListener('change', e => {
    App.filters.sortBy = e.target.value;
    App.filterNotes();
  });

  const resetAll = () => {
    App.filters = { search: '', course: '', professor: '', semester: '', topic: '', sortBy: 'seeders' };
    searchInput.value = '';
    clearSearchBtn.classList.remove('visible');
    document.getElementById('sortBySelect').value = 'seeders';
    document.querySelectorAll('#quickTopicChips .chip').forEach(c => c.classList.remove('active'));
    App.filterNotes();
  };

  document.getElementById('btnResetFilters').addEventListener('click', resetAll);
  document.getElementById('btnEmptyReset').addEventListener('click', resetAll);

  // Quick Chips
  document.querySelectorAll('#quickTopicChips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const topic = chip.dataset.topic;
      if (App.filters.topic === topic) {
        App.setTopicFilter('');
      } else {
        App.setTopicFilter(topic);
      }
    });
  });

  // Reader Modal Controls
  const modalReader = document.getElementById('modalReader');
  const closeReader = () => modalReader.classList.remove('active');
  document.getElementById('btnCloseReader').addEventListener('click', closeReader);
  document.getElementById('btnReaderCloseBottom').addEventListener('click', closeReader);

  document.getElementById('btnReaderDownload').addEventListener('click', () => {
    if (App.activeNoteId) {
      closeReader();
      App.startP2PTransfer(App.activeNoteId);
    }
  });

  document.getElementById('btnReaderFlag').addEventListener('click', () => {
    if (App.activeNoteId) {
      closeReader();
      App.openFlagModal(App.activeNoteId);
    }
  });

  document.getElementById('btnUpvoteNote').addEventListener('click', () => {
    if (!App.activeNoteId) return;
    const note = App.notes.find(n => n.id === App.activeNoteId);
    if (!note) return;

    if (App.userVotes[note.id]) {
      delete App.userVotes[note.id];
      note.upvotes -= 1;
    } else {
      App.userVotes[note.id] = true;
      note.upvotes += 1;
    }
    App.saveLocal(STORAGE_KEYS.USER_VOTES, App.userVotes);
    document.getElementById('readerUpvoteCount').textContent = note.upvotes;
    document.getElementById('btnUpvoteNote').classList.toggle('active', !!App.userVotes[note.id]);
    App.renderStudentFeed();
  });

  document.getElementById('btnBookmarkNote').addEventListener('click', () => {
    if (!App.activeNoteId) return;
    const idx = App.bookmarks.indexOf(App.activeNoteId);
    if (idx > -1) {
      App.bookmarks.splice(idx, 1);
    } else {
      App.bookmarks.push(App.activeNoteId);
    }
    App.saveLocal(STORAGE_KEYS.BOOKMARKS, App.bookmarks);
    const isBookmarked = App.bookmarks.includes(App.activeNoteId);
    document.getElementById('btnBookmarkNote').classList.toggle('active', isBookmarked);
    document.getElementById('btnBookmarkNote').querySelector('span').textContent = isBookmarked ? 'Saved in Binder' : 'Save to Binder';
    showToast(isBookmarked ? 'Saved to binder.' : 'Removed from binder.', 'info');
  });

  // Upload Modal
  const modalUpload = document.getElementById('modalUpload');
  const closeUpload = () => modalUpload.classList.remove('active');
  document.getElementById('btnOpenUploadModal').addEventListener('click', () => {
    if (App.activePersona === 'student_rogue') {
      showToast('Action Blocked: Account Node #9948 is restricted from seeding under Section 4.2.', 'danger');
      return;
    }
    modalUpload.classList.add('active');
  });
  document.getElementById('btnCloseUpload').addEventListener('click', closeUpload);
  document.getElementById('btnCancelUpload').addEventListener('click', closeUpload);

  document.getElementById('uploadNoteForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!document.getElementById('checkHonorPledge').checked) {
      showToast('You must affirm the University Academic Integrity Declaration.', 'danger');
      return;
    }

    const formData = new FormData();
    formData.append('title', document.getElementById('inputNoteTitle').value.trim());
    formData.append('course', document.getElementById('inputCourse').value);
    formData.append('professor', document.getElementById('inputProfessor').value);
    formData.append('semester', document.getElementById('inputSemester').value);
    formData.append('category', document.getElementById('inputCategory').value);
    formData.append('topics', document.getElementById('inputTopicTags').value.trim());
    formData.append('description', document.getElementById('inputNoteDescription').value.trim());

    if (App.activePersona === 'admin_vance') {
      formData.append('uploader_name', 'Dr. Marcus Vance');
      formData.append('uploader_node', 'Node #VANCE-FAC');
    } else {
      formData.append('uploader_name', 'Alex Chen');
      formData.append('uploader_node', 'Node #4092-B');
    }

    const fileInput = document.getElementById('noteFileInput');
    if (fileInput.files && fileInput.files[0]) {
      formData.append('file', fileInput.files[0]);
    }

    try {
      const res = await fetch('/api/notes/upload', {
        method: 'POST',
        body: formData
      }).then(r => r.json());

      if (res.status === 'success') {
        closeUpload();
        document.getElementById('uploadNoteForm').reset();
        await App.fetchAllData();
        App.renderStudentFeed();
        App.renderAdminPortal();
        showToast(`Note "${res.note.title}" hosted to campus P2P swarm!`, 'success');
      } else {
        showToast(res.message || 'Upload failed', 'danger');
      }
    } catch (err) {
      showToast('Network error during note upload', 'danger');
    }
  });

  // Flag Modal
  const modalFlag = document.getElementById('modalFlag');
  const closeFlag = () => modalFlag.classList.remove('active');
  document.getElementById('btnCloseFlag').addEventListener('click', closeFlag);
  document.getElementById('btnCancelFlag').addEventListener('click', closeFlag);

  document.getElementById('flagReportForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!App.noteForFlagging) return;

    const category = document.getElementById('flagReasonCategory').value;
    const reason = document.getElementById('flagExplanation').value.trim();

    let reporter = 'Student Report';
    if (App.activePersona === 'admin_vance') reporter = 'Dr. Marcus Vance (Faculty)';

    await fetch(`/api/notes/${App.noteForFlagging.id}/flag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, reason, reporter })
    });

    closeFlag();
    await App.fetchAllData();
    App.renderStudentFeed();
    App.renderAdminPortal();
    showToast('Report submitted to Academic Integrity Board.', 'warning');
  });

  // Blacklist Modal
  const modalBlacklist = document.getElementById('modalBlacklist');
  const closeBlacklist = () => modalBlacklist.classList.remove('active');
  document.getElementById('btnOpenBlacklistModal').addEventListener('click', () => modalBlacklist.classList.add('active'));
  document.getElementById('btnCloseBlacklist').addEventListener('click', closeBlacklist);
  document.getElementById('btnCancelBlacklist').addEventListener('click', closeBlacklist);

  document.getElementById('blacklistForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nodeId = document.getElementById('blacklistNodeId').value.trim();
    const reason = document.getElementById('blacklistReason').value;

    await fetch('/api/admin/actors/blacklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ node_id: nodeId, reason })
    });

    closeBlacklist();
    await App.fetchAllData();
    App.renderAdminPortal();
    showToast(`Node ${nodeId} blacklisted from campus swarm.`, 'danger');
  });

  // P2P Transfer Modal Close
  document.getElementById('btnCloseTransfer').addEventListener('click', () => document.getElementById('modalP2PTransfer').classList.remove('active'));
  document.getElementById('btnCancelTransfer').addEventListener('click', () => document.getElementById('modalP2PTransfer').classList.remove('active'));
}

function initPersonaSelector() {
  const select = document.getElementById('personaSelect');
  const avatar = document.getElementById('currentPersonaAvatar');

  select.addEventListener('change', (e) => {
    App.activePersona = e.target.value;
    if (App.activePersona === 'student_alex') {
      avatar.textContent = '🎓';
      showToast('Switched persona to Alex Chen (Active Student, 99% Trust)', 'info');
    } else if (App.activePersona === 'admin_vance') {
      avatar.textContent = '🛡️';
      showToast('Switched persona to Dr. Marcus Vance (Faculty Integrity Admin)', 'info');
      document.getElementById('tabAdminPortal').click();
    } else if (App.activePersona === 'student_rogue') {
      avatar.textContent = '⚠️';
      showToast('Switched persona to Node #9948 (Restricted / Flagged Account)', 'warning');
    }
  });
}

function initRadarAnimation() {
  const canvas = document.getElementById('p2pRadarCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let angle = 0;
  const nodes = [
    { x: 50, y: 40, r: 4, type: 'cyan' },
    { x: 160, y: 35, r: 5, type: 'emerald' },
    { x: 120, y: 80, r: 6, type: 'emerald' },
    { x: 45, y: 110, r: 4, type: 'cyan' },
    { x: 180, y: 115, r: 5, type: 'emerald' },
    { x: 90, y: 125, r: 4, type: 'cyan' },
    { x: 110, y: 45, r: 3, type: 'cyan' }
  ];

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 30, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 60, 0, Math.PI * 2);
    ctx.stroke();

    angle += 0.035;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 70);
    grad.addColorStop(0, 'rgba(56, 189, 248, 0.4)');
    grad.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 70, 0, Math.PI / 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
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

    nodes.forEach(node => {
      ctx.fillStyle = node.type === 'emerald' ? '#10B981' : '#38BDF8';
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
      ctx.fill();
    });

    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
}

function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEYS.THEME) || 'dark';
  document.body.className = `theme-${saved}`;
  document.getElementById('themeToggleBtn').addEventListener('click', () => {
    const isDark = document.body.classList.contains('theme-dark');
    const newTheme = isDark ? 'light' : 'dark';
    document.body.className = `theme-${newTheme}`;
    localStorage.setItem(STORAGE_KEYS.THEME, newTheme);
  });
}

function renderMarkdown(md) {
  if (!md) return '';
  let html = escapeHTML(md);
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^# (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/```([a-z]*)\n([\s\S]*?)```/gim, '<pre><code>$2</code></pre>');
  html = html.replace(/`([^`]+)`/gim, '<code>$1</code>');
  html = html.replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>');
  html = html.replace(/\*\*([^*]+)\*\*/gim, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/gim, '<em>$1</em>');
  html = html.replace(/\$\$([^$]+)\$\$/gim, '<div class="mono" style="background:rgba(56,189,248,0.06); padding:8px 12px; border-radius:6px; margin:8px 0; color:var(--primary);">$1</div>');
  html = html.replace(/\$([^$]+)\$/gim, '<span class="mono" style="color:var(--primary); font-weight:600;">$1</span>');
  html = html.replace(/\n\n/gim, '<br><br>');
  return html;
}

function showToast(message, type = 'info') {
  const stack = document.getElementById('toastStack');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  let icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
  if (type === 'success') {
    icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
  } else if (type === 'danger') {
    icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F43F5E" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
  } else if (type === 'warning') {
    icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
  }

  toast.innerHTML = `${icon}<span>${escapeHTML(message)}</span>`;
  stack.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.25s ease-out';
    setTimeout(() => toast.remove(), 250);
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
