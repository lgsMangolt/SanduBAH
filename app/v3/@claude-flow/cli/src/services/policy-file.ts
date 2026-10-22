import { closeSync, constants, fstatSync, lstatSync, openSync, type Stats } from 'node:fs';

function rejectArchive(): never {
  throw Object.assign(new Error('policy-ledger-archive-not-regular'), { code: 'ELOOP' });
}

export function openRegularLedgerFile(file: string, flags: number, mode?: number): number {
  let existing: Stats | undefined;
  try { existing = lstatSync(file); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (existing && (!existing.isFile() || existing.isSymbolicLink())) rejectArchive();
  const creationFlags = existing ? flags & ~constants.O_CREAT : flags & constants.O_CREAT ? flags | constants.O_EXCL : flags;
  const descriptor = openSync(file, creationFlags | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0), mode);
  try {
    const opened = fstatSync(descriptor);
    const current = lstatSync(file);
    if (!opened.isFile() || !current.isFile() || current.isSymbolicLink()
      || opened.dev !== current.dev || opened.ino !== current.ino
      || (existing && (existing.dev !== opened.dev || existing.ino !== opened.ino))) rejectArchive();
    return descriptor;
  } catch (error) {
    closeSync(descriptor);
    throw error;
  }
}
