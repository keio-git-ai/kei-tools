// ===== STATE =====
const state = {
  instructors: [],
  shifts: [],
  currentView: 'dashboard',
  weekOffset: 0,
  selectedInstructorId: null,
};

// ===== API =====
const api = {
  async req(method, url, body) {
    const opts = { method, headers: {} };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  },
  getInstructors: () => api.req('GET', '/api/instructors'),
  createInstructor: (d) => api.req('POST', '/api/instructors', d),
  updateInstructor: (id, d) => api.req('PUT', `/api/instructors/${id}`, d),
  deleteInstructor: (id) => api.req('DELETE', `/api/instructors/${id}`),
  getShifts: () => api.req('GET', '/api/shifts'),
  createShift: (d) => api.req('POST', '/api/shifts', d),
  updateShift: (id, d) => api.req('PUT', `/api/shifts/${id}`, d),
  deleteShift: (id) => api.req('DELETE', `/api/shifts/${id}`),
};

// ===== UTILS =====
function getWeekDates(offset = 0) {
  const today = new Date();
  const dow = today.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff + offset * 7);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function toDateStr(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

// dayOfWeek: 0=Mon, 1=Tue, ..., 6=Sun
function dateDow(date) {
  const d = date.getDay();
  return d === 0 ? 6 : d - 1;
}

function parseTime(t) {
  const [h, m] = t.split(':').map(Number);
  return h + m / 60;
}

function getAvailableInstructors(date, hour) {
  const dateStr = toDateStr(date);
  const dow = dateDow(date);
  return state.instructors.filter(inst =>
    state.shifts.some(s => {
      if (s.instructorId !== inst.id) return false;
      const st = parseTime(s.startTime);
      const et = parseTime(s.endTime);
      const inRange = st <= hour && et > hour;
      if (s.type === 'fixed') return s.dayOfWeek === dow && inRange;
      if (s.type === 'specific') return s.date === dateStr && inRange;
      return false;
    })
  );
}

function slotLevel(count) {
  if (count === 0) return 0;
  if (count <= 2) return 1;
  if (count <= 4) return 2;
  if (count <= 6) return 3;
  return 4;
}

function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function avatarColor(name) {
  const colors = ['#2563eb','#7c3aed','#db2777','#ea580c','#16a34a','#0891b2','#854d0e'];
  let h = 0;
  for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return colors[h % colors.length];
}

// ===== TOAST =====
function toast(msg, type = '') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ===== RENDER =====
function render() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === state.currentView);
  });
  const app = document.getElementById('app');
  switch (state.currentView) {
    case 'dashboard':  app.innerHTML = buildDashboard();  bindDashboard();  break;
    case 'instructors': app.innerHTML = buildInstructors(); bindInstructors(); break;
    case 'shifts':      app.innerHTML = buildShifts();      bindShifts();      break;
  }
}

// ===== DASHBOARD =====
const HOURS = Array.from({ length: 13 }, (_, i) => i + 9); // 9..21
const DAY_NAMES = ['月','火','水','木','金','土','日'];

function buildDashboard() {
  const dates = getWeekDates(state.weekOffset);
  const todayStr = toDateStr(new Date());
  const fmt = d => `${d.getMonth()+1}/${d.getDate()}`;

  let rows = '';
  for (let hi = 0; hi < HOURS.length - 1; hi++) {
    const hour = HOURS[hi];
    let cells = '';
    dates.forEach(date => {
      const avail = getAvailableInstructors(date, hour);
      const cnt = avail.length;
      const lvl = slotLevel(cnt);
      cells += `<td class="slot-cell lvl-${lvl}"
        data-date="${toDateStr(date)}" data-hour="${hour}"
        title="${toDateStr(date)} ${hour}:00〜${hour+1}:00  対応可能: ${cnt}名">
        ${cnt > 0 ? `<div class="slot-count">${cnt}</div><div class="slot-unit">名</div>` : ''}
      </td>`;
    });
    rows += `<tr>
      <td class="td-time">${pad(hour)}:00<br><span style="font-size:9px;opacity:.6">↓</span><br>${pad(hour+1)}:00</td>
      ${cells}
    </tr>`;
  }

  let dayHeaders = '';
  dates.forEach((d, i) => {
    const isToday = toDateStr(d) === todayStr;
    const isWeekend = i >= 5;
    dayHeaders += `<th class="th-day${isToday?' today':''}${isWeekend?' weekend':''}">
      <div class="day-name">${DAY_NAMES[i]}</div>
      <div class="day-date">${d.getDate()}</div>
    </th>`;
  });

  return `
  <div class="dashboard">
    <div class="dashboard-header">
      <button id="prevWeek" class="btn btn-ghost">← 前週</button>
      <span class="week-label">${dates[0].getFullYear()}年&nbsp;${fmt(dates[0])}（月）〜${fmt(dates[6])}（日）</span>
      <button id="nextWeek" class="btn btn-ghost">次週 →</button>
      <button id="goToday" class="btn btn-secondary" style="margin-left:8px;">今週</button>
    </div>

    <div class="calendar-wrap">
      <table class="calendar-table">
        <colgroup>
          <col class="col-time">
          ${dates.map(() => '<col>').join('')}
        </colgroup>
        <thead>
          <tr>
            <th class="th-time">時間</th>
            ${dayHeaders}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <div class="legend">
      <span style="font-weight:600;">対応可能人数：</span>
      <span class="legend-chip"><span class="dot dot-0"></span>0名</span>
      <span class="legend-chip"><span class="dot dot-1"></span>1〜2名</span>
      <span class="legend-chip"><span class="dot dot-2"></span>3〜4名</span>
      <span class="legend-chip"><span class="dot dot-3"></span>5〜6名</span>
      <span class="legend-chip"><span class="dot dot-4"></span>7名以上</span>
    </div>
  </div>`;
}

