import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repository root (this file lives at packages/shared/{src,dist}/storage.*). */
export const REPO_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');

/**
 * Absolute local artifact directory. Relative STORAGE_LOCAL_DIR values are resolved
 * against the repository root so the API and worker always agree, whatever their cwd.
 */
export function resolveStorageDir(storageLocalDir: string): string {
  return isAbsolute(storageLocalDir) ? storageLocalDir : resolve(REPO_ROOT, storageLocalDir);
}

/**
 * Resolves a stored artifact path inside the storage root.
 * Returns undefined for anything that would escape it (path traversal).
 */
export function resolveInsideStorage(storageRoot: string, storagePath: string): string | undefined {
  const full = resolve(storageRoot, storagePath);
  const rel = relative(storageRoot, full);
  if (!rel || rel.startsWith('..') || isAbsolute(rel) || rel.split(sep).includes('..')) return undefined;
  return full;
}
