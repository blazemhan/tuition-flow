/* ===== API BASE URL ===== */
const BASE_URL = 'http://localhost:8080/api';

/* ===== AUTH HELPERS ===== */
const Auth = {
  getToken: () => localStorage.getItem('edupay_token'),
  getSchoolName: () => localStorage.getItem('edupay_school') || 'School',
  setSession: (data) => {
    localStorage.setItem('edupay_token', data.token);
    localStorage.setItem('edupay_school', data.schoolName);
    localStorage.setItem('edupay_email', data.adminEmail);
  },
  clearSession: () => {
    localStorage.removeItem('edupay_token');
    localStorage.removeItem('edupay_school');
    localStorage.removeItem('edupay_email');
  },
  isLoggedIn: () => !!localStorage.getItem('edupay_token'),
};

/* ===== LOCAL STATE (fallback until API responds) ===== */
let students = [];
let payments = [];
let feeStructure = [];
let reminderLogs = [];

/* ===== AVATAR COLORS ===== */
const avatarColors = [
  '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444',
  '#06b6d4', '#ec4899', '#6366f1', '#14b8a6', '#f97316'
];

/* ===== API HELPERS ===== */

async function apiFetch(path, options = {}) {
  const token = Auth.getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
    ...options.headers,
  };
  try {
    const res = await fetch(BASE_URL + path, { ...options, headers });
    if (res.status === 401) {
      Auth.clearSession();
      showLoginScreen();
      throw new Error('Session expired. Please log in again.');
    }
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`);
    return json.data;
  } catch (err) {
    showToast('❌ ' + err.message, 'error');
    throw err;
  }
}

const api = {
  getStudents: () => apiFetch('/students'),
  getStudent: (id) => apiFetch(`/students/${id}`),
  createStudent: (body) => apiFetch('/students', { method: 'POST', body: JSON.stringify(body) }),
  updateStudent: (id, body) => apiFetch(`/students/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteStudent: (id) => apiFetch(`/students/${id}`, { method: 'DELETE' }),
  getBalance: (id) => apiFetch(`/students/${id}/balance`),

  getPayments: () => apiFetch('/payments'),
  getPaymentsByStudent: (id) => apiFetch(`/payments/student/${id}`),
  recordPayment: (body) => apiFetch('/payments', { method: 'POST', body: JSON.stringify(body) }),

  getFeeStructures: () => apiFetch('/fee-structures'),
  upsertFeeStructure: (body) => apiFetch('/fee-structures', { method: 'POST', body: JSON.stringify(body) }),

  getTerms: () => apiFetch('/terms'),
  getActiveTerm: () => apiFetch('/terms/active'),
  createTerm: (body) => apiFetch('/terms', { method: 'POST', body: JSON.stringify(body) }),
  activateTerm: (id) => apiFetch(`/terms/${id}/activate`, { method: 'PATCH' }),

  getDashboard: () => apiFetch('/dashboard'),

  sendReminders: (studentIds) => apiFetch('/reminders', { method: 'POST', body: JSON.stringify({ studentIds }) }),
  sendSingleReminder: (id) => apiFetch(`/reminders/student/${id}`, { method: 'POST' }),
  getReminderLogs: () => apiFetch('/reminders'),
};

/* ===== HELPERS ===== */

