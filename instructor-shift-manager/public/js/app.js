// ===== STATE =====
const state = {
  instructors: [],
  shifts: [],
  subjects: [],
  bookings: [],
  customers: [],
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
  getSubjects: () => api.req('GET', '/api/subjects'),
  createSubject: (d) => api.req('POST', '/api/subjects', d),
  updateSubject: (id, d) => api.req('PUT', `/api/subjects/${id}`, d),
  deleteSubject: (id) => api.req('DELETE', `/api/subjects/${id}`),
  getBookings: () => api.req('GET', '/api/bookings'),
  createBooking: (d) => api.req('POST', '/api/bookings', d),
  updateBooking: (id, d) => api.req('PUT', `/api/bookings/${id}`, d),
  deleteBooking: (id) => api.req('DELETE', `/api/bookings/${id}`),
  getCustomers: () => api.req('GET', '/api/customers'),
  createCustomer: (d) => api.req('POST', '/api/customers', d),
  updateCustomer: (id, d) => api.req('PUT', `/api/customers/${id}`, d),
  deleteCustomer: (id) => api.req('DELETE', `/api/customers/${id}`),
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
  return state.instructors.filter(inst => {
    // 退職日以降は対応不可
    if (inst.retirementDate && dateStr >= inst.retirementDate) return false;
    // 休日設定があれば対応不可
    if (state.shifts.some(s => s.instructorId === inst.id && s.type === 'holiday' && s.date === dateStr)) return false;
    return state.shifts.some(s => {
      if (s.instructorId !== inst.id) return false;
      const st = parseTime(s.startTime);
      const et = parseTime(s.endTime);
      const inRange = st <= hour && et >= hour + 50 / 60;
      if (s.type === 'fixed') return s.dayOfWeek === dow && inRange;
      if (s.type === 'specific') return s.date === dateStr && inRange;
      return false;
    });
  });
}

function slotLevel(count) {
  if (count === 0) return 0;
  if (count <= 2) return 1;
  if (count <= 4) return 2;
  if (count <= 6) return 3;
  return 4;
}

function getBooking(dateStr, hour) {
  return state.bookings.find(b => b.date === dateStr && b.hour === hour) || null;
}

function getCustomerCountForSlot(dateStr, hour) {
  return state.customers.reduce((sum, c) => {
    if (dateStr < c.startDate || dateStr > c.endDate) return sum;
    if (c.startTime && c.endTime) {
      const st = parseTime(c.startTime);
      const et = parseTime(c.endTime);
      if (!(st <= hour && et >= hour + 50 / 60)) return sum;
    }
    return sum + (c.count || 0);
  }, 0);
}

function showCapacityErrors(errors) {
  const existing = document.getElementById('capacityErrorBox');
  if (existing) existing.remove();

  const shown = errors.slice(0, 5);
  const more = errors.length > 5 ? `<div class="capacity-error-more">他 ${errors.length - 5} 件のスロットで不足</div>` : '';
  const box = document.createElement('div');
  box.id = 'capacityErrorBox';
  box.className = 'capacity-error-box';
  box.innerHTML = `
    <div class="capacity-error-title">在庫不足のスロット（${errors.length}件）</div>
    ${shown.map(e => `
      <div class="capacity-error-row">
        <span>${e.dateStr} ${pad(e.hour)}:00〜${pad(e.hour)}:50</span>
        <span class="capacity-error-num">残り ${e.remaining}名</span>
      </div>`).join('')}
    ${more}
  `;
  const actions = document.querySelector('.form-actions');
  if (actions) actions.before(box);
}

