// SPDX-License-Identifier: AGPL-3.0-only
import type { ResourceDto } from '@orkstage/contracts';

const DAY_MS = 86_400_000;

/**
 * Databases with no backup from the last day, counted as the API's production destroy guard
 * counts them (`BACKUP_NOT_RECENT`): active PostgreSQL resources whose backups are on and whose last
 * backup is missing or older than a day.
 */
export function staleDatabases(resources: readonly ResourceDto[], now = Date.now()): string[] {
  return resources
    .filter((r) => r.type === 'database.postgresql' && r.status === 'ACTIVE')
    .filter((r) => {
      const b = r.backup;
      if (b && !b.enabled) return false;
      return !b?.lastBackupAt || Date.parse(b.lastBackupAt) < now - DAY_MS;
    })
    .map((r) => r.resourceId);
}