function bindDashboard() {
  document.getElementById('prevWeek').onclick = () => { state.weekOffset--; render(); };
  document.getElementById('nextWeek').onclick = () => { state.weekOffset++; render(); };
  document.getElementById('goToday').onclick = () => { state.weekOffset = 0; render(); };

  document.querySelectorAll('.slot-cell').forEach(cell => {
    cell.addEventListener('click', () => {
      const date = new Date(cell.dataset.date + 'T00:00:00');
      const hour = parseInt(cell.dataset.hour);
      showSlotModal(date, hour);
    });
  });
}

function showSlotModal(date, hour) {
  const avail = getAvailableInstructors(date, hour);
  const dow = DAY_NAMES[dateDow(date)];
  const dateLabel = `${date.getMonth()+1}月${date.getDate()}日（${dow}）`;

  const rows = avail.length === 0
    ? `<div class="no-instructors">この時間帯に対応可能な講師はいません</div>`
    : `<table class="modal-table">
        <thead><tr><th>名前</th><th>所属会社</th><th>担当科目</th><th>契約形態</th><th>単価</th></tr></thead>
        <tbody>
          ${avail.map(inst => `<tr>
            <td><strong>${escHtml(inst.name)}</strong></td>
            <td>${escHtml(inst.company)}</td>
            <td>${(inst.subjects||[]).map(s=>`<span class="tag">${escHtml(s)}</span>`).join('')}</td>
            <td><span class="badge">${escHtml(inst.contractType)}</span></td>
            <td class="price-cell">${inst.unitPrice ? inst.unitPrice.toLocaleString()+'円' : '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;

  showModal(`${dateLabel} ${pad(hour)}:00〜${pad(hour+1)}:00`, `
    <div class="modal-info">
      <div>
        <div class="modal-info-time">${pad(hour)}:00〜${pad(hour+1)}:00</div>
        <div class="modal-info-detail">${dateLabel}</div>
      </div>
      <span class="avail-count">${avail.length}名 対応可能</span>
    </div>
    ${rows}
  `, true);
}

// ===== INSTRUCTORS =====
const CONTRACT_TYPES = ['業務委託','正社員','パート','アルバイト'];

function buildInstructors() {
  const rows = state.instructors.map(inst => `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="avatar" style="background:${avatarColor(inst.name)}">${escHtml(inst.name[0]||'?')}</div>
          <span class="instructor-name">${escHtml(inst.name)}</span>
        </div>
      </td>
      <td>${escHtml(inst.company)}</td>
      <td>${(inst.subjects||[]).map(s=>`<span class="tag">${escHtml(s)}</span>`).join('') || '<span class="text-muted">—</span>'}</td>
      <td><span class="badge">${escHtml(inst.contractType)}</span></td>
      <td class="price-cell">${inst.unitPrice ? inst.unitPrice.toLocaleString()+'円' : '—'}</td>
      <td>
        <div class="action-btns">
          <button class="btn btn-ghost btn-sm edit-inst" data-id="${inst.id}">編集</button>
          <button class="btn btn-danger btn-sm del-inst" data-id="${inst.id}">削除</button>
        </div>
      </td>
    </tr>`).join('');

  const body = state.instructors.length === 0
    ? `<div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        <p>講師が登録されていません<br><small>右上の「講師を追加」から登録してください</small></p>
      </div>`
    : `<table class="data-table">
        <thead><tr><th>名前</th><th>所属会社</th><th>担当科目</th><th>契約形態</th><th>単価（円/時）</th><th>操作</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;

  return `<div class="card">
    <div class="section-header">
      <span class="section-title">講師管理（${state.instructors.length}名）</span>
      <button id="addInst" class="btn btn-primary">+ 講師を追加</button>
    </div>
    <div class="section-body">${body}</div>
  </div>`;
}

function bindInstructors() {
  document.getElementById('addInst').onclick = () => showInstructorForm(null);

  document.querySelectorAll('.edit-inst').forEach(btn => {
    btn.onclick = () => {
      const inst = state.instructors.find(i => i.id === btn.dataset.id);
      if (inst) showInstructorForm(inst);
    };
  });

  document.querySelectorAll('.del-inst').forEach(btn => {
    btn.onclick = async () => {
      const inst = state.instructors.find(i => i.id === btn.dataset.id);
      if (!inst) return;
      if (!confirm(`「${inst.name}」を削除しますか？\nこの講師に登録されたシフトもすべて削除されます。`)) return;
      await api.deleteInstructor(btn.dataset.id);
      await loadData();
      render();
      toast(`${inst.name} を削除しました`);
    };
  });
}

function showInstructorForm(inst) {
  const isEdit = !!inst;
  const title = isEdit ? '講師情報を編集' : '講師を追加';
  const contractOpts = CONTRACT_TYPES.map(t =>
    `<option value="${t}"${isEdit && inst.contractType===t?' selected':''}>${t}</option>`
  ).join('');

  showModal(title, `
    <form id="instForm">
      <div class="form-row">
        <div class="form-group">
          <label>名前<span class="required">*</span></label>
          <input type="text" id="iName" value="${isEdit?escHtml(inst.name):''}" placeholder="山田 太郎" required>
        </div>
        <div class="form-group">
          <label>所属会社<span class="required">*</span></label>
          <input type="text" id="iCompany" value="${isEdit?escHtml(inst.company):''}" placeholder="株式会社〇〇" required>
        </div>
      </div>
      <div class="form-group">
        <label>担当科目<span class="hint">（カンマ区切りで複数入力可）</span></label>
        <input type="text" id="iSubjects" value="${isEdit?(inst.subjects||[]).join(', '):''}" placeholder="英語, 数学, 国語">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>契約形態<span class="required">*</span></label>
          <select id="iContract">${contractOpts}</select>
        </div>
        <div class="form-group">
          <label>単価（円/時間）</label>
          <input type="number" id="iPrice" value="${isEdit&&inst.unitPrice?inst.unitPrice:''}" min="0" step="100" placeholder="3000">
        </div>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">${isEdit?'更新':'追加'}</button>
        <button type="button" class="btn btn-ghost" id="cancelForm">キャンセル</button>
      </div>
    </form>
  `);

  document.getElementById('cancelForm').onclick = closeModal;

  document.getElementById('instForm').onsubmit = async (e) => {
    e.preventDefault();
    const data = {
      name: document.getElementById('iName').value.trim(),
      company: document.getElementById('iCompany').value.trim(),
      subjects: document.getElementById('iSubjects').value.split(',').map(s=>s.trim()).filter(Boolean),
      contractType: document.getElementById('iContract').value,
      unitPrice: parseInt(document.getElementById('iPrice').value) || 0,
    };
    if (!data.name || !data.company) { toast('名前と所属会社は必須です', 'error'); return; }
    if (isEdit) {
      await api.updateInstructor(inst.id, data);
      toast(`${data.name} の情報を更新しました`, 'success');
    } else {
      await api.createInstructor(data);
      toast(`${data.name} を追加しました`, 'success');
    }
    closeModal();
    await loadData();
    render();
  };
}

// ===== SHIFTS =====
const DAY_FULL_NAMES = ['月曜日','火曜日','水曜日','木曜日','金曜日','土曜日','日曜日'];

function buildShifts() {
  const instList = state.instructors.map(inst => {
    const shiftCount = state.shifts.filter(s => s.instructorId === inst.id).length;
    const isSelected = state.selectedInstructorId === inst.id;
    return `<div class="instructor-item${isSelected?' selected':''}" data-id="${inst.id}">
      <div class="avatar" style="background:${avatarColor(inst.name)};width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:white;flex-shrink:0;">${escHtml(inst.name[0]||'?')}</div>
      <div class="instructor-info">
        <div class="instructor-item-name">${escHtml(inst.name)}</div>
        <div class="instructor-item-company">${escHtml(inst.company)} · ${shiftCount}件</div>
      </div>
    </div>`;
  }).join('');

  const leftPanel = `<div class="card instructor-picker">
    <div class="section-header" style="padding:16px 20px;">
      <span class="section-title" style="font-size:15px;">講師一覧</span>
    </div>
    <div class="instructor-list">
      ${state.instructors.length === 0
        ? '<p style="padding:20px;color:var(--text-muted);text-align:center;font-size:13px;">講師が登録されていません</p>'
        : instList}
    </div>
  </div>`;

  let rightPanel = '';
  if (!state.selectedInstructorId) {
    rightPanel = `<div class="card" style="display:flex;align-items:center;justify-content:center;min-height:200px;">
      <p style="color:var(--text-muted);font-size:15px;">← 左の一覧から講師を選択してください</p>
    </div>`;
  } else {
    const inst = state.instructors.find(i => i.id === state.selectedInstructorId);
    const myShifts = state.shifts.filter(s => s.instructorId === state.selectedInstructorId);
    const fixedShifts = myShifts.filter(s => s.type === 'fixed').sort((a,b) => a.dayOfWeek - b.dayOfWeek);
    const specificShifts = myShifts.filter(s => s.type === 'specific').sort((a,b) => a.date.localeCompare(b.date));

    const fixedRows = fixedShifts.map(s => `<tr>
      <td><strong>${DAY_FULL_NAMES[s.dayOfWeek]}</strong></td>
      <td>${s.startTime}</td>
      <td>${s.endTime}</td>
      <td><button class="btn btn-danger btn-sm del-shift" data-id="${s.id}">削除</button></td>
    </tr>`).join('');

    const specificRows = specificShifts.map(s => {
      const d = new Date(s.date + 'T00:00:00');
      const label = `${d.getMonth()+1}/${d.getDate()}（${DAY_NAMES[dateDow(d)]}）`;
      return `<tr>
        <td><strong>${s.date}</strong>&nbsp;<span style="color:var(--text-muted);font-size:12px;">${label}</span></td>
        <td>${s.startTime}</td>
        <td>${s.endTime}</td>
        <td><button class="btn btn-danger btn-sm del-shift" data-id="${s.id}">削除</button></td>
      </tr>`;
    }).join('');

    const fixedTable = fixedShifts.length === 0
      ? '<p class="empty-state" style="padding:20px;">固定シフトが登録されていません</p>'
      : `<table class="data-table"><thead><tr><th>曜日</th><th>開始</th><th>終了</th><th>操作</th></tr></thead><tbody>${fixedRows}</tbody></table>`;

    const specificTable = specificShifts.length === 0
      ? '<p class="empty-state" style="padding:20px;">特定日シフトが登録されていません</p>'
      : `<table class="data-table"><thead><tr><th>日付</th><th>開始</th><th>終了</th><th>操作</th></tr></thead><tbody>${specificRows}</tbody></table>`;

    rightPanel = `<div style="display:flex;flex-direction:column;gap:20px;">
      <div class="card">
        <div class="section-header">
          <span class="section-title" style="display:flex;align-items:center;gap:10px;">
            <div class="avatar" style="background:${avatarColor(inst.name)};width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:white;">${escHtml(inst.name[0]||'?')}</div>
            ${escHtml(inst.name)}のシフト管理
          </span>
        </div>
      </div>

      <div class="card">
        <div class="shift-type-header">
          <span class="shift-type-title">
            <span class="shift-type-icon icon-fixed"></span>
            固定シフト（毎週繰り返し）
          </span>
          <button id="addFixed" class="btn btn-primary btn-sm">+ 固定シフトを追加</button>
        </div>
        ${fixedTable}
      </div>

      <div class="card">
        <div class="shift-type-header">
          <span class="shift-type-title">
            <span class="shift-type-icon icon-specific"></span>
            特定日シフト（指定日のみ）
          </span>
          <button id="addSpecific" class="btn btn-primary btn-sm">+ 特定日シフトを追加</button>
        </div>
        ${specificTable}
      </div>
    </div>`;
  }

  return `<div class="shifts-layout">
    ${leftPanel}
    <div>${rightPanel}</div>
  </div>`;
}

function bindShifts() {
  document.querySelectorAll('.instructor-item').forEach(item => {
    item.onclick = () => {
      state.selectedInstructorId = item.dataset.id;
      render();
    };
  });

  const addFixed = document.getElementById('addFixed');
  if (addFixed) addFixed.onclick = () => showShiftForm('fixed');

  const addSpecific = document.getElementById('addSpecific');
  if (addSpecific) addSpecific.onclick = () => showShiftForm('specific');

  document.querySelectorAll('.del-shift').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('このシフトを削除しますか？')) return;
      await api.deleteShift(btn.dataset.id);
      await loadData();
      render();
      toast('シフトを削除しました');
    };
  });
}

function generateTimeOpts(startH = 7, endH = 23) {
  let opts = '';
  for (let h = startH; h <= endH; h++) {
    opts += `<option value="${pad(h)}:00">${pad(h)}:00</option>`;
    if (h < endH) opts += `<option value="${pad(h)}:30">${pad(h)}:30</option>`;
  }
  return opts;
}

function showShiftForm(type) {
  const isFixed = type === 'fixed';
  const title = isFixed ? '固定シフトを追加' : '特定日シフトを追加';
  const todayStr = toDateStr(new Date());

  const dayOpts = DAY_FULL_NAMES.map((d, i) => `<option value="${i}">${d}</option>`).join('');
  const timeOpts = generateTimeOpts();

  showModal(title, `
    <form id="shiftForm">
      ${isFixed ? `
      <div class="form-group">
        <label>曜日<span class="required">*</span></label>
        <select id="sDow">${dayOpts}</select>
      </div>` : `
      <div class="form-group">
        <label>日付<span class="required">*</span></label>
        <input type="date" id="sDate" value="${todayStr}" required>
      </div>`}
      <div class="form-row">
        <div class="form-group">
          <label>開始時間<span class="required">*</span></label>
          <select id="sStart">${timeOpts}</select>
        </div>
        <div class="form-group">
          <label>終了時間<span class="required">*</span></label>
          <select id="sEnd">${timeOpts}</select>
        </div>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">追加</button>
        <button type="button" class="btn btn-ghost" id="cancelShift">キャンセル</button>
      </div>
    </form>
  `);

  // Default end time to 1 hour after start
  const startSel = document.getElementById('sStart');
  const endSel = document.getElementById('sEnd');
  startSel.value = '09:00';
  endSel.value = '18:00';

  document.getElementById('cancelShift').onclick = closeModal;

  document.getElementById('shiftForm').onsubmit = async (e) => {
    e.preventDefault();
    const startTime = document.getElementById('sStart').value;
    const endTime = document.getElementById('sEnd').value;
    if (parseTime(startTime) >= parseTime(endTime)) {
      toast('終了時間は開始時間より後にしてください', 'error');
      return;
    }

    const data = { instructorId: state.selectedInstructorId, type, startTime, endTime };
    if (isFixed) {
      data.dayOfWeek = parseInt(document.getElementById('sDow').value);
    } else {
      data.date = document.getElementById('sDate').value;
      if (!data.date) { toast('日付を入力してください', 'error'); return; }
    }

    await api.createShift(data);
    closeModal();
    await loadData();
    render();
    toast('シフトを追加しました', 'success');
  };
}

// ===== MODAL =====
function showModal(title, bodyHtml, wide = false) {
  closeModal();
  const overlay = document.createElement('div');
  overlay.id = 'modal-overlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal${wide?' modal-lg':''}">
      <div class="modal-header">
        <span class="modal-title">${escHtml(title)}</span>
        <button class="modal-close" id="modalClose">×</button>
      </div>
      <div class="modal-body">${bodyHtml}</div>
    </div>`;
  document.body.appendChild(overlay);
  document.getElementById('modalClose').onclick = closeModal;
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  // Focus first input
  setTimeout(() => {
    const first = overlay.querySelector('input, select');
    if (first) first.focus();
  }, 50);
}

function closeModal() {
  const el = document.getElementById('modal-overlay');
  if (el) el.remove();
}

// ===== DATA =====
async function loadData() {
  [state.instructors, state.shifts] = await Promise.all([
    api.getInstructors(),
    api.getShifts(),
  ]);
}

// ===== INIT =====
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    state.currentView = btn.dataset.view;
    render();
  });
});

(async () => {
  try {
    await loadData();
    render();
  } catch (err) {
    document.getElementById('app').innerHTML =
      `<div class="empty-state"><p style="color:var(--danger);">サーバーへの接続に失敗しました。<br>サーバーが起動しているか確認してください。</p></div>`;
  }
})();