function fmt(n) {
  return '₦ ' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function avatarColor(name) {
  let hash = 0;
  for (let c of (name || '?')) hash = c.charCodeAt(0) + (hash << 5) - hash;
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

function statusBadge(status) {
  const map = {
    FULLY_PAID: ['badge-green', 'Fully Paid'],
    PARTIAL: ['badge-orange', 'Partial'],
    UNPAID: ['badge-red', 'Unpaid'],
  };
  const [cls, label] = map[status] || ['badge-gray', status || 'Unknown'];
  return `<span class="badge ${cls}">${label}</span>`;
}

function statusDot(status) {
  const dotMap = { FULLY_PAID: 'dot-green', PARTIAL: 'dot-orange', UNPAID: 'dot-red' };
  const dot = dotMap[status] || 'dot-gray';
  return `<span class="status-cell"><span class="status-dot ${dot}"></span>${statusBadge(status)}</span>`;
}

function showLoading(tbodyId, cols) {
  const el = document.getElementById(tbodyId);
  if (el) el.innerHTML = `<tr><td colspan="${cols}" style="text-align:center;padding:32px;color:var(--text-muted)">⏳ Loading...</td></tr>`;
}

/* ===== NAVIGATION ===== */

const pageTitles = {
  dashboard: 'Dashboard', students: 'Students', payments: 'Payment Tracking',
  terms: 'Terms & Charges', reminders: 'WhatsApp Reminders'
};

function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const target = document.getElementById('page-' + page);
  if (target) target.classList.add('active');
  const navItem = document.querySelector(`[data-page="${page}"]`);
  if (navItem) navItem.classList.add('active');
  document.getElementById('page-title').textContent = pageTitles[page] || page;
  if (window.innerWidth < 900) document.getElementById('sidebar').classList.remove('open');
  const loaders = { dashboard: loadDashboard, students: loadStudents, payments: loadPayments, terms: loadFeeStructures, reminders: loadReminders };
  if (loaders[page]) loaders[page]();
}

/* ===== DASHBOARD ===== */

async function loadDashboard() {
  try {
    const data = await api.getDashboard();
    var amount = data.totalExpectedRevenue;
    document.getElementById('stat-students').textContent = data.totalStudents;
    document.getElementById('stat-collected').textContent = fmt(data.totalCollected);
    document.getElementById('stat-outstanding').textContent = fmt(data.totalOutstanding);
    document.getElementById('stat-revenue').textContent = fmt(data.totalExpectedRevenue);
    document.getElementById('stat-paid').textContent = data.collectionRatePercent + '%';

    // Class progress bars
    const list = document.querySelector('.progress-list');
    if (list && data.classCollectionRates) {
      list.innerHTML = Object.entries(data.classCollectionRates).map(([cls, rate]) => {
        const colors = ['var(--green)', 'var(--blue)', 'var(--purple)', 'var(--orange)', 'var(--blue)', 'var(--green)'];
        const color = colors[Object.keys(data.classCollectionRates).indexOf(cls) % colors.length];
        return `<div class="progress-item">
          <div class="progress-meta"><span>${cls}</span><span>${rate}%</span></div>
          <div class="progress-bar"><div class="progress-fill" style="width:${rate}%;background:${color}"></div></div>
        </div>`;
      }).join('');
    }

    renderRecentPayments(data.recentPayments || []);
  } catch (e) { /* error shown by apiFetch */ }
}

function renderRecentPayments(list) {
  const tbody = document.getElementById('recent-payments-body');
  if (!tbody) return;
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px;">No payments yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(p => `<tr>
    <td><div class="student-cell">
      <div class="student-avatar" style="background:${avatarColor(p.studentName)}">${(p.studentName || '?').charAt(0)}</div>
      <div><div class="student-name">${p.studentName}</div><div class="student-id">${p.studentCode}</div></div>
    </div></td>
    <td>${p.className}</td>
    <td class="green-text">${fmt(p.amount)}</td>
    <td>${p.paymentDate}</td>
    <td>${statusDot(p.paymentStatus)}</td>
  </tr>`).join('');
}

/* ===== STUDENTS ===== */

let studentsRaw = [];

async function loadStudents() {
  showLoading('students-body', 9);
  try {
    studentsRaw = await api.getStudents();
    students = studentsRaw;
    renderStudents();
    populateStudentSelect();
  } catch (e) { }
}

function renderStudents(filter = '', classFilter = '', statusFilter = '') {
  const tbody = document.getElementById('students-body');
  let filtered = studentsRaw.filter(s => {
    const matchText = !filter || s.fullName.toLowerCase().includes(filter.toLowerCase()) || s.studentCode.includes(filter);
    const matchClass = !classFilter || s.className === classFilter;
    const matchStatus = !statusFilter || mapStatus(s.paymentStatus) === statusFilter;
    return matchText && matchClass && matchStatus;
  });

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:32px;">No students found.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(s => `<tr>
    <td><span class="student-id">${s.studentCode}</span></td>
    <td><div class="student-cell">
      <div class="student-avatar" style="background:${avatarColor(s.fullName)}">${s.fullName.charAt(0)}</div>
      <div><div class="student-name">${s.fullName}</div><div class="student-id">${s.parentName || ''}</div></div>
    </div></td>
    <td>${s.className}</td>
    <td> ${s.parentPhone}</td>
    <td>${fmt(s.termFee)}</td>
    <td class="green-text">${fmt(s.totalPaid)}</td>
    <td class="${(s.balance || 0) <= 0 ? 'green-text' : 'red-text'}">${fmt(Math.max(s.balance || 0, 0))}</td>
    <td>${statusDot(s.paymentStatus)}</td>
    <td><div class="actions-cell">
      <button class="btn btn-icon" title="View" onclick="openStudentDetails(${s.id})">🔍</button>
      <button class="btn btn-icon" title="WhatsApp" onclick="sendWhatsAppReminder(${s.id})">📲</button>
      <button class="btn btn-icon" title="Record Payment" onclick="openRecordPaymentFor(${s.id})">💳</button>
    </div></td>
  </tr>`).join('');
}

function mapStatus(s) {
  return s === 'FULLY_PAID' ? 'Fully Paid' : s === 'PARTIAL' ? 'Partial' : 'Unpaid';
}

/* ===== PAYMENTS ===== */

async function loadPayments(filter = '') {
  showLoading('payments-body', 9);
  try {
    payments = await api.getPayments();
    renderPayments(filter);
    updatePaymentStats();
  } catch (e) { }
}

function renderPayments(filter = '') {
  const tbody = document.getElementById('payments-body');
  const filtered = payments.filter(p =>
    !filter || p.studentName.toLowerCase().includes(filter.toLowerCase()) || p.refNumber.includes(filter));

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:32px;">No payments found.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(p => `<tr>
    <td><span class="badge badge-gray">${p.refNumber}</span></td>
    <td><div class="student-cell">
      <div class="student-avatar" style="background:${avatarColor(p.studentName)}">${(p.studentName || '?').charAt(0)}</div>
      <div class="student-name">${p.studentName}</div>
    </div></td>
    <td>${p.className}</td>
    <td class="green-text">${fmt(p.amount)}</td>
    <td>${fmt(p.termFee)}</td>
    <td class="${(p.balanceAfter || 0) <= 0 ? 'green-text' : 'red-text'}">${fmt(Math.max(p.balanceAfter || 0, 0))}</td>
    <td>${p.paymentDate}</td>
    <td><span class="badge badge-gray">${(p.method || '').replace('_', ' ')}</span></td>
    <td>${statusDot(p.paymentStatus)}</td>
  </tr>`).join('');
}

function updatePaymentStats() {
  document.getElementById('pay-total-tx').textContent = payments.length;
  const total = payments.reduce((a, p) => a + (p.amount || 0), 0);
  document.getElementById('pay-total-collected').textContent = fmt(total);
  const week = payments.filter(p => {
    const d = new Date(p.paymentDate);
    return (Date.now() - d.getTime()) < 7 * 86400000;
  }).reduce((a, p) => a + (p.amount || 0), 0);
  document.getElementById('pay-week').textContent = fmt(week);
  const outstanding = payments[0] ? (payments[0].termFee || 0) - (payments[0].totalPaid || 0) : 0;
  // Use last known balance from students
  const totalOut = studentsRaw.reduce((a, s) => a + Math.max(s.balance || 0, 0), 0);
  document.getElementById('pay-pending').textContent = fmt(totalOut);
}

/* ===== FEE STRUCTURES ===== */

let activeTerm = null; // ✅ global active term

async function loadFeeStructures() {
  try {
    feeStructure = await api.getFeeStructures();
    renderFeeStructure();
    const terms = await api.getTerms();
    activeTerm = terms.find(t => t.active) || null; // ✅ store globally
    if (activeTerm) {
      document.querySelector('.term-badge').textContent =
        `${activeTerm.termDisplayName} · ${activeTerm.academicSession}`;
    }
  } catch (e) { }
}

function renderFeeStructure() {
  const tbody = document.getElementById('fee-body');
  if (!feeStructure.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px;">No fee structures. Click + Add to create one.</td></tr>`;
    return;
  }
  tbody.innerHTML = feeStructure.map(f => `<tr>
    <td>${f.className}</td>
    <td>${fmt(f.termFee)}</td>
    <td>${fmt(f.otherCharges)}</td>
    <td><strong>${fmt(f.total)}</strong></td>
    <td><button class="btn btn-icon" onclick="editFee('${f.className}',${f.termFee},${f.otherCharges})">✏️</button></td>
  </tr>`).join('');
}

