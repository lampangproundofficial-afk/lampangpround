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
let currentPage = 1;
const PAGE_SIZE = 10;

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

  // รีเซ็ตสถานะฟอร์มและการแบ่งหน้า
  toggleAddUserForm(false);
  pendingDeleteUser = null;
  currentPage = 1;
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
  const paginationEl = document.getElementById('admin-users-pagination');
  if (paginationEl) {
    paginationEl.classList.add('hidden');
    paginationEl.innerHTML = '';
  }
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
  const newSearch = searchInput ? searchInput.value.trim().toLowerCase() : '';
  if (newSearch !== currentSearch) {
    currentSearch = newSearch;
    currentPage = 1;
  }

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

  // คำนวณแบ่งหน้า (Pagination)
  const totalFiltered = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));
  if (currentPage > totalPages) {
    currentPage = totalPages;
  }
  if (currentPage < 1) {
    currentPage = 1;
  }

  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, totalFiltered);
  const pagedList = filtered.slice(startIndex, endIndex);

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
      tbody.innerHTML = pagedList
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
              <td class="py-3.5 px-4 text-right whitespace-nowrap">
                <div class="inline-flex items-center justify-end gap-1.5">
                  <button onclick="window.openResetPasswordModal('${escapeHtml(u.username)}', '${escapeHtml(u.name || u.username)}')"
                          class="inline-flex items-center justify-center w-8 h-8 text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors border border-amber-200/80 shadow-xs"
                          title="รีเซ็ตรหัสผ่าน"
                          aria-label="รีเซ็ตรหัสผ่าน ${escapeHtml(u.username)}">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path></svg>
                  </button>
                  ${
                    isMe
                      ? '<span class="text-xs text-slate-400 italic pl-1">(บัญชีคุณ)</span>'
                      : isPendingDel
                      ? `
                        <div class="inline-flex items-center justify-end gap-1.5 p-1 bg-rose-50 border border-rose-200 rounded-xl shadow-xs animate-fadeIn">
                          <span class="text-[11px] font-semibold text-rose-700 pl-2 pr-0.5 select-none">ยืนยันลบ?</span>
                          <button onclick="window.adminExecuteDelete('${escapeHtml(u.username)}')" 
                                  class="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center gap-1 active:scale-95"
                                  title="ยืนยันการลบบัญชี">
                            ลบ
                          </button>
                          <button onclick="window.adminCancelDelete()" 
                                  class="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-600 text-xs font-medium rounded-lg border border-slate-200 shadow-xs transition-colors active:scale-95"
                                  title="ยกเลิกการลบ">
                            ยกเลิก
                          </button>
                        </div>
                      `
                      : `
                        <button onclick="window.adminConfirmDelete('${escapeHtml(u.username)}')"
                                class="inline-flex items-center justify-center w-8 h-8 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-100"
                                title="ลบบัญชีผู้ใช้"
                                aria-label="ลบบัญชี ${escapeHtml(u.username)}">
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                      `
                  }
                </div>
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
      cardList.innerHTML = pagedList
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

              <div class="pt-1 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2">
                <select onchange="window.adminChangeRole('${escapeHtml(u.username)}', this.value)"
                        class="flex-1 min-w-[140px] text-xs rounded-xl border border-slate-200 px-3 py-2 bg-white text-slate-700 shadow-sm focus:outline-none focus:border-blue-500 min-h-[44px]"
                        ${isMe ? 'disabled' : ''}>
                  <option value="user" ${u.role === 'user' ? 'selected' : ''}>👤 สิทธิ์: สมาชิก</option>
                  <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>⭐ สิทธิ์: ผู้ดูแลระบบ</option>
                </select>

                <div class="flex items-center gap-1.5 shrink-0">
                  <button onclick="window.openResetPasswordModal('${escapeHtml(u.username)}', '${escapeHtml(u.name || u.username)}')"
                          class="px-3 py-2 text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200/80 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 min-h-[44px] transition-colors active:scale-95"
                          title="รีเซ็ตรหัสผ่าน">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path></svg>
                    <span>รีเซ็ตรหัส</span>
                  </button>

                  ${
                    isMe
                      ? '<span class="text-xs text-slate-400 italic px-1.5 self-center">(บัญชีคุณ)</span>'
                      : isPendingDel
                      ? ''
                      : `
                        <button onclick="window.adminConfirmDelete('${escapeHtml(u.username)}')"
                                class="px-3 py-2 text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-100 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 min-h-[44px] shrink-0 transition-colors active:scale-95"
                                title="ลบบัญชี">
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                          <span>ลบ</span>
                        </button>
                      `
                  }
                </div>
              </div>

              ${
                !isMe && isPendingDel
                  ? `
                    <div class="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-2 animate-fadeIn">
                      <div class="flex items-center gap-1.5 text-xs text-rose-700 font-semibold">
                        <svg class="w-4 h-4 text-rose-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                        <span>ยืนยันการลบบัญชี @${escapeHtml(u.username)}?</span>
                      </div>
                      <div class="grid grid-cols-2 gap-2 pt-0.5">
                        <button onclick="window.adminCancelDelete()" 
                                class="w-full py-2.5 px-3 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-xl border border-slate-200 shadow-xs flex items-center justify-center min-h-[44px] transition-colors active:scale-95">
                          ยกเลิก
                        </button>
                        <button onclick="window.adminExecuteDelete('${escapeHtml(u.username)}')" 
                                class="w-full py-2.5 px-3 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-xl shadow-xs flex items-center justify-center gap-1.5 min-h-[44px] transition-colors active:scale-95">
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                          ยืนยันลบ
                        </button>
                      </div>
                    </div>
                  `
                  : ''
              }
            </div>
          `;
        })
        .join('');
    }
  }

  // เรนเดอร์ตัวแบ่งหน้า (Pagination Controls)
  renderPaginationControls(totalFiltered, totalPages, startIndex, endIndex);
}

function renderPaginationControls(total: number, totalPages: number, start: number, end: number) {
  const paginationEl = document.getElementById('admin-users-pagination');
  if (!paginationEl) return;

  if (total <= PAGE_SIZE) {
    if (total === 0) {
      paginationEl.classList.add('hidden');
      paginationEl.innerHTML = '';
      return;
    }
    paginationEl.classList.remove('hidden');
    paginationEl.innerHTML = `
      <div class="text-xs text-slate-500 font-medium">
        แสดงทั้งหมด <span class="font-bold text-slate-700">${total}</span> คน
      </div>
      <div></div>
    `;
    return;
  }

  paginationEl.classList.remove('hidden');
  const isFirstPage = currentPage <= 1;
  const isLastPage = currentPage >= totalPages;

  paginationEl.innerHTML = `
    <div class="text-xs text-slate-500 font-medium text-center sm:text-left">
      แสดง <span class="font-bold text-slate-700">${start + 1}</span> - <span class="font-bold text-slate-700">${end}</span> จากทั้งหมด <span class="font-bold text-slate-700">${total}</span> คน
    </div>
    <div class="flex items-center justify-center gap-2">
      <button type="button"
              onclick="window.adminPrevPage()"
              ${isFirstPage ? 'disabled' : ''}
              class="px-3.5 py-2 text-xs font-semibold rounded-xl border transition-all flex items-center justify-center gap-1 min-h-[44px] min-w-[44px] ${
                isFirstPage
                  ? 'opacity-40 cursor-not-allowed bg-slate-100 text-slate-400 border-slate-200'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 shadow-xs active:scale-95 cursor-pointer'
              }"
              aria-label="หน้าก่อนหน้า">
        <span>‹ ก่อนหน้า</span>
      </button>

      <span class="px-3 py-2 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-100 rounded-xl select-none min-h-[44px] flex items-center justify-center">
        หน้า ${currentPage} / ${totalPages}
      </span>

      <button type="button"
              onclick="window.adminNextPage()"
              ${isLastPage ? 'disabled' : ''}
              class="px-3.5 py-2 text-xs font-semibold rounded-xl border transition-all flex items-center justify-center gap-1 min-h-[44px] min-w-[44px] ${
                isLastPage
                  ? 'opacity-40 cursor-not-allowed bg-slate-100 text-slate-400 border-slate-200'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 shadow-xs active:scale-95 cursor-pointer'
              }"
              aria-label="หน้าถัดไป">
        <span>ถัดไป ›</span>
      </button>
    </div>
  `;
}

export function adminPrevPage() {
  if (currentPage > 1) {
    currentPage--;
    renderAdminUsers();
    scrollAdminToTop();
  }
}

export function adminNextPage() {
  const filteredCount = usersList.filter((u) => {
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
  }).length;

  const totalPages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));
  if (currentPage < totalPages) {
    currentPage++;
    renderAdminUsers();
    scrollAdminToTop();
  }
}

function scrollAdminToTop() {
  const modalBody = document.querySelector('#modal-admin-users .overflow-y-auto');
  if (modalBody) {
    modalBody.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

export function setAdminFilter(role: 'all' | 'user' | 'admin') {
  currentFilter = role;
  currentPage = 1;
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

export function openResetPasswordModal(username: string, name?: string) {
  if (!isCurrentUserAdmin()) {
    alert('คุณไม่มีสิทธิ์เข้าถึงส่วนนี้ (เฉพาะผู้ดูแลระบบ)');
    return;
  }
  const modal = document.getElementById('modal-admin-reset-password');
  if (!modal) return;

  const targetUsernameEl = document.getElementById('reset-target-username');
  const targetNameEl = document.getElementById('reset-target-name');
  const targetAvatarEl = document.getElementById('reset-target-avatar');
  const usernameInput = document.getElementById('reset-username-input') as HTMLInputElement | null;
  const newPwdInput = document.getElementById('reset-new-password') as HTMLInputElement | null;
  const confirmPwdInput = document.getElementById('reset-confirm-password') as HTMLInputElement | null;

  if (targetUsernameEl) targetUsernameEl.textContent = `@${username}`;
  if (targetNameEl) targetNameEl.textContent = name || username;
  if (targetAvatarEl) targetAvatarEl.textContent = (name || username || '?').charAt(0).toUpperCase();
  if (usernameInput) usernameInput.value = username;
  if (newPwdInput) {
    newPwdInput.value = '';
    newPwdInput.type = 'password';
  }
  if (confirmPwdInput) {
    confirmPwdInput.value = '';
    confirmPwdInput.type = 'password';
  }

  const toggleIcon = document.getElementById('toggle-pwd-icon');
  if (toggleIcon) toggleIcon.textContent = '👁️';

  modal.classList.remove('opacity-0', 'pointer-events-none');
  modal.classList.add('opacity-100', 'pointer-events-auto');

  const content = document.getElementById('modal-admin-reset-password-content');
  if (content) {
    content.classList.remove('scale-95', 'translate-y-4');
    content.classList.add('scale-100', 'translate-y-0');
  }

  setTimeout(() => {
    if (newPwdInput) newPwdInput.focus();
  }, 100);
}

export function closeResetPasswordModal() {
  const modal = document.getElementById('modal-admin-reset-password');
  if (!modal) return;

  const content = document.getElementById('modal-admin-reset-password-content');
  if (content) {
    content.classList.add('scale-95', 'translate-y-4');
    content.classList.remove('scale-100', 'translate-y-0');
  }
  modal.classList.add('opacity-0', 'pointer-events-none');
  modal.classList.remove('opacity-100', 'pointer-events-auto');
}

export function toggleResetPasswordVisibility() {
  const newPwdInput = document.getElementById('reset-new-password') as HTMLInputElement | null;
  const confirmPwdInput = document.getElementById('reset-confirm-password') as HTMLInputElement | null;
  const toggleIcon = document.getElementById('toggle-pwd-icon');
  if (!newPwdInput) return;

  const isPassword = newPwdInput.type === 'password';
  newPwdInput.type = isPassword ? 'text' : 'password';
  if (confirmPwdInput) confirmPwdInput.type = isPassword ? 'text' : 'password';
  if (toggleIcon) toggleIcon.textContent = isPassword ? '🙈' : '👁️';
}

export function adminGenerateRandomPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$';
  let pwd = 'LP-';
  for (let i = 0; i < 6; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const newPwdInput = document.getElementById('reset-new-password') as HTMLInputElement | null;
  const confirmPwdInput = document.getElementById('reset-confirm-password') as HTMLInputElement | null;
  if (newPwdInput) {
    newPwdInput.value = pwd;
    newPwdInput.type = 'text';
  }
  if (confirmPwdInput) {
    confirmPwdInput.value = pwd;
    confirmPwdInput.type = 'text';
  }
  const toggleIcon = document.getElementById('toggle-pwd-icon');
  if (toggleIcon) toggleIcon.textContent = '🙈';

  showAdminToast('สุ่มรหัสผ่านใหม่เรียบร้อย (สามารถคัดลอกได้)', 'info');
}

export async function submitResetPassword(e: Event) {
  e.preventDefault();
  const token = getToken();
  if (!token) return;

  const usernameInput = document.getElementById('reset-username-input') as HTMLInputElement | null;
  const newPwdInput = document.getElementById('reset-new-password') as HTMLInputElement | null;
  const confirmPwdInput = document.getElementById('reset-confirm-password') as HTMLInputElement | null;
  const submitBtn = document.getElementById('btn-submit-reset-password') as HTMLButtonElement | null;

  const username = usernameInput?.value.trim().toLowerCase() || '';
  const newPassword = newPwdInput?.value.trim() || '';
  const confirmPassword = confirmPwdInput?.value.trim() || '';

  if (!username) {
    showAdminToast('ไม่พบข้อมูลชื่อผู้ใช้', 'error');
    return;
  }
  if (!newPassword || newPassword.length < 4) {
    showAdminToast('รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 4 ตัวอักษร', 'error');
    return;
  }
  if (newPassword !== confirmPassword) {
    showAdminToast('รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน', 'error');
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'กำลังบันทึก...';
  }

  try {
    const res = (await callGas('adminResetPassword', [
      { token, username, newPassword },
    ])) as {
      success?: boolean;
      message?: string;
    };

    if (res && res.success) {
      showAdminToast(`รีเซ็ตรหัสผ่านของ @${username} สำเร็จ`, 'success');
      closeResetPasswordModal();
    } else {
      showAdminToast(res?.message || 'รีเซ็ตรหัสผ่านไม่สำเร็จ', 'error');
    }
  } catch (err) {
    showAdminToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการรีเซ็ตรหัสผ่าน', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'บันทึกรหัสผ่าน';
    }
  }
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
  w.openResetPasswordModal = openResetPasswordModal;
  w.closeResetPasswordModal = closeResetPasswordModal;
  w.toggleResetPasswordVisibility = toggleResetPasswordVisibility;
  w.adminGenerateRandomPassword = adminGenerateRandomPassword;
  w.submitResetPassword = submitResetPassword;
  w.adminPrevPage = adminPrevPage;
  w.adminNextPage = adminNextPage;

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