function validateCustomerCapacity(startDate, endDate, startTime, endTime, count, excludeCustomerId = null) {
  const errors = [];
  const end = new Date(endDate + 'T00:00:00');
  for (let d = new Date(startDate + 'T00:00:00'); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = toDateStr(d);
    const hoursToCheck = HOURS.filter(h => {
      if (!startTime || !endTime) return true;
      return parseTime(startTime) <= h && parseTime(endTime) >= h + 50 / 60;
    });
    for (const hour of hoursToCheck) {
      const avail = getAvailableInstructors(new Date(dateStr + 'T00:00:00'), hour);
      const existingCustomers = state.customers
        .filter(c => c.id !== excludeCustomerId)
        .reduce((sum, c) => {
          if (dateStr < c.startDate || dateStr > c.endDate) return sum;
          if (c.startTime && c.endTime) {
            if (!(parseTime(c.startTime) <= hour && parseTime(c.endTime) >= hour + 50 / 60)) return sum;
          }
          return sum + (c.count || 0);
        }, 0);
      const manualBooking = getBooking(dateStr, hour);
      const manualCount = manualBooking ? manualBooking.count : 0;
      const remaining = avail.length - existingCustomers - manualCount;
      if (remaining < count) {
        errors.push({ dateStr, hour, remaining: Math.max(0, remaining), available: avail.length });
      }
    }
  }
  return errors;
}

function getCustomersForSlot(dateStr, hour) {
  return state.customers.filter(c => {
    if (dateStr < c.startDate || dateStr > c.endDate) return false;
    if (c.startTime && c.endTime) {
      const st = parseTime(c.startTime);
      const et = parseTime(c.endTime);
      if (!(st <= hour && et >= hour + 50 / 60)) return false;
    }
    return true;
  });
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
    case 'subjects':    app.innerHTML = buildSubjects();    bindSubjects();    break;
    case 'customers':   app.innerHTML = buildCustomers();   bindCustomers();   break;
  }
}

// ===== DASHBOARD =====
const HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 6..22
const DAY_NAMES = ['月','火','水','木','金','土','日'];

