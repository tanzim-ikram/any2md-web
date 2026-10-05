/**
 * File-bytes storage, behind one interface with two backends:
 *
 *   - Vercel Blob in production. Pathnames are random (never derived from
 *     the user's filename -- see lib/security/validation.ts), so a file is
 *     only reachable by whoever holds the generated fileId.
 *   - The local filesystem (OS temp dir) for local dev, so the app runs
 *     without a Vercel Blob token. Never used in production.
 *
 * This is the storage half of the file lifecycle (plan section 7); the
 * status/expiry half lives in lib/lifecycle, keyed by the same fileId.
 */
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface StoredFile {
  fileId: string;
  size: number;
}

export interface FileStorage {
  put(buffer: Buffer): Promise<StoredFile>;
  get(fileId: string): Promise<Buffer | null>;
  delete(fileId: string): Promise<void>;
}

function generateFileId(): string {
  // 32 hex chars (128 bits) -- unguessable, matches the plan's "random
  // 32-char fileId" file-lifecycle key.
  return randomBytes(16).toString("hex");
}

class LocalFileStorage implements FileStorage {
  private dir = path.join(os.tmpdir(), "docsmith-dev-storage");

  private async ensureDir() {
    await fs.mkdir(this.dir, { recursive: true });
  }

  private filePath(fileId: string): string {
    // fileId is always our own generated hex string -- never user input --
    // so this can't be a path traversal vector, but validate anyway as
    // defense in depth (see lib/security's "no user string ever reaches a
    // path" rule).
    if (!/^[a-f0-9]{32}$/.test(fileId)) throw new Error("Invalid fileId");
    return path.join(this.dir, fileId);
  }

  async put(buffer: Buffer): Promise<StoredFile> {
    await this.ensureDir();
    const fileId = generateFileId();
    await fs.writeFile(this.filePath(fileId), buffer);
    return { fileId, size: buffer.length };
  }

  async get(fileId: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(this.filePath(fileId));
    } catch {
      return null;
    }
  }

  async delete(fileId: string): Promise<void> {
    await fs.rm(this.filePath(fileId), { force: true });
  }
}

class VercelBlobStorage implements FileStorage {
  async put(buffer: Buffer): Promise<StoredFile> {
    const { put } = await import("@vercel/blob");
    const fileId = generateFileId();
    // `addRandomSuffix: false` -- fileId is already random and unique; a
    // predictable pathname under that random id is fine and keeps
    // get()/delete() simple round-trips on the same key.
    await put(fileId, buffer, { access: "public", addRandomSuffix: false });
    return { fileId, size: buffer.length };
  }

  async get(fileId: string): Promise<Buffer | null> {
    const { head } = await import("@vercel/blob");
    try {
      const meta = await head(fileId);
      const res = await fetch(meta.url);
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch {
      return null;
    }
  }

  async delete(fileId: string): Promise<void> {
    const { del } = await import("@vercel/blob");
    await del(fileId).catch(() => void 0);
  }
}

let singleton: FileStorage | null = null;

export function getFileStorage(): FileStorage {
  if (singleton) return singleton;
  const hasBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
  singleton = hasBlob ? new VercelBlobStorage() : new LocalFileStorage();
  return singleton;
}