/* ===== REMINDERS ===== */

async function loadReminders() {
  try {
    // Students with outstanding balance
    if (!studentsRaw.length) studentsRaw = await api.getStudents();
    renderReminderTable();
    // Reminder logs
    const logs = await api.getReminderLogs();
    renderReminderLogs(logs);
  } catch (e) { }
}

function renderReminderTable() {
  const tbody = document.getElementById('reminders-body');
  const unpaid = studentsRaw.filter(s => (s.balance || 0) > 0);
  if (!unpaid.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:32px;">🎉 All students have fully paid!</td></tr>`;
    return;
  }
  tbody.innerHTML = unpaid.map(s => `<tr>
    <td><input type="checkbox" class="reminder-check" data-id="${s.id}"/></td>
    <td><div class="student-cell">
      <div class="student-avatar" style="background:${avatarColor(s.fullName)}">${s.fullName.charAt(0)}</div>
      <div class="student-name">${s.fullName}</div>
    </div></td>
    <td>${s.className}</td>
    <td> ${s.parentPhone}</td>
    <td class="red-text">${fmt(s.balance)}</td>
    <td><button class="btn btn-sm btn-whatsapp" onclick="sendWhatsAppReminder(${s.id})">📲 Send</button></td>
  </tr>`).join('');
}