function buildDashboard() {
  const dates = getWeekDates(state.weekOffset);
  const todayStr = toDateStr(new Date());
  const fmt = d => `${d.getMonth()+1}/${d.getDate()}`;

  let rows = '';
  for (let hi = 0; hi < HOURS.length; hi++) {
    const hour = HOURS[hi];
    let cells = '';
    dates.forEach(date => {
      const dateStr = toDateStr(date);
      const avail = getAvailableInstructors(date, hour);
      const cnt = avail.length;
      const booking = getBooking(dateStr, hour);
      const manualBooked = booking ? booking.count : 0;
      const customerBooked = getCustomerCountForSlot(dateStr, hour);
      const booked = manualBooked + customerBooked;
      const remaining = Math.max(0, cnt - booked);
      const isFull = cnt > 0 && remaining === 0;
      const lvlClass = isFull ? 'lvl-0 full' : `lvl-${slotLevel(remaining)}`;
      let cellContent = '';
      if (cnt > 0) {
        if (isFull) {
          cellContent = `<div class="slot-count slot-full-text">満</div>`;
        } else {
          cellContent = `<div class="slot-count">${remaining}</div><div class="slot-unit">残り</div>`;
          if (booked > 0) cellContent += `<div class="slot-booked">予約${booked}名</div>`;
        }
      }
      cells += `<td class="slot-cell ${lvlClass}"
        data-date="${dateStr}" data-hour="${hour}"
        title="${dateStr} ${pad(hour)}:00〜${pad(hour)}:50  対応可能: ${cnt}名 / 顧客: ${customerBooked}名 / 手動: ${manualBooked}名 / 残り: ${remaining}名">
        ${cellContent}
      </td>`;
    });
    rows += `<tr>
      <td class="td-time">${pad(hour)}:00<br><span style="font-size:9px;opacity:.6">↓</span><br>${pad(hour)}:50</td>
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
      <span style="font-weight:600;">残枠数：</span>
      <span class="legend-chip"><span class="dot dot-full"></span>満員</span>
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
  const dateStr = toDateStr(date);
  const dow = DAY_NAMES[dateDow(date)];
  const dateLabel = `${date.getMonth()+1}月${date.getDate()}日（${dow}）`;
  const booking = getBooking(dateStr, hour);
  const manualBooked = booking ? booking.count : 0;
  const customerBooked = getCustomerCountForSlot(dateStr, hour);
  const customersForSlot = getCustomersForSlot(dateStr, hour);
  const booked = manualBooked + customerBooked;
  const remaining = Math.max(0, avail.length - booked);

  const instructorRows = avail.length === 0
    ? `<div class="no-instructors">この時間帯に対応可能な講師はいません</div>`
    : `<table class="modal-table">
        <thead><tr><th>名前</th><th>所属会社</th><th>担当科目</th><th>契約形態</th><th>単価</th></tr></thead>
        <tbody>
          ${avail.map(inst => `<tr>
            <td><strong>${escHtml(inst.name)}</strong></td>
            <td>${inst.company ? escHtml(inst.company) : '<span class="text-muted">—</span>'}</td>
            <td>${(inst.subjects||[]).map(s=>`<span class="tag">${escHtml(s)}</span>`).join('')}</td>
            <td><span class="badge">${escHtml(inst.contractType)}</span></td>
            <td class="price-cell">${inst.unitPrice ? inst.unitPrice.toLocaleString()+'PHP' : '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;

  showModal(`${dateLabel} ${pad(hour)}:00〜${pad(hour)}:50`, `
    <div class="modal-info">
      <div>
        <div class="modal-info-time">${pad(hour)}:00〜${pad(hour)}:50</div>
        <div class="modal-info-detail">${dateLabel}</div>
      </div>
      <span class="avail-count">${avail.length}名 対応可能</span>
    </div>
    <div class="booking-form">
      ${customersForSlot.length > 0 ? `
      <div class="customer-booking-list">
        <div class="customer-booking-header">顧客予約</div>
        ${customersForSlot.map(c => `
          <div class="customer-booking-item">
            <span class="customer-booking-name">${escHtml(c.name)}</span>
            <span class="customer-booking-period">${c.startDate}〜${c.endDate}</span>
            <span class="customer-booking-count">${c.count}名</span>
          </div>
        `).join('')}
        <div class="customer-booking-subtotal">顧客合計: ${customerBooked}名</div>
      </div>` : ''}
      <div class="booking-form-row">
        <span class="booking-label">追加予約</span>
        <div class="booking-input-group">
          <button type="button" class="btn btn-ghost btn-sm" id="bookingDec">−</button>
          <input type="number" id="bookingCount" class="booking-count-input"
            value="${manualBooked}" min="0" max="${avail.length}">
          <button type="button" class="btn btn-ghost btn-sm" id="bookingInc">＋</button>
          <span class="booking-remaining" id="bookingRemaining"
            style="color:${remaining===0&&avail.length>0?'var(--danger)':'var(--text-muted)'};">
            残り ${remaining}名
          </span>
        </div>
        <button class="btn btn-primary btn-sm" id="saveBooking">保存</button>
      </div>
    </div>
    <div style="margin-top:4px;">
      <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">対応可能な講師</div>
      ${instructorRows}
    </div>
  `, true);

  const countInput = document.getElementById('bookingCount');
  const remainingEl = document.getElementById('bookingRemaining');
  const maxCount = avail.length;

  function updateRemaining() {
    const count = Math.max(0, Math.min(maxCount, parseInt(countInput.value) || 0));
    countInput.value = count;
    const rem = maxCount - customerBooked - count;
    remainingEl.textContent = `残り ${Math.max(0, rem)}名`;
    remainingEl.style.color = rem <= 0 && maxCount > 0 ? 'var(--danger)' : 'var(--text-muted)';
  }

  document.getElementById('bookingDec').onclick = () => {
    countInput.value = Math.max(0, parseInt(countInput.value) - 1);
    updateRemaining();
  };
  document.getElementById('bookingInc').onclick = () => {
    countInput.value = Math.min(maxCount - customerBooked, parseInt(countInput.value) + 1);
    updateRemaining();
  };
  countInput.oninput = updateRemaining;

  document.getElementById('saveBooking').onclick = async () => {
    const count = parseInt(countInput.value) || 0;
    if (booking) {
      if (count === 0) {
        await api.deleteBooking(booking.id);
      } else {
        await api.updateBooking(booking.id, { count });
      }
    } else if (count > 0) {
      await api.createBooking({ date: dateStr, hour, count });
    }
    closeModal();
    await loadData();
    render();
    toast('予約数を更新しました', 'success');
  };
}

// ===== INSTRUCTORS =====
const CONTRACT_TYPES = ['業務委託','正社員','パート','アルバイト'];

function buildInstructors() {
  const rows = state.instructors.map(inst => {
    const isRetired = inst.retirementDate && inst.retirementDate <= toDateStr(new Date());
    return `
    <tr${isRetired ? ' style="opacity:.55;"' : ''}>
      <td>
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="avatar" style="background:${avatarColor(inst.name)}">${escHtml(inst.name[0]||'?')}</div>
          <div>
            <span class="instructor-name">${escHtml(inst.name)}</span>
            ${isRetired ? '<span class="badge" style="background:#6b7280;margin-left:6px;">退職済</span>' : ''}
          </div>
        </div>
      </td>
      <td>${inst.company ? escHtml(inst.company) : '<span class="text-muted">—</span>'}</td>
      <td>${(inst.subjects||[]).map(s=>`<span class="tag">${escHtml(s)}</span>`).join('') || '<span class="text-muted">—</span>'}</td>
      <td><span class="badge">${escHtml(inst.contractType)}</span></td>
      <td class="price-cell">${inst.unitPrice ? inst.unitPrice.toLocaleString()+'PHP' : '—'}</td>
      <td>${inst.retirementDate ? `<span style="color:${isRetired?'#6b7280':'var(--text-muted)'};">${inst.retirementDate}</span>` : '<span class="text-muted">—</span>'}</td>
      <td>
        <div class="action-btns">
          <button class="btn btn-ghost btn-sm edit-inst" data-id="${inst.id}">編集</button>
          <button class="btn btn-danger btn-sm del-inst" data-id="${inst.id}">削除</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  const body = state.instructors.length === 0
    ? `<div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        <p>講師が登録されていません<br><small>右上の「講師を追加」から登録してください</small></p>
      </div>`
    : `<table class="data-table">
        <thead><tr><th>名前</th><th>所属会社</th><th>担当科目</th><th>契約形態</th><th>単価（PHP/時）</th><th>退職日</th><th>操作</th></tr></thead>
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
          <label>所属会社</label>
          <input type="text" id="iCompany" value="${isEdit?escHtml(inst.company):''}" placeholder="株式会社〇〇">
        </div>
      </div>
      <div class="form-group">
        <label>担当科目</label>
        ${state.subjects.length === 0
          ? `<p class="subjects-empty-hint">科目が登録されていません。<a href="#" id="goToSubjects">科目管理</a>から先に追加してください。</p>`
          : `<div class="checkbox-grid">${state.subjects.map(sub => {
              const checked = isEdit && (inst.subjects||[]).includes(sub.name) ? 'checked' : '';
              return `<label class="checkbox-item">
                <input type="checkbox" name="subjects" value="${escHtml(sub.name)}" ${checked}>
                <span>${escHtml(sub.name)}</span>
              </label>`;
            }).join('')}</div>`
        }
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>契約形態<span class="required">*</span></label>
          <select id="iContract">${contractOpts}</select>
        </div>
        <div class="form-group">
          <label>単価（PHP/時間）</label>
          <input type="number" id="iPrice" value="${isEdit&&inst.unitPrice?inst.unitPrice:''}" min="0" step="1" placeholder="500">
        </div>
      </div>
      <div class="form-group">
        <label>退職日</label>
        <input type="date" id="iRetirement" value="${isEdit&&inst.retirementDate?inst.retirementDate:''}">
        <small style="color:var(--text-muted);font-size:12px;">設定した日以降はシフトにカウントされません</small>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">${isEdit?'更新':'追加'}</button>
        <button type="button" class="btn btn-ghost" id="cancelForm">キャンセル</button>
      </div>
    </form>
  `);

  document.getElementById('cancelForm').onclick = closeModal;

  const goSubjects = document.getElementById('goToSubjects');
  if (goSubjects) {
    goSubjects.onclick = (e) => {
      e.preventDefault();
      closeModal();
      state.currentView = 'subjects';
      render();
    };
  }

  document.getElementById('instForm').onsubmit = async (e) => {
    e.preventDefault();
    const data = {
      name: document.getElementById('iName').value.trim(),
      company: document.getElementById('iCompany').value.trim(),
      subjects: [...document.querySelectorAll('input[name="subjects"]:checked')].map(el => el.value),
      contractType: document.getElementById('iContract').value,
      unitPrice: parseInt(document.getElementById('iPrice').value) || 0,
      retirementDate: document.getElementById('iRetirement').value || null,
    };
    if (!data.name) { toast('名前は必須です', 'error'); return; }
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
        <div class="instructor-item-company">${inst.company ? escHtml(inst.company)+' · ' : ''}${shiftCount}件</div>
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
    const holidays = myShifts.filter(s => s.type === 'holiday').sort((a,b) => a.date.localeCompare(b.date));

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

    const holidayRows = holidays.map(s => {
      const d = new Date(s.date + 'T00:00:00');
      const label = `${d.getMonth()+1}/${d.getDate()}（${DAY_NAMES[dateDow(d)]}）`;
      return `<tr>
        <td><strong>${s.date}</strong>&nbsp;<span style="color:var(--text-muted);font-size:12px;">${label}</span></td>
        <td>${s.note ? `<span class="badge">${escHtml(s.note)}</span>` : '<span class="text-muted">—</span>'}</td>
        <td><button class="btn btn-danger btn-sm del-shift" data-id="${s.id}">削除</button></td>
      </tr>`;
    }).join('');
    const holidayTable = holidays.length === 0
      ? '<p class="empty-state" style="padding:20px;">休日設定がありません</p>'
      : `<table class="data-table"><thead><tr><th>日付</th><th>理由</th><th>操作</th></tr></thead><tbody>${holidayRows}</tbody></table>`;

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

      <div class="card">
        <div class="shift-type-header">
          <span class="shift-type-title">
            <span class="shift-type-icon icon-holiday"></span>
            休日設定（有給・代休など）
          </span>
          <button id="addHoliday" class="btn btn-secondary btn-sm">+ 休日を追加</button>
        </div>
        ${holidayTable}
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

  const addHoliday = document.getElementById('addHoliday');
  if (addHoliday) addHoliday.onclick = () => showHolidayForm();

  document.querySelectorAll('.del-shift').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('このエントリを削除しますか？')) return;
      await api.deleteShift(btn.dataset.id);
      await loadData();
      render();
      toast('削除しました');
    };
  });
}

