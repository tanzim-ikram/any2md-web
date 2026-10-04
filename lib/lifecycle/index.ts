/**
 * File lifecycle tracking (plan section 7):
 *
 *   UPLOADED -> VALIDATING -> PROCESSING -> COMPLETED -> AVAILABLE
 *      \-> REJECTED            \-> FAILED/TIMEOUT/CANCELLED -> DELETED
 *   AVAILABLE -> EXPIRED -> DELETED
 *
 * The record's TTL in the KV store *is* the retention policy, not a cron
 * job that might not run: a record (and, on explicit delete, its backing
 * file) simply stops existing when its time is up. Deletion additionally
 * fires immediately on failure/cancel/timeout and on successful download,
 * so the TTL is a backstop, not the only path -- see deleteFile().
 *
 * No document content, extracted text, or Markdown is ever stored here --
 * only metadata (format pair, size, status, timestamps). This is what the
 * plan means by "don't log document contents."
 */
import { getKvStore } from "../kv";
import { getFileStorage } from "../storage";

export type FileStatus =
  | "uploaded"
  | "validating"
  | "processing"
  | "completed"
  | "available"
  | "rejected"
  | "failed"
  | "timeout"
  | "cancelled"
  | "expired";

export interface FileRecord {
  fileId: string;
  status: FileStatus;
  originalFilename: string; // sanitized for display only -- never used as a path
  sizeBytes: number;
  sourceFormat?: string;
  targetFormat?: string;
  createdAt: number;
  error?: string;
}

/** How long an AVAILABLE file (and its KV record) survives before the TTL
 * itself deletes the record. The backing bytes are swept by the daily
 * cleanup cron if delete-on-download didn't already remove them (plan
 * section 7: "the server must enforce cleanup"). */
const RETENTION_SECONDS = 60 * 60; // 1 hour

function recordKey(fileId: string): string {
  return `file:${fileId}`;
}

export async function createFileRecord(
  fileId: string,
  originalFilename: string,
  sizeBytes: number,
): Promise<FileRecord> {
  const record: FileRecord = {
    fileId,
    status: "uploaded",
    originalFilename,
    sizeBytes,
    createdAt: Date.now(),
  };
  const kv = await getKvStore();
  await kv.set(recordKey(fileId), JSON.stringify(record), RETENTION_SECONDS);
  return record;
}

export async function getFileRecord(fileId: string): Promise<FileRecord | null> {
  const kv = await getKvStore();
  const raw = await kv.get(recordKey(fileId));
  return raw ? (JSON.parse(raw) as FileRecord) : null;
}

export async function updateFileRecord(fileId: string, patch: Partial<FileRecord>): Promise<FileRecord | null> {
  const existing = await getFileRecord(fileId);
  if (!existing) return null;
  const updated: FileRecord = { ...existing, ...patch };
  const kv = await getKvStore();
  await kv.set(recordKey(fileId), JSON.stringify(updated), RETENTION_SECONDS);
  return updated;
}

/** Immediate deletion path: used on failure, timeout, cancellation, and
 * successful download. Removes both the KV record and the backing bytes,
 * rather than waiting for the record's TTL or the daily cron sweep. */
export async function deleteFile(fileId: string): Promise<void> {
  const kv = await getKvStore();
  const storage = getFileStorage();
  await Promise.all([kv.del(recordKey(fileId)), storage.delete(fileId)]);
}

export async function markFailed(fileId: string, status: "failed" | "timeout" | "cancelled" | "rejected", error: string): Promise<void> {
  await updateFileRecord(fileId, { status, error });
  await deleteFile(fileId); // failed/cancelled files are deleted immediately, not left to expire
}