function renderReminderLogs(logs) {
  const container = document.getElementById('reminder-log');
  if (!logs.length) return;
  // Prepend new API logs before static demo ones
  const newItems = logs.slice(0, 5).map(log => {
    const d = new Date(log.sentAt);
    const timeStr = d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    return `<div class="log-item">
      <span class="log-icon">📲</span>
      <div class="log-info">
        <strong>Reminder sent to ${log.studentName}</strong>
        <span>${timeStr}</span>
      </div>
      <span class="badge badge-green">Delivered</span>
    </div>`;
  }).join('');
  container.innerHTML = newItems + container.innerHTML;
}

/* ===== WHATSAPP REMINDER ===== */

async function sendWhatsAppReminder(studentId) {
  try {
    const result = await api.sendSingleReminder(studentId);
    // Open the wa.me URL from the backend response
    if (result.whatsappUrl) window.open(result.whatsappUrl, '_blank');
    showToast(`📲 WhatsApp reminder sent to ${result.studentName}`);
    if (document.getElementById('page-reminders').classList.contains('active')) loadReminders();
  } catch (e) { }
}

/* ===== STUDENT DETAILS MODAL ===== */

let currentStudentId = null;

async function openStudentDetails(studentId) {
  currentStudentId = studentId;
  openModal('student-details-modal');
  try {
    const [student, payHistory] = await Promise.all([
      api.getStudent(studentId),
      api.getPaymentsByStudent(studentId)
    ]);

    document.getElementById('sd-avatar').textContent = student.fullName.charAt(0);
    document.getElementById('sd-avatar').style.background = `linear-gradient(135deg, ${avatarColor(student.fullName)}, #8b5cf6)`;
    document.getElementById('sd-name').textContent = student.fullName;
    document.getElementById('sd-class-id').textContent = `${student.className} · ${student.studentCode}`;
    document.getElementById('sd-parent').textContent = student.parentName || '—';
    document.getElementById('sd-phone').textContent = student.parentPhone;
    document.getElementById('sd-date').textContent = student.createdAt ? new Date(student.createdAt).toLocaleDateString() : '—';
    document.getElementById('sd-fee').textContent = fmt(student.termFee);
    document.getElementById('bd-fee').textContent = fmt(student.termFee);
    document.getElementById('bd-paid').textContent = fmt(student.totalPaid);
    document.getElementById('bd-balance').textContent = fmt(Math.max(student.balance || 0, 0));

    const histBody = document.getElementById('sd-payment-history');
    if (!payHistory.length) {
      histBody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);">No payments recorded.</td></tr>`;
    } else {
      histBody.innerHTML = payHistory.map(p => `<tr>
        <td>${p.paymentDate}</td>
        <td class="green-text">${fmt(p.amount)}</td>
        <td>${(p.method || '').replace('_', ' ')}</td>
        <td><span class="badge badge-gray">${p.refNumber}</span></td>
      </tr>`).join('');
    }
  } catch (e) { }
}