function showHolidayForm() {
  const todayStr = toDateStr(new Date());
  const noteOpts = ['有給休暇','代休','病欠','その他'].map(n => `<option value="${n}">${n}</option>`).join('');

  showModal('休日を追加', `
    <form id="holidayForm">
      <div class="form-group">
        <label>日付<span class="required">*</span></label>
        <input type="date" id="hDate" value="${todayStr}" required>
      </div>
      <div class="form-group">
        <label>理由</label>
        <select id="hNote">
          <option value="">選択しない</option>
          ${noteOpts}
        </select>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">追加</button>
        <button type="button" class="btn btn-ghost" id="cancelHoliday">キャンセル</button>
      </div>
    </form>
  `);

  document.getElementById('cancelHoliday').onclick = closeModal;

  document.getElementById('holidayForm').onsubmit = async (e) => {
    e.preventDefault();
    const date = document.getElementById('hDate').value;
    if (!date) { toast('日付を入力してください', 'error'); return; }

    // 同日に既に休日設定があるか確認
    const dup = state.shifts.find(s => s.instructorId === state.selectedInstructorId && s.type === 'holiday' && s.date === date);
    if (dup) { toast('その日はすでに休日設定があります', 'error'); return; }

    const note = document.getElementById('hNote').value;
    await api.createShift({ instructorId: state.selectedInstructorId, type: 'holiday', date, note });
    closeModal();
    await loadData();
    render();
    toast('休日を追加しました', 'success');
  };
}

