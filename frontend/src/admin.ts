/**
 * Admin User Management Controller
 * รองรับทั้งคอมพิวเตอร์ (ตาราง) และมือถือ (การ์ด)
 * ทำงานร่วมกับ worker/src/routes/admin.ts
 */
import { callGas } from './api';

export interface AdminUser {
  username: string;
  name: string;
  role: string;
  email: string;
  last_login_at: string | null;
  created_at: string;
}

let usersList: AdminUser[] = [];
let currentFilter: 'all' | 'user' | 'admin' = 'all';
let currentSearch = '';
let pendingDeleteUser: string | null = null;

function getToken(): string | null {
  try {
    return localStorage.getItem('_lp_token');
  } catch {
    return null;
  }
}

function getStoredUser(): { username?: string; role?: string } | null {
  try {
    const raw = localStorage.getItem('_lp_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function isCurrentUserAdmin(): boolean {
  const user = getStoredUser();
  return String(user?.role || '').trim().toLowerCase() === 'admin';
}

function formatDateThai(dateStr: string | null | undefined): string {
  if (!dateStr || dateStr === '—') return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    const months = [
      'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
      'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
    ];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
  } catch {
    return String(dateStr);
  }
}

function showAdminToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
  const toast = document.getElementById('admin-toast');
  if (!toast) return;
  toast.textContent = (type === 'success' ? '✓ ' : type === 'error' ? '⚠️ ' : 'ℹ️ ') + message;
  toast.className = `fixed bottom-6 right-6 z-[100] px-4 py-2.5 rounded-full text-xs font-semibold shadow-lg transition-all duration-300 pointer-events-auto flex items-center gap-2 ${
    type === 'success'
      ? 'bg-emerald-600 text-white'
      : type === 'error'
      ? 'bg-rose-600 text-white'
      : 'bg-slate-800 text-white'
  }`;
  toast.classList.remove('opacity-0', 'translate-y-4', 'pointer-events-none');
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-4', 'pointer-events-none');
  }, 3500);
}

export async function openAdminUsersModal() {
  if (!isCurrentUserAdmin()) {
    alert('คุณไม่มีสิทธิ์เข้าถึงส่วนนี้ (เฉพาะผู้ดูแลระบบ)');
    return;
  }
  const modal = document.getElementById('modal-admin-users');
  if (!modal) return;

  modal.classList.remove('opacity-0', 'pointer-events-none');
  modal.classList.add('opacity-100', 'pointer-events-auto');
  const content = document.getElementById('modal-admin-users-content');
  if (content) {
    content.classList.remove('scale-95', 'translate-y-4');
    content.classList.add('scale-100', 'translate-y-0');
  }

  // รีเซ็ตสถานะฟอร์ม
  toggleAddUserForm(false);
  pendingDeleteUser = null;
  await fetchAdminUsers();
}

export function closeAdminUsersModal() {
  const modal = document.getElementById('modal-admin-users');
  if (!modal) return;

  const content = document.getElementById('modal-admin-users-content');
  if (content) {
    content.classList.add('scale-95', 'translate-y-4');
    content.classList.remove('scale-100', 'translate-y-0');
  }
  modal.classList.add('opacity-0', 'pointer-events-none');
  modal.classList.remove('opacity-100', 'pointer-events-auto');
}

export async function fetchAdminUsers() {
  const token = getToken();
  if (!token) return;

  renderLoadingState();

  try {
    const res = (await callGas('adminListUsers', [{ token }])) as {
      success?: boolean;
      users?: AdminUser[];
      message?: string;
    };

    if (res && res.success && Array.isArray(res.users)) {
      usersList = res.users;
      renderAdminUsers();
    } else {
      showAdminToast(res?.message || 'โหลดข้อมูลผู้ใช้ไม่สำเร็จ', 'error');
    }
  } catch (err) {
    showAdminToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการโหลดผู้ใช้', 'error');
  }
}

