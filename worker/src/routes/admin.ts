import type { Env } from '../env';
import { jsonResponse, readBody, str, gasError } from '../lib/http';
import { getActiveSessionResult, type Session } from '../lib/auth';
import { hashPassword } from '../lib/crypto';

// ponytail: minimal admin check helper, reused across all 4 admin RPCs
async function requireAdmin(
  request: Request,
  env: Env
): Promise<
  | { ok: true; session: Session; payload: Record<string, unknown> }
  | { ok: false; response: Response }
> {
  const payload = (await readBody(request)) as Record<string, unknown>;
  const token = payload.token ? str(payload.token) : null;
  const authResult = await getActiveSessionResult(env, token);
  if (authResult.error) {
    return { ok: false, response: jsonResponse(authResult.error, 200, env) };
  }
  const session = authResult.session;
  if (!session || String(session.role || '').trim().toLowerCase() !== 'admin') {
    return {
      ok: false,
      response: jsonResponse(
        { success: false, message: 'คุณไม่มีสิทธิ์เข้าถึงส่วนนี้ (เฉพาะผู้ดูแลระบบ)' },
        200,
        env
      ),
    };
  }
  return { ok: true, session, payload };
}

export interface UserRow {
  username: string;
  name: string;
  role: string;
  email: string;
  last_login_at: string | null;
  created_at: string;
}

/** adminListUsers — ดึงรายชื่อผู้ใช้ทั้งหมด เรียงจากล่าสุด */
export async function handleAdminListUsers(request: Request, env: Env): Promise<Response> {
  try {
    const auth = await requireAdmin(request, env);
    if (!auth.ok) return auth.response;

    const rows = await env.DB.prepare(
      `SELECT username, name, role, email, last_login_at, created_at
       FROM users
       ORDER BY created_at DESC`
    ).all<UserRow>();

    return jsonResponse({ success: true, users: rows.results || [] }, 200, env);
  } catch (err) {
    return gasError(err, env);
  }
}

/** adminUpdateUserRole — ปรับเปลี่ยน role (user <-> admin) */
export async function handleAdminUpdateUserRole(request: Request, env: Env): Promise<Response> {
  try {
    const auth = await requireAdmin(request, env);
    if (!auth.ok) return auth.response;

    const targetUsername = str(auth.payload.username).trim().toLowerCase();
    const newRole = str(auth.payload.role).trim().toLowerCase();

    if (!targetUsername || (newRole !== 'admin' && newRole !== 'user')) {
      return jsonResponse({ success: false, message: 'ข้อมูลไม่ถูกต้อง' }, 200, env);
    }

    // Safety: ไม่ให้ถอนสิทธิ์แอดมินของตัวเอง
    if (auth.session.username.toLowerCase() === targetUsername && newRole !== 'admin') {
      return jsonResponse(
        { success: false, message: 'ไม่สามารถยกเลิกสิทธิ์ผู้ดูแลระบบของตนเองได้' },
        200,
        env
      );
    }

    await env.DB.prepare(`UPDATE users SET role = ? WHERE username = ?`)
      .bind(newRole, targetUsername)
      .run();

    // อัปเดต role ใน sessions ที่ยัง active อยู่ด้วย
    await env.DB.prepare(`UPDATE sessions SET role = ? WHERE username = ?`)
      .bind(newRole, targetUsername)
      .run();

    return jsonResponse({ success: true, message: 'เปลี่ยนสิทธิ์สำเร็จ' }, 200, env);
  } catch (err) {
    return gasError(err, env);
  }
}

/** adminDeleteUser — ลบบัญชีผู้ใช้ + sessions ที่เกี่ยวข้อง */
export async function handleAdminDeleteUser(request: Request, env: Env): Promise<Response> {
  try {
    const auth = await requireAdmin(request, env);
    if (!auth.ok) return auth.response;

    const targetUsername = str(auth.payload.username).trim().toLowerCase();
    if (!targetUsername) {
      return jsonResponse({ success: false, message: 'กรุณาระบุชื่อผู้ใช้ที่ต้องการลบ' }, 200, env);
    }

    // Safety: ห้ามลบบัญชีตัวเอง
    if (auth.session.username.toLowerCase() === targetUsername) {
      return jsonResponse(
        { success: false, message: 'ไม่สามารถลบบัญชีของผู้ดูแลระบบที่กำลังใช้งานอยู่ได้' },
        200,
        env
      );
    }

    await env.DB.prepare(`DELETE FROM sessions WHERE username = ?`).bind(targetUsername).run();
    await env.DB.prepare(`DELETE FROM users WHERE username = ?`).bind(targetUsername).run();

    return jsonResponse({ success: true, message: 'ลบบัญชีผู้ใช้สำเร็จ' }, 200, env);
  } catch (err) {
    return gasError(err, env);
  }
}