/* ===== RECORD PAYMENT MODAL ===== */

function populateStudentSelect() {
  const sel = document.getElementById('p-student');
  sel.innerHTML = '<option value="">-- Select Student --</option>';
  studentsRaw.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `${s.fullName} (${s.className})`;
    sel.appendChild(opt);
  });
}

async function openRecordPaymentFor(studentId) {
  if (!studentsRaw.length) studentsRaw = await api.getStudents().catch(() => []);
  populateStudentSelect();
  document.getElementById('p-student').value = studentId;
  document.getElementById('p-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('p-amount').value = '';
  document.getElementById('p-new-balance').value = '';
  await onStudentSelectForPayment();
  openModal('record-payment-modal');
  closeModal('student-details-modal');
}

async function onStudentSelectForPayment() {
  const studentId = document.getElementById('p-student').value;
  if (!studentId) {
    document.getElementById('ps-fee').textContent = '₦ --';
    document.getElementById('ps-paid').textContent = '₦ --';
    document.getElementById('ps-balance').textContent = '₦ --';
    document.getElementById('p-new-balance').value = '';
    return;
  }
  try {
    const balance = await api.getBalance(studentId);
    document.getElementById('ps-fee').textContent = fmt(balance.termFee);
    document.getElementById('ps-paid').textContent = fmt(balance.totalPaid);
    document.getElementById('ps-balance').textContent = fmt(Math.max(balance.balance, 0));
    document.getElementById('p-student')._balance = balance;
    computeNewBalance();
  } catch (e) { }
}

function computeNewBalance() {
  const amount = parseFloat(document.getElementById('p-amount').value) || 0;
  const balObj = document.getElementById('p-student')._balance;
  if (!balObj) return;
  const newBal = balObj.balance - amount;
  document.getElementById('p-new-balance').value = newBal <= 0 ? '₦ 0 (Fully Paid 🎉)' : fmt(Math.round(newBal));
}

async function savePayment() {
  const studentId = document.getElementById('p-student').value;
  const amount = parseFloat(document.getElementById('p-amount').value);
  const method = document.getElementById('p-method').value;
  const date = document.getElementById('p-date').value;

  if (!studentId) { showToast('⚠️ Please select a student', 'error'); return; }
  if (!amount || amount <= 0) { showToast('⚠️ Enter a valid amount', 'error'); return; }
  if (!date) { showToast('⚠️ Please enter a date', 'error'); return; }

  try {
    const result = await api.recordPayment({
      studentId: Number(studentId),
      amount,
      paymentDate: date,
      method: method.replace(' ', '_').toUpperCase()
    });
    closeModal('record-payment-modal');
    showToast(`✅ Payment of ${fmt(amount)} recorded!`);
    // Refresh data
    studentsRaw = await api.getStudents().catch(() => studentsRaw);
    renderStudents();
    loadPayments();
    if (document.getElementById('page-dashboard').classList.contains('active')) loadDashboard();
  } catch (e) { }
}

/* ===== SAVE STUDENT ===== */

async function saveStudent() {
  const firstName = document.getElementById('s-firstname').value.trim();
  const lastName = document.getElementById('s-lastname').value.trim();
  const className = document.getElementById('s-class').value;
  const parentPhone = document.getElementById('s-phone').value.trim();
  const parentName = document.getElementById('s-parent').value.trim();

  if (!firstName || !lastName) { showToast('⚠️ Enter full name', 'error'); return; }
  if (!parentPhone) { showToast('⚠️ Enter parent phone', 'error'); return; }

  try {
    await api.createStudent({ firstName, lastName, className, parentName, parentPhone });
    closeModal('add-student-modal');
    showToast(`✅ Student "${firstName} ${lastName}" added`);
    ['s-firstname', 's-lastname', 's-phone', 's-parent'].forEach(id => document.getElementById(id).value = '');
    loadStudents();
    loadDashboard();
  } catch (e) { }
}

/* ===== SAVE FEE STRUCTURE ===== */

async function saveFee() {
  const className = document.getElementById('f-class').value;
  const termFee = parseFloat(document.getElementById('f-fee').value) || 0;
  const otherCharges = parseFloat(document.getElementById('f-other').value) || 0;
  try {
    await api.upsertFeeStructure({ className, termFee, otherCharges });
    closeModal('add-fee-modal');
    showToast(`✅ Fee for ${className} updated`);
    loadFeeStructures();
  } catch (e) { }
}

function editFee(cls, fee, other) {
  document.getElementById('f-class').value = cls;
  document.getElementById('f-fee').value = fee;
  document.getElementById('f-other').value = other;
  openModal('add-fee-modal');
}

/* ===== SEND BULK REMINDERS ===== */

async function sendBulkReminders() {
  const selected = [...document.querySelectorAll('.reminder-check:checked')];
  if (!selected.length) { showToast('⚠️ No students selected', 'error'); return; }
  const ids = selected.map(cb => Number(cb.dataset.id));
  try {
    const results = await api.sendReminders(ids);
    results.forEach(r => { if (r.whatsappUrl) window.open(r.whatsappUrl, '_blank'); });
    showToast(`📲 Reminders sent to ${results.length} parent(s)`);
    addReminderLogLocal(results.length);
  } catch (e) { }
}

function addReminderLogLocal(count) {
  const log = document.getElementById('reminder-log');
  const now = new Date();
  const timeStr = now.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const item = document.createElement('div');
  item.className = 'log-item';
  item.innerHTML = `
    <span class="log-icon">📲</span>
    <div class="log-info"><strong>Reminder sent to ${count} parent${count > 1 ? 's' : ''}</strong><span>${timeStr}</span></div>
    <span class="badge badge-green">Delivered</span>`;
  log.prepend(item);
}

/* ===== MODAL CONTROL ===== */

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

/* ===== TOAST ===== */

let toastTimer;
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.borderLeftColor = type === 'error' ? 'var(--red)' : 'var(--green)';
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

/* ===== AUTH FUNCTIONS ===== */

function showLoginScreen() {
  document.getElementById('login-overlay').style.display = 'flex';
}

function hideLoginScreen() {
  document.getElementById('login-overlay').style.display = 'none';
}

async function handleLogin(e) {
  e && e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  try {
    const res = await fetch(BASE_URL + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Login failed');
    Auth.setSession(json.data);
    hideLoginScreen();
    applySchoolBranding();
    loadDashboard();
    showToast('✅ Welcome back, ' + json.data.adminEmail + '!');
  } catch (err) {
    errEl.textContent = err.message;
  }
}

async function handleRegister(e) {
  e && e.preventDefault();
  const errEl = document.getElementById('reg-error');
  errEl.textContent = '';
  const body = {
    schoolName: document.getElementById('reg-school').value.trim(),
    schoolAddress: document.getElementById('reg-address').value.trim(),
    schoolEmail: document.getElementById('reg-school-email').value.trim(),
    adminEmail: document.getElementById('reg-email').value.trim(),
    adminPassword: document.getElementById('reg-password').value,
  };
  if (!body.schoolName || !body.adminEmail || !body.adminPassword) {
    errEl.textContent = 'Please fill in all required fields.';
    return;
  }
  try {
    const res = await fetch(BASE_URL + '/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Registration failed');
    Auth.setSession(json.data);
    hideLoginScreen();
    applySchoolBranding();
    loadDashboard();
    showToast('🎉 School registered! Welcome, ' + body.schoolName + '!');
  } catch (err) {
    errEl.textContent = err.message;
  }
}

function handleLogout() {
  Auth.clearSession();
  showLoginScreen();
  showToast('👋 Logged out successfully');
}

function applySchoolBranding() {
  const name = Auth.getSchoolName();
  const el = document.getElementById('school-display-name');
  if (el) el.textContent = name;
}

function switchAuthTab(tab) {
  document.getElementById('login-form').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('register-form').style.display = tab === 'register' ? 'block' : 'none';
  document.getElementById('tab-login').classList.toggle('tab-active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('tab-active', tab === 'register');
}

/* ===== EVENT LISTENERS ===== */

document.addEventListener('DOMContentLoaded', () => {
  // Gate: if no token show login screen
  if (!Auth.isLoggedIn()) {
    showLoginScreen();
  } else {
    applySchoolBranding();
    loadDashboard();
  }

  // Auth form events
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('register-form').addEventListener('submit', handleRegister);
  document.getElementById('tab-login').addEventListener('click', () => switchAuthTab('login'));
  document.getElementById('tab-register').addEventListener('click', () => switchAuthTab('register'));
  document.getElementById('logout-btn') && document.getElementById('logout-btn').addEventListener('click', handleLogout);

  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => { e.preventDefault(); navigateTo(item.dataset.page); });
  });
  document.querySelectorAll('[data-page="payments"]').forEach(btn => {
    btn.addEventListener('click', () => navigateTo('payments'));
  });

  // Hamburger
  const sidebar = document.getElementById('sidebar');
  document.getElementById('hamburger').addEventListener('click', () => {
    sidebar.classList.toggle('open');
    sidebar.classList.toggle('collapsed');
  });

  // Student search & filters
  document.getElementById('student-search').addEventListener('input', e => {
    renderStudents(e.target.value, document.getElementById('class-filter').value, document.getElementById('status-filter').value);
  });
  document.getElementById('class-filter').addEventListener('change', e => {
    renderStudents(document.getElementById('student-search').value, e.target.value, document.getElementById('status-filter').value);
  });
  document.getElementById('status-filter').addEventListener('change', e => {
    renderStudents(document.getElementById('student-search').value, document.getElementById('class-filter').value, e.target.value);
  });

  // Payment search
  document.getElementById('payment-search').addEventListener('input', e => renderPayments(e.target.value));

  // Add student
  document.getElementById('add-student-btn').addEventListener('click', () => openModal('add-student-modal'));
  document.getElementById('save-student-btn').addEventListener('click', saveStudent);

  // Record payment
  document.getElementById('record-payment-btn').addEventListener('click', async () => {
    if (!studentsRaw.length) studentsRaw = await api.getStudents().catch(() => []);
    populateStudentSelect();
    document.getElementById('p-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('p-amount').value = '';
    document.getElementById('p-new-balance').value = '';
    document.getElementById('p-student').value = '';
    document.getElementById('ps-fee').textContent = '₦ --';
    document.getElementById('ps-paid').textContent = '₦ --';
    document.getElementById('ps-balance').textContent = '₦ --';
    openModal('record-payment-modal');
  });
  document.getElementById('save-payment-btn').addEventListener('click', savePayment);

  // Fee
  document.getElementById('add-fee-btn').addEventListener('click', () => {
    document.getElementById('f-fee').value = '';
    document.getElementById('f-other').value = '';
    openModal('add-fee-modal');
  });
  document.getElementById('save-fee-btn').addEventListener('click', saveFee);
  document.getElementById('edit-term-btn').addEventListener('click', openEditTerm);
  document.getElementById('save-term-btn').addEventListener('click', saveTerm);

  /* ===== EDIT TERM ===== */

  /* ===== EDIT TERM ===== */

  const termEnumMap = {
    'Term 1': 'TERM_1', 'Term 2': 'TERM_2', 'Term 3': 'TERM_3',
    'TERM_1': 'TERM_1', 'TERM_2': 'TERM_2', 'TERM_3': 'TERM_3',
  };

  function openEditTerm() {
    if (activeTerm) {
      const termVal = termEnumMap[activeTerm.termDisplayName]
        || termEnumMap[activeTerm.termName]
        || 'TERM_1';
      document.getElementById('t-name').value = termVal;
      document.getElementById('t-session').value = activeTerm.academicSession || '';
      document.getElementById('t-start').value = activeTerm.startDate || '';
      document.getElementById('t-end').value = activeTerm.endDate || '';
    }
    openModal('edit-term-modal');
  }

  async function saveTerm() {
    const termName = document.getElementById('t-name').value;       // "TERM_1" etc.
    const academicSession = document.getElementById('t-session').value.trim();
    const startDate = document.getElementById('t-start').value;
    const endDate = document.getElementById('t-end').value;

    if (!academicSession || !startDate || !endDate) {
      showToast('⚠️ Please fill in all fields', 'error');
      return;
    }

    try {
      // Step 1: create the term — backend returns the new term with its id
      const newTerm = await api.createTerm({ termName, academicSession, startDate, endDate });

      // Step 2: immediately activate it using the returned id ✅
      await api.activateTerm(newTerm.id);

      closeModal('edit-term-modal');
      showToast('✅ Term created and activated!');
      loadFeeStructures(); // refresh the page
    } catch (e) { }
  }
  // Student details modal actions
  document.getElementById('sd-whatsapp-btn').addEventListener('click', () => {
    if (currentStudentId) sendWhatsAppReminder(currentStudentId);
  });
  document.getElementById('sd-record-btn').addEventListener('click', () => {
    if (currentStudentId) openRecordPaymentFor(currentStudentId);
  });

  // Select all reminders
  document.getElementById('select-all-btn').addEventListener('click', () => {
    document.querySelectorAll('.reminder-check').forEach(cb => cb.checked = true);
  });
  document.getElementById('check-all').addEventListener('change', e => {
    document.querySelectorAll('.reminder-check').forEach(cb => cb.checked = e.target.checked);
  });
  document.getElementById('send-selected-btn').addEventListener('click', sendBulkReminders);

  // Close modals
  document.querySelectorAll('.modal-close, [data-modal]').forEach(btn => {
    if (btn.dataset.modal) btn.addEventListener('click', () => closeModal(btn.dataset.modal));
  });
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(overlay.id); });
  });

  // Student select in payment modal
  document.getElementById('p-student').addEventListener('change', onStudentSelectForPayment);
  document.getElementById('p-amount').addEventListener('input', computeNewBalance);
  // Edit Term
  document.getElementById('edit-term-btn').addEventListener('click', openEditTerm);
  document.getElementById('save-term-btn').addEventListener('click', saveTerm);
  // Resize
  window.addEventListener('resize', () => {
    if (window.innerWidth >= 900) sidebar.classList.remove('open', 'collapsed');
  });
});
