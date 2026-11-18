import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { desc, eq } from 'drizzle-orm';
import { db } from './index.ts';
import { enrollments, profiles, roles } from './schema.ts';
import type { RoleName } from '../types/index.ts';

export interface ProfileAuthRow {
  id: string;
  uid: string | null;
  email: string;
  fullName: string;
  phone: string | null;
  role: RoleName;
  preferredLanguage: 'ar' | 'en';
  isActive: boolean;
  emailVerified: boolean;
  createdAt: string;
}

export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 12)}`;
}

function isConfiguredOwnerEmail(email: string, emailVerified: boolean): boolean {
  if (!emailVerified) return false;
  const raw = process.env.SUPER_ADMIN_EMAILS || 'sofianamr92@gmail.com';
  const allowed = raw
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.trim().toLowerCase());
}

export async function getUserById(id: string): Promise<ProfileAuthRow | null> {
  try {
    const rows = await db
      .select({
        id: profiles.id,
        uid: profiles.uid,
        email: profiles.email,
        fullName: profiles.fullName,
        phone: profiles.phone,
        role: roles.name,
        preferredLanguage: profiles.preferredLanguage,
        isActive: profiles.isActive,
        emailVerified: profiles.emailVerified,
        createdAt: profiles.createdAt,
      })
      .from(profiles)
      .innerJoin(roles, eq(profiles.roleId, roles.id))
      .where(eq(profiles.id, id))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return {
      ...row,
      role: row.role as RoleName,
      preferredLanguage: row.preferredLanguage === 'en' ? 'en' : 'ar',
    };
  } catch (error) {
    console.error('Database query failed in getUserById:', error);
    throw new Error('Failed to load user profile.', { cause: error });
  }
}

export async function getOrCreateFirebaseUser(params: {
  uid: string;
  email: string;
  fullName?: string | null;
  emailVerified?: boolean;
}): Promise<ProfileAuthRow> {
  const emailNorm = params.email.trim().toLowerCase();
  const displayName = (params.fullName && params.fullName.trim()) || emailNorm.split('@')[0] || 'Student';
  const now = new Date().toISOString();
  const verified = params.emailVerified ?? true;
  const shouldBeSuperAdmin = isConfiguredOwnerEmail(emailNorm, verified);

  try {
    const targetRoleName: RoleName = shouldBeSuperAdmin ? 'super_admin' : 'student';
    const targetRoles = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.name, targetRoleName))
      .limit(1);

    // 1. Check if UID already exists
    const byUid = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.uid, params.uid))
      .limit(1);

    if (byUid[0]) {
      await db
        .update(profiles)
        .set({
          email: emailNorm,
          emailVerified: verified,
          ...(shouldBeSuperAdmin && targetRoles[0] ? { roleId: targetRoles[0].id } : {}),
          updatedAt: now,
        })
        .where(eq(profiles.id, byUid[0].id));
      const loaded = await getUserById(byUid[0].id);
      if (loaded) return loaded;
    }

    // 2. Check if an account already exists for this email
    const byEmail = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.email, emailNorm))
      .limit(1);

    if (byEmail[0]) {
      await db
        .update(profiles)
        .set({
          uid: params.uid,
          emailVerified: verified,
          ...(shouldBeSuperAdmin && targetRoles[0] ? { roleId: targetRoles[0].id } : {}),
          updatedAt: now,
        })
        .where(eq(profiles.id, byEmail[0].id));
      const loaded = await getUserById(byEmail[0].id);
      if (loaded) return loaded;
    }

    // 3. Upsert new user safely under concurrent requests
    if (!targetRoles[0]) {
      throw new Error('Default role is not seeded in database.');
    }

    const randomSecretHash = bcrypt.hashSync(crypto.randomBytes(24).toString('hex'), 10);
    const inserted = await db
      .insert(profiles)
      .values({
        id: newId('usr'),
        uid: params.uid,
        email: emailNorm,
        passwordHash: randomSecretHash,
        fullName: displayName,
        phone: null,
        roleId: targetRoles[0].id,
        preferredLanguage: 'ar',
        isActive: true,
        emailVerified: verified,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: profiles.uid,
        set: {
          email: emailNorm,
          emailVerified: verified,
          updatedAt: now,
        },
      })
      .returning({ id: profiles.id });

    const created = await getUserById(inserted[0].id);
    if (!created) {
      throw new Error('Failed to load newly created user.');
    }
    return created;
  } catch (error) {
    console.error('Database query failed in getOrCreateFirebaseUser:', error);
    throw new Error('Failed to synchronize user account.', { cause: error });
  }
}

export async function listUsersWithEnrollmentCounts() {
  try {
    const [userRows, activeEnrs] = await Promise.all([
      db
        .select({
          id: profiles.id,
          email: profiles.email,
          fullName: profiles.fullName,
          phone: profiles.phone,
          role: roles.name,
          preferredLanguage: profiles.preferredLanguage,
          isActive: profiles.isActive,
          emailVerified: profiles.emailVerified,
          createdAt: profiles.createdAt,
        })
        .from(profiles)
        .innerJoin(roles, eq(roles.id, profiles.roleId))
        .orderBy(desc(profiles.createdAt)),
      db
        .select({ studentId: enrollments.studentId })
        .from(enrollments)
        .where(eq(enrollments.status, 'active')),
    ]);

    const enrCountByUser = new Map<string, number>();
    for (const e of activeEnrs) {
      enrCountByUser.set(e.studentId, (enrCountByUser.get(e.studentId) ?? 0) + 1);
    }

    return userRows.map((u) => ({
      ...u,
      activeEnrollmentsCount: enrCountByUser.get(u.id) ?? 0,
    }));
  } catch (error) {
    console.error('Database query failed in listUsersWithEnrollmentCounts:', error);
    throw new Error('Failed to fetch users.', { cause: error });
  }
}

export async function updateUserRole(targetUserId: string, roleName: RoleName): Promise<boolean> {
  try {
    const roleRows = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.name, roleName))
      .limit(1);

    if (!roleRows[0]) return false;

    const updated = await db
      .update(profiles)
      .set({ roleId: roleRows[0].id, updatedAt: new Date().toISOString() })
      .where(eq(profiles.id, targetUserId))
      .returning({ id: profiles.id });

    return Boolean(updated[0]);
  } catch (error) {
    console.error('Database query failed in updateUserRole:', error);
    throw new Error('Failed to update user role.', { cause: error });
  }
}

export async function updateUserStatus(targetUserId: string, isActive: boolean): Promise<boolean> {
  try {
    const updated = await db
      .update(profiles)
      .set({ isActive, updatedAt: new Date().toISOString() })
      .where(eq(profiles.id, targetUserId))
      .returning({ id: profiles.id });
    return Boolean(updated[0]);
  } catch (error) {
    console.error('Database query failed in updateUserStatus:', error);
    throw new Error('Failed to update user status.', { cause: error });
  }
}