function generateTimeOpts(startH = 6, endH = 23) {
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
  endSel.value = '17:00';

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

// ===== SUBJECTS =====
function buildSubjects() {
  const rows = state.subjects.map(sub => {
    const useCount = state.instructors.filter(i => (i.subjects||[]).includes(sub.name)).length;
    return `<tr>
      <td><strong>${escHtml(sub.name)}</strong></td>
      <td>${useCount > 0 ? `<span class="badge">${useCount}名が担当</span>` : '<span class="text-muted">—</span>'}</td>
      <td>
        <div class="action-btns">
          <button class="btn btn-ghost btn-sm edit-subject" data-id="${sub.id}" data-name="${escHtml(sub.name)}">編集</button>
          <button class="btn btn-danger btn-sm del-subject" data-id="${sub.id}" data-name="${escHtml(sub.name)}"${useCount > 0 ? ' data-used="1"' : ''}>削除</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  const body = state.subjects.length === 0
    ? `<div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
        <p>科目が登録されていません<br><small>右上の「科目を追加」から登録してください</small></p>
      </div>`
    : `<table class="data-table">
        <thead><tr><th>科目名</th><th>利用状況</th><th>操作</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;

  return `<div class="card">
    <div class="section-header">
      <span class="section-title">科目管理（${state.subjects.length}件）</span>
      <button id="addSubject" class="btn btn-primary">+ 科目を追加</button>
    </div>
    <div class="section-body">${body}</div>
  </div>`;
}

function bindSubjects() {
  document.getElementById('addSubject').onclick = () => showSubjectForm(null);

  document.querySelectorAll('.edit-subject').forEach(btn => {
    btn.onclick = () => showSubjectForm({ id: btn.dataset.id, name: btn.dataset.name });
  });

  document.querySelectorAll('.del-subject').forEach(btn => {
    btn.onclick = async () => {
      const name = btn.dataset.name;
      const isUsed = btn.dataset.used === '1';
      const msg = isUsed
        ? `「${name}」は講師に設定されていますが削除しますか？\n（講師の担当科目からも削除されます）`
        : `「${name}」を削除しますか？`;
      if (!confirm(msg)) return;

      await api.deleteSubject(btn.dataset.id);

      // 講師データから該当科目名を除去
      if (isUsed) {
        const targets = state.instructors.filter(i => (i.subjects||[]).includes(name));
        await Promise.all(targets.map(i =>
          api.updateInstructor(i.id, { ...i, subjects: i.subjects.filter(s => s !== name) })
        ));
      }

      await loadData();
      render();
      toast(`「${name}」を削除しました`);
    };
  });
}

function showSubjectForm(subject) {
  const isEdit = !!subject;
  showModal(isEdit ? '科目を編集' : '科目を追加', `
    <form id="subjectForm">
      <div class="form-group">
        <label>科目名<span class="required">*</span></label>
        <input type="text" id="sName" value="${isEdit ? escHtml(subject.name) : ''}" placeholder="例：英語・数学・プログラミング" required>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">${isEdit ? '更新' : '追加'}</button>
        <button type="button" class="btn btn-ghost" id="cancelSubject">キャンセル</button>
      </div>
    </form>
  `);

  document.getElementById('cancelSubject').onclick = closeModal;

  document.getElementById('subjectForm').onsubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById('sName').value.trim();
    if (!name) { toast('科目名は必須です', 'error'); return; }

    const duplicate = state.subjects.find(s => s.name === name && (!isEdit || s.id !== subject.id));
    if (duplicate) { toast('同じ名前の科目がすでに存在します', 'error'); return; }

    if (isEdit) {
      await api.updateSubject(subject.id, { name });
      // 講師データの科目名も更新
      const targets = state.instructors.filter(i => (i.subjects||[]).includes(subject.name));
      await Promise.all(targets.map(i =>
        api.updateInstructor(i.id, { ...i, subjects: i.subjects.map(s => s === subject.name ? name : s) })
      ));
      toast(`「${name}」に更新しました`, 'success');
    } else {
      await api.createSubject({ name });
      toast(`「${name}」を追加しました`, 'success');
    }

    closeModal();
    await loadData();
    render();
  };
}

// ===== CUSTOMERS =====
function buildCustomers() {
  const rows = state.customers.map(c => {
    const timeRange = c.startTime && c.endTime
      ? `${c.startTime}〜${c.endTime}`
      : '終日';
    const today = toDateStr(new Date());
    const isActive = today >= c.startDate && today <= c.endDate;
    const isPast = today > c.endDate;
    return `<tr${isPast ? ' style="opacity:.55;"' : ''}>
      <td>
        <strong>${escHtml(c.name)}</strong>
        ${isActive ? '<span class="badge" style="background:#d1fae5;color:#065f46;margin-left:6px;">進行中</span>' : ''}
        ${isPast ? '<span class="badge" style="background:#f1f5f9;color:#64748b;margin-left:6px;">終了</span>' : ''}
      </td>
      <td>${c.startDate}&nbsp;〜&nbsp;${c.endDate}</td>
      <td>${timeRange}</td>
      <td><strong>${c.count}</strong>名</td>
      <td>${c.note ? escHtml(c.note) : '<span class="text-muted">—</span>'}</td>
      <td>
        <div class="action-btns">
          <button class="btn btn-ghost btn-sm edit-customer" data-id="${c.id}">編集</button>
          <button class="btn btn-danger btn-sm del-customer" data-id="${c.id}">削除</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  const body = state.customers.length === 0
    ? `<div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>
        <p>顧客が登録されていません<br><small>右上の「顧客を追加」から登録してください</small></p>
      </div>`
    : `<table class="data-table">
        <thead><tr><th>顧客名</th><th>期間</th><th>時間帯</th><th>人数</th><th>備考</th><th>操作</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;

  return `<div class="card">
    <div class="section-header">
      <span class="section-title">顧客管理（${state.customers.length}件）</span>
      <button id="addCustomer" class="btn btn-primary">+ 顧客を追加</button>
    </div>
    <div class="section-body">${body}</div>
  </div>`;
}

function bindCustomers() {
  document.getElementById('addCustomer').onclick = () => showCustomerForm(null);

  document.querySelectorAll('.edit-customer').forEach(btn => {
    btn.onclick = () => {
      const c = state.customers.find(x => x.id === btn.dataset.id);
      if (c) showCustomerForm(c);
    };
  });

  document.querySelectorAll('.del-customer').forEach(btn => {
    btn.onclick = async () => {
      const c = state.customers.find(x => x.id === btn.dataset.id);
      if (!c) return;
      if (!confirm(`「${c.name}」を削除しますか？`)) return;
      await api.deleteCustomer(btn.dataset.id);
      await loadData();
      render();
      toast(`「${c.name}」を削除しました`);
    };
  });
}

function showCustomerForm(customer) {
  const isEdit = !!customer;
  const todayStr = toDateStr(new Date());
  const timeOpts = generateTimeOpts();

  showModal(isEdit ? '顧客情報を編集' : '顧客を追加', `
    <form id="customerForm">
      <div class="form-group">
        <label>顧客名・会社名<span class="required">*</span></label>
        <input type="text" id="cName" value="${isEdit ? escHtml(customer.name) : ''}" placeholder="例：トヨタ自動車、山田商事" required>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>開始日<span class="required">*</span></label>
          <input type="date" id="cStart" value="${isEdit ? customer.startDate : todayStr}" required>
        </div>
        <div class="form-group">
          <label>終了日<span class="required">*</span></label>
          <input type="date" id="cEnd" value="${isEdit ? customer.endDate : todayStr}" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>開始時間<span class="hint">（空欄なら終日）</span></label>
          <select id="cStartTime">
            <option value="">指定なし（終日）</option>
            ${timeOpts}
          </select>
        </div>
        <div class="form-group">
          <label>終了時間</label>
          <select id="cEndTime">
            <option value="">指定なし（終日）</option>
            ${timeOpts}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>人数<span class="required">*</span></label>
          <input type="number" id="cCount" value="${isEdit ? customer.count : ''}" min="1" step="1" placeholder="10" required>
        </div>
        <div class="form-group">
          <label>備考</label>
          <input type="text" id="cNote" value="${isEdit && customer.note ? escHtml(customer.note) : ''}" placeholder="例：法人研修、英語コース">
        </div>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">${isEdit ? '更新' : '追加'}</button>
        <button type="button" class="btn btn-ghost" id="cancelCustomer">キャンセル</button>
      </div>
    </form>
  `);

  if (isEdit && customer.startTime) document.getElementById('cStartTime').value = customer.startTime;
  if (isEdit && customer.endTime) document.getElementById('cEndTime').value = customer.endTime;

  document.getElementById('cancelCustomer').onclick = closeModal;

  document.getElementById('customerForm').onsubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById('cName').value.trim();
    const startDate = document.getElementById('cStart').value;
    const endDate = document.getElementById('cEnd').value;
    const startTime = document.getElementById('cStartTime').value;
    const endTime = document.getElementById('cEndTime').value;
    const count = parseInt(document.getElementById('cCount').value) || 0;
    const note = document.getElementById('cNote').value.trim();

    if (!name) { toast('顧客名は必須です', 'error'); return; }
    if (!startDate || !endDate) { toast('期間を入力してください', 'error'); return; }
    if (endDate < startDate) { toast('終了日は開始日以降にしてください', 'error'); return; }
    if (count < 1) { toast('人数は1名以上にしてください', 'error'); return; }
    if (startTime && endTime && parseTime(startTime) >= parseTime(endTime)) {
      toast('終了時間は開始時間より後にしてください', 'error'); return;
    }

    const capacityErrors = validateCustomerCapacity(
      startDate, endDate, startTime, endTime, count,
      isEdit ? customer.id : null
    );
    if (capacityErrors.length > 0) {
      const shown = capacityErrors.slice(0, 3);
      const lines = shown.map(e =>
        `・${e.dateStr} ${pad(e.hour)}:00〜${pad(e.hour)}:50（残り${e.remaining}名）`
      ).join('\n');
      const more = capacityErrors.length > 3 ? `\n他 ${capacityErrors.length - 3} 件` : '';
      toast(`在庫不足のスロットがあります:\n${lines}${more}`, 'error');
      showCapacityErrors(capacityErrors);
      return;
    }

    const data = { name, startDate, endDate, count, note,
      startTime: startTime || null, endTime: endTime || null };

    if (isEdit) {
      await api.updateCustomer(customer.id, data);
      toast(`「${name}」を更新しました`, 'success');
    } else {
      await api.createCustomer(data);
      toast(`「${name}」を追加しました`, 'success');
    }
    closeModal();
    await loadData();
    render();
  };
}

// ===== DATA =====
async function loadData() {
  [state.instructors, state.shifts, state.subjects, state.bookings, state.customers] = await Promise.all([
    api.getInstructors(),
    api.getShifts(),
    api.getSubjects(),
    api.getBookings(),
    api.getCustomers(),
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