/** adminCreateUser — แอดมินเพิ่มผู้ใช้ใหม่โดยตรง */
export async function handleAdminCreateUser(request: Request, env: Env): Promise<Response> {
  try {
    const auth = await requireAdmin(request, env);
    if (!auth.ok) return auth.response;

    const name = str(auth.payload.name).trim();
    const username = str(auth.payload.username).trim().toLowerCase();
    const email = str(auth.payload.email).trim();
    const password = str(auth.payload.password).trim();
    const role = str(auth.payload.role).trim().toLowerCase() === 'admin' ? 'admin' : 'user';

    if (!name || !username || !password) {
      return jsonResponse(
        { success: false, message: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน' },
        200,
        env
      );
    }

    // ตรวจสอบ username / email ซ้ำ
    const dup = await env.DB.prepare(
      `SELECT username, email FROM users WHERE username = ? OR (? != '' AND email != '' AND LOWER(email) = LOWER(?)) LIMIT 2`
    )
      .bind(username, email, email)
      .all<{ username: string; email: string }>();

    for (const row of dup.results) {
      if (String(row.username || '').trim().toLowerCase() === username) {
        return jsonResponse({ success: false, message: 'ชื่อผู้ใช้นี้มีในระบบแล้ว' }, 200, env);
      }
      if (email && String(row.email || '').trim().toLowerCase() === email.toLowerCase()) {
        return jsonResponse({ success: false, message: 'อีเมลนี้ถูกใช้งานแล้ว' }, 200, env);
      }
    }

    const passwordHash = await hashPassword(password);
    const res = await env.DB.prepare(
      `INSERT INTO users (username, password_hash, name, role, email) VALUES (?, ?, ?, ?, ?)`
    )
      .bind(username, passwordHash, name, role, email)
      .run();

    if (!res.success) throw new Error('insert user failed');

    return jsonResponse({ success: true, message: 'เพิ่มผู้ใช้สำเร็จ' }, 200, env);
  } catch (err) {
    return gasError(err, env);
  }
}

/** adminResetPassword — แอดมินตั้งรหัสผ่านใหม่ให้ผู้ใช้หรือแอดมินคนอื่น/ตัวเอง */
export async function handleAdminResetPassword(request: Request, env: Env): Promise<Response> {
  try {
    const auth = await requireAdmin(request, env);
    if (!auth.ok) return auth.response;

    const targetUsername = str(auth.payload.username).trim().toLowerCase();
    const newPassword = str(auth.payload.newPassword || auth.payload.password).trim();

    if (!targetUsername) {
      return jsonResponse({ success: false, message: 'กรุณาระบุชื่อผู้ใช้ที่ต้องการรีเซ็ตรหัสผ่าน' }, 200, env);
    }

    if (!newPassword || newPassword.length < 4) {
      return jsonResponse({ success: false, message: 'รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 4 ตัวอักษร' }, 200, env);
    }

    const existingUser = await env.DB.prepare(
      `SELECT username FROM users WHERE username = ?`
    ).bind(targetUsername).first<{ username: string }>();

    if (!existingUser) {
      return jsonResponse({ success: false, message: 'ไม่พบบัญชีผู้ใช้นี้ในระบบ' }, 200, env);
    }

    const passwordHash = await hashPassword(newPassword);
    await env.DB.prepare(
      `UPDATE users SET password_hash = ? WHERE username = ?`
    ).bind(passwordHash, targetUsername).run();

    // เพื่อความปลอดภัย: ถ้าไม่ใช่ตัวเอง ล้าง session ของผู้ใช้คนนั้นเพื่อให้ล็อกอินใหม่ด้วยรหัสใหม่
    if (auth.session.username.toLowerCase() !== targetUsername) {
      await env.DB.prepare(`DELETE FROM sessions WHERE username = ?`).bind(targetUsername).run();
    }

    return jsonResponse({ success: true, message: 'รีเซ็ตรหัสผ่านสำเร็จ' }, 200, env);
  } catch (err) {
    return gasError(err, env);
  }
}