function renderLoadingState() {
  const tbody = document.getElementById('admin-table-body');
  const cardList = document.getElementById('admin-cards-list');
  const loadingHtml = `
    <div class="py-12 text-center text-slate-400">
      <div class="inline-block animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent mb-2"></div>
      <p class="text-xs">กำลังโหลดรายชื่อผู้ใช้...</p>
    </div>
  `;
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center">${loadingHtml}</td></tr>`;
  }
  if (cardList) {
    cardList.innerHTML = loadingHtml;
  }
}

export function renderAdminUsers() {
  const tbody = document.getElementById('admin-table-body');
  const cardList = document.getElementById('admin-cards-list');
  const searchInput = document.getElementById('admin-search-input') as HTMLInputElement | null;
  if (searchInput) currentSearch = searchInput.value.trim().toLowerCase();

  const filtered = usersList.filter((u) => {
    const matchFilter =
      currentFilter === 'all' ||
      (currentFilter === 'admin' && u.role === 'admin') ||
      (currentFilter === 'user' && u.role === 'user');

    const matchSearch =
      !currentSearch ||
      (u.name && u.name.toLowerCase().includes(currentSearch)) ||
      (u.username && u.username.toLowerCase().includes(currentSearch)) ||
      (u.email && u.email.toLowerCase().includes(currentSearch));

    return matchFilter && matchSearch;
  });

  // อัปเดต Stats
  const totalCount = usersList.length;
  const userCount = usersList.filter((u) => u.role === 'user').length;
  const adminCount = usersList.filter((u) => u.role === 'admin').length;

  const elTotal = document.getElementById('stat-total-users');
  const elUsers = document.getElementById('stat-regular-users');
  const elAdmins = document.getElementById('stat-admin-users');
  if (elTotal) elTotal.textContent = String(totalCount);
  if (elUsers) elUsers.textContent = String(userCount);
  if (elAdmins) elAdmins.textContent = String(adminCount);

  // Desktop Table
  if (tbody) {
    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="py-12 text-center text-slate-400">
            <span class="text-2xl block mb-1">🔍</span>
            <p class="text-sm">ไม่พบผู้ใช้ที่ตรงกับเงื่อนไข</p>
          </td>
        </tr>
      `;
    } else {
      tbody.innerHTML = filtered
        .map((u) => {
          const isMe =
            getStoredUser()?.username?.toLowerCase() === u.username.toLowerCase();
          const isPendingDel = pendingDeleteUser === u.username;
          return `
            <tr class="border-b border-slate-100 hover:bg-slate-50/70 transition-colors">
              <td class="py-3.5 px-4">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 rounded-full bg-blue-50 text-blue-600 font-bold flex items-center justify-center text-xs shrink-0">
                    ${(u.name || u.username || '?').charAt(0).toUpperCase()}
                  </div>
                  <div class="min-w-0">
                    <div class="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
                      <span class="truncate">${escapeHtml(u.name)}</span>
                      ${isMe ? '<span class="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">คุณ</span>' : ''}
                    </div>
                    <div class="text-xs text-slate-400">@${escapeHtml(u.username)}</div>
                  </div>
                </div>
              </td>
              <td class="py-3.5 px-4 text-xs text-slate-600">
                ${escapeHtml(u.email || '—')}
              </td>
              <td class="py-3.5 px-4">
                <select onchange="window.adminChangeRole('${escapeHtml(u.username)}', this.value)"
                        class="text-xs font-medium rounded-lg border border-slate-200 px-2.5 py-1 bg-white text-slate-700 shadow-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer ${
                          u.role === 'admin' ? 'bg-purple-50 text-purple-700 border-purple-200 font-semibold' : ''
                        }"
                        ${isMe ? 'title="ไม่สามารถเปลี่ยนสิทธิ์ของตนเองได้"' : ''}>
                  <option value="user" ${u.role === 'user' ? 'selected' : ''}>👤 สมาชิก (User)</option>
                  <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>⭐ ผู้ดูแลระบบ (Admin)</option>
                </select>
              </td>
              <td class="py-3.5 px-4 text-xs text-slate-500 whitespace-nowrap">
                <div>${formatDateThai(u.created_at)}</div>
                <div class="text-[11px] text-slate-400">เข้าสู่ระบบ: ${formatDateThai(u.last_login_at)}</div>
              </td>
              <td class="py-3.5 px-4 text-right">
                ${
                  isMe
                    ? '<span class="text-xs text-slate-300 italic">บัญชีปัจจุบัน</span>'
                    : isPendingDel
                    ? `
                      <div class="inline-flex items-center gap-1.5 p-1.5 bg-rose-50 rounded-lg border border-rose-200 animate-fadeIn">
                        <span class="text-xs text-rose-700 font-medium">ยืนยันลบ?</span>
                        <button onclick="window.adminExecuteDelete('${escapeHtml(u.username)}')" class="px-2 py-0.5 bg-rose-600 hover:bg-rose-700 text-white text-xs rounded font-medium transition-colors">ลบ</button>
                        <button onclick="window.adminCancelDelete()" class="px-2 py-0.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs rounded font-medium transition-colors">ยกเลิก</button>
                      </div>
                    `
                    : `
                      <button onclick="window.adminConfirmDelete('${escapeHtml(u.username)}')"
                              class="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors inline-flex items-center justify-center"
                              title="ลบบัญชีผู้ใช้">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                      </button>
                    `
                }
              </td>
            </tr>
          `;
        })
        .join('');
    }
  }

  // Mobile Cards List
  if (cardList) {
    if (filtered.length === 0) {
      cardList.innerHTML = `
        <div class="py-12 text-center text-slate-400">
          <span class="text-2xl block mb-1">🔍</span>
          <p class="text-sm">ไม่พบผู้ใช้ที่ตรงกับเงื่อนไข</p>
        </div>
      `;
    } else {
      cardList.innerHTML = filtered
        .map((u) => {
          const isMe =
            getStoredUser()?.username?.toLowerCase() === u.username.toLowerCase();
          const isPendingDel = pendingDeleteUser === u.username;
          return `
            <div class="p-4 bg-white rounded-xl border border-slate-100 shadow-sm space-y-3">
              <div class="flex items-start justify-between gap-2">
                <div class="flex items-center gap-2.5 min-w-0">
                  <div class="w-9 h-9 rounded-full bg-blue-50 text-blue-600 font-bold flex items-center justify-center text-xs shrink-0">
                    ${(u.name || u.username || '?').charAt(0).toUpperCase()}
                  </div>
                  <div class="min-w-0">
                    <div class="font-semibold text-slate-800 text-sm flex items-center gap-1">
                      <span class="truncate">${escapeHtml(u.name)}</span>
                      ${isMe ? '<span class="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium shrink-0">คุณ</span>' : ''}
                    </div>
                    <div class="text-xs text-slate-400">@${escapeHtml(u.username)}</div>
                  </div>
                </div>
                <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                  u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-50 text-blue-700'
                }">
                  ${u.role === 'admin' ? '⭐ ผู้ดูแลระบบ' : '👤 สมาชิก'}
                </span>
              </div>

              <div class="text-xs text-slate-500 space-y-1 bg-slate-50/70 p-2.5 rounded-lg border border-slate-100/80">
                <div class="flex justify-between">
                  <span class="text-slate-400">อีเมล:</span>
                  <span class="font-medium text-slate-700 truncate max-w-[200px]">${escapeHtml(u.email || '—')}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-slate-400">สมัครเมื่อ:</span>
                  <span>${formatDateThai(u.created_at)}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-slate-400">เข้าสู่ระบบล่าสุด:</span>
                  <span>${formatDateThai(u.last_login_at)}</span>
                </div>
              </div>

              <div class="pt-1 flex items-center justify-between gap-2">
                <select onchange="window.adminChangeRole('${escapeHtml(u.username)}', this.value)"
                        class="flex-1 text-xs rounded-lg border border-slate-200 px-2.5 py-2 bg-white text-slate-700 shadow-sm focus:outline-none focus:border-blue-500 min-h-[44px]">
                  <option value="user" ${u.role === 'user' ? 'selected' : ''}>👤 สิทธิ์: สมาชิก</option>
                  <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>⭐ สิทธิ์: ผู้ดูแลระบบ</option>
                </select>

                ${
                  isMe
                    ? '<span class="text-xs text-slate-300 italic px-2">คุณ</span>'
                    : isPendingDel
                    ? `
                      <div class="flex items-center gap-1.5 p-1 bg-rose-50 rounded-lg border border-rose-200">
                        <button onclick="window.adminExecuteDelete('${escapeHtml(u.username)}')" class="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs rounded-md font-medium min-h-[44px]">ยืนยันลบ</button>
                        <button onclick="window.adminCancelDelete()" class="px-2 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs rounded-md font-medium min-h-[44px]">ยกเลิก</button>
                      </div>
                    `
                    : `
                      <button onclick="window.adminConfirmDelete('${escapeHtml(u.username)}')"
                              class="px-3 py-2 text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg text-xs font-semibold flex items-center gap-1.5 min-h-[44px] transition-colors">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        ลบ
                      </button>
                    `
                }
              </div>
            </div>
          `;
        })
        .join('');
    }
  }
}

export function setAdminFilter(role: 'all' | 'user' | 'admin') {
  currentFilter = role;
  const chips = document.querySelectorAll('.admin-filter-chip');
  chips.forEach((c) => {
    const chipRole = c.getAttribute('data-filter');
    if (chipRole === role) {
      c.className =
        'admin-filter-chip px-3 py-1.5 rounded-full text-xs font-semibold transition-all bg-blue-600 text-white shadow-sm';
    } else {
      c.className =
        'admin-filter-chip px-3 py-1.5 rounded-full text-xs font-semibold transition-all bg-slate-100 hover:bg-slate-200 text-slate-600';
    }
  });
  renderAdminUsers();
}

export async function adminChangeRole(username: string, newRole: string) {
  const token = getToken();
  if (!token) return;

  try {
    const res = (await callGas('adminUpdateUserRole', [{ token, username, role: newRole }])) as {
      success?: boolean;
      message?: string;
    };

    if (res && res.success) {
      showAdminToast(`เปลี่ยนสิทธิ์ @${username} เป็น ${newRole === 'admin' ? 'ผู้ดูแลระบบ' : 'สมาชิก'} แล้ว`, 'success');
      const u = usersList.find((x) => x.username.toLowerCase() === username.toLowerCase());
      if (u) u.role = newRole;
      renderAdminUsers();
    } else {
      showAdminToast(res?.message || 'เปลี่ยนสิทธิ์ไม่สำเร็จ', 'error');
      renderAdminUsers();
    }
  } catch (err) {
    showAdminToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการเปลี่ยนสิทธิ์', 'error');
    renderAdminUsers();
  }
}

export function adminConfirmDelete(username: string) {
  pendingDeleteUser = username;
  renderAdminUsers();
}

export function adminCancelDelete() {
  pendingDeleteUser = null;
  renderAdminUsers();
}

export async function adminExecuteDelete(username: string) {
  const token = getToken();
  if (!token) return;

  try {
    const res = (await callGas('adminDeleteUser', [{ token, username }])) as {
      success?: boolean;
      message?: string;
    };

    if (res && res.success) {
      showAdminToast(`ลบบัญชี @${username} สำเร็จ`, 'success');
      usersList = usersList.filter((x) => x.username.toLowerCase() !== username.toLowerCase());
      pendingDeleteUser = null;
      renderAdminUsers();
    } else {
      showAdminToast(res?.message || 'ลบบัญชีไม่สำเร็จ', 'error');
    }
  } catch (err) {
    showAdminToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการลบบัญชี', 'error');
  }
}

export function toggleAddUserForm(show?: boolean) {
  const formEl = document.getElementById('admin-add-user-form');
  const btnToggle = document.getElementById('btn-toggle-add-user');
  if (!formEl) return;

  const willShow = typeof show === 'boolean' ? show : formEl.classList.contains('hidden');
  if (willShow) {
    formEl.classList.remove('hidden');
    if (btnToggle) btnToggle.textContent = '✕ ปิดแบบฟอร์ม';
    const firstInput = document.getElementById('add-user-name');
    if (firstInput) firstInput.focus();
  } else {
    formEl.classList.add('hidden');
    if (btnToggle) btnToggle.textContent = '➕ เพิ่มผู้ใช้ใหม่';
    // รีเซ็ตค่าในฟอร์ม
    const form = formEl.querySelector('form');
    if (form) form.reset();
  }
}

export async function submitAddUser(e: Event) {
  e.preventDefault();
  const token = getToken();
  if (!token) return;

  const nameInput = document.getElementById('add-user-name') as HTMLInputElement | null;
  const usernameInput = document.getElementById('add-user-username') as HTMLInputElement | null;
  const emailInput = document.getElementById('add-user-email') as HTMLInputElement | null;
  const passwordInput = document.getElementById('add-user-password') as HTMLInputElement | null;
  const roleSelect = document.getElementById('add-user-role') as HTMLSelectElement | null;
  const submitBtn = document.getElementById('btn-submit-add-user') as HTMLButtonElement | null;

  const name = nameInput?.value.trim() || '';
  const username = usernameInput?.value.trim().toLowerCase() || '';
  const email = emailInput?.value.trim() || '';
  const password = passwordInput?.value.trim() || '';
  const role = roleSelect?.value || 'user';

  if (!name || !username || !password) {
    showAdminToast('กรุณากรอกชื่อผู้ใช้, ชื่อ-นามสกุล และรหัสผ่าน', 'error');
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'กำลังบันทึก...';
  }

  try {
    const res = (await callGas('adminCreateUser', [
      { token, name, username, email, password, role },
    ])) as {
      success?: boolean;
      message?: string;
    };

    if (res && res.success) {
      showAdminToast(`เพิ่มผู้ใช้ @${username} สำเร็จ`, 'success');
      toggleAddUserForm(false);
      await fetchAdminUsers();
    } else {
      showAdminToast(res?.message || 'ไม่สามารถเพิ่มผู้ใช้ได้', 'error');
    }
  } catch (err) {
    showAdminToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการเพิ่มผู้ใช้', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'บันทึกผู้ใช้';
    }
  }
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** ติดตั้ง Global Handlers สำหรับ inline onclick / onchange */
export function installAdminGlobals() {
  const w = window as unknown as Record<string, unknown>;
  w.openAdminUsersModal = openAdminUsersModal;
  w.closeAdminUsersModal = closeAdminUsersModal;
  w.setAdminFilter = setAdminFilter;
  w.adminChangeRole = adminChangeRole;
  w.adminConfirmDelete = adminConfirmDelete;
  w.adminCancelDelete = adminCancelDelete;
  w.adminExecuteDelete = adminExecuteDelete;
  w.toggleAddUserForm = toggleAddUserForm;
  w.submitAddUser = submitAddUser;
  w.renderAdminUsers = renderAdminUsers;

  // ตรวจสอบสถานะ admin เมื่อโหลดเพื่อแสดง/ซ่อนปุ่ม header
  syncAdminButtonVisibility();

  // ดักฟังสภาพการเปลี่ยนแปลงของ localStorage เผื่อ login/logout เกิดขึ้น
  window.addEventListener('storage', syncAdminButtonVisibility);
}

export function syncAdminButtonVisibility() {
  const btnAdmin = document.getElementById('header-btn-admin');
  if (!btnAdmin) return;
  if (isCurrentUserAdmin()) {
    btnAdmin.classList.remove('hidden');
    btnAdmin.classList.add('inline-flex');
  } else {
    btnAdmin.classList.add('hidden');
    btnAdmin.classList.remove('inline-flex');
  }
}
