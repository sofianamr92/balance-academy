import 'dotenv/config';
import { db, pool } from './index.ts';
import { platformSettings, roles } from './schema.ts';

/**
 * Idempotent baseline seed ensuring essential RBAC roles and default platform
 * settings exist in Cloud SQL PostgreSQL. Executed manually via `npm run db:seed`
 * (never called during server startup).
 */
export async function ensureBaseSeed() {
  const now = new Date().toISOString();

  await db
    .insert(roles)
    .values([
      {
        id: 'role-super-admin',
        name: 'super_admin',
        description: 'Full platform ownership, financial verification, users, security logs, and settings.',
        createdAt: now,
      },
      {
        id: 'role-content-manager',
        name: 'content_manager',
        description: 'Course catalog, categories, modules, lessons, and private video asset management.',
        createdAt: now,
      },
      {
        id: 'role-student',
        name: 'student',
        description: 'Registered learner with course browsing, purchases, and protected playback access.',
        createdAt: now,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(platformSettings)
    .values([
      { key: 'vodafone_cash_number', value: '0100 000 0000', updatedAt: now },
      { key: 'instapay_handle', value: 'balanceacademy@instapay', updatedAt: now },
      { key: 'bank_account_iban', value: 'EG000000000000000000000000000', updatedAt: now },
      { key: 'support_email', value: 'support@balance.academy', updatedAt: now },
      { key: 'max_concurrent_watch_sessions', value: '2', updatedAt: now },
    ])
    .onConflictDoNothing();
}

const isDirectExecution = process.argv[1]?.endsWith('seed.ts');
if (isDirectExecution) {
  ensureBaseSeed()
    .then(async () => {
      console.log('Cloud SQL baseline seed verified.');
      await pool.end();
    })
    .catch(async (err) => {
      console.error('Seed failed:', err);
      await pool.end();
      process.exit(1);
    });
}
