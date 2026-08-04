import {
  completeMultipartUpload,
  createMultipartUpload,
  uploadPart,
} from '@vercel/blob/client';

/**
 * Uploading a large file from a phone, in parts we control.
 *
 * `upload({ multipart: true })` does this too, but with fixed internals that
 * a phone loses to. It reads the file into memory ahead of the network —
 * up to 96MB of buffered chunks (six concurrent parts, eight megabytes
 * each, double-buffered) — while the connection has only managed to send a
 * fraction of that. On a desktop that's headroom. On a phone holding a
 * 334MB recording it is memory pressure, and Safari's answer to memory
 * pressure is to stop the tab doing work. Nothing raises an error: the
 * progress bar stops at whatever had been sent, which reads as "it stalled
 * around 5%".
 *
 * The parts here are `File.slice()` — a view onto the file still on disk,
 * not a copy in memory — so what's resident is one part per worker rather
 * than the whole read-ahead buffer. Fewer of them go at once for the same
 * reason.
 *
 * The other half is that a part which stops moving is retried. The library
 * sets no timeout on a part's request, so a connection that goes away
 * mid-part leaves a request that never resolves and never fails, which is
 * the state a progress bar frozen at 5% is actually in. Here a part with no
 * progress for STALL_TIMEOUT_MS is abandoned and re-sent from the start —
 * of that part, not of the upload.
 */

/** Blob requires 5MB minimum per part except the last. */
const PART_SIZE = 8 * 1024 * 1024;

/** Deliberately below the library's six: each one costs resident memory. */
const CONCURRENCY = 3;

/** A part that has sent nothing for this long is not coming back. */
const STALL_TIMEOUT_MS = 30_000;

const PART_ATTEMPTS = 4;

interface UploadedPart {
  etag: string;
  partNumber: number;
}

export interface ChunkedUploadOptions {
  file: File;
  /** Worked out by checkUpload — never left for Blob to infer. */
  contentType: string;
  /** The route that mints a client token, same one `upload()` would call. */
  handleUploadUrl: string;
  abortSignal?: AbortSignal;
  /** Total bytes confirmed sent so far. */
  onProgress: (loaded: number) => void;
}

class UploadStalledError extends Error {
  constructor(partNumber: number) {
    super(`Part ${partNumber} stopped sending`);
    this.name = 'UploadStalledError';
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true }
    );
  });
}

/**
 * The same handshake `upload()` performs: our route runs its auth check and
 * returns a token carrying the content-type and size policy.
 */
async function retrieveClientToken(
  handleUploadUrl: string,
  pathname: string,
  abortSignal?: AbortSignal
): Promise<string> {
  const res = await fetch(handleUploadUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'blob.generate-client-token',
      payload: { pathname, callbackUrl: handleUploadUrl, clientPayload: null, multipart: true },
    }),
    signal: abortSignal,
  });
  const data = (await res.json().catch(() => null)) as { clientToken?: string; error?: string } | null;
  if (!res.ok || !data?.clientToken) {
    throw new Error(data?.error || "Couldn't start the upload — try again.");
  }
  return data.clientToken;
}

export async function uploadFileInParts({
  file,
  contentType,
  handleUploadUrl,
  abortSignal,
  onProgress,
}: ChunkedUploadOptions): Promise<{ url: string }> {
  const token = await retrieveClientToken(handleUploadUrl, file.name, abortSignal);
  const common = { access: 'public' as const, token, contentType };

  const { key, uploadId } = await createMultipartUpload(file.name, common);
  const partOptions = { ...common, key, uploadId };

  const partCount = Math.max(1, Math.ceil(file.size / PART_SIZE));
  const loaded = new Array<number>(partCount).fill(0);
  const parts = new Array<UploadedPart>(partCount);

  const report = () => onProgress(loaded.reduce((sum, n) => sum + n, 0));

  const sendPart = async (index: number): Promise<UploadedPart> => {
    const start = index * PART_SIZE;
    const slice = file.slice(start, Math.min(start + PART_SIZE, file.size));

    for (let attempt = 1; ; attempt++) {
      // Its own controller so a stalled part can be dropped without taking
      // the other parts in flight down with it.
      const partController = new AbortController();
      const forwardAbort = () => partController.abort();
      abortSignal?.addEventListener('abort', forwardAbort, { once: true });

      let watchdog: ReturnType<typeof setTimeout> | undefined;
      let stalled = false;
      const resetWatchdog = () => {
        clearTimeout(watchdog);
        watchdog = setTimeout(() => {
          stalled = true;
          partController.abort();
        }, STALL_TIMEOUT_MS);
      };

      try {
        resetWatchdog();
        const part = await uploadPart(file.name, slice, {
          ...partOptions,
          partNumber: index + 1,
          abortSignal: partController.signal,
          onUploadProgress: ({ loaded: sent }) => {
            resetWatchdog();
            loaded[index] = sent;
            report();
          },
        });
        // The final progress event of a part is suppressed upstream, so the
        // last bytes of every part would otherwise never be counted.
        loaded[index] = slice.size;
        report();
        return part;
      } catch (err) {
        if (abortSignal?.aborted) throw err;
        if (attempt >= PART_ATTEMPTS) {
          throw stalled ? new UploadStalledError(index + 1) : err;
        }
        // Re-sent from the beginning of the part, so its bytes are no longer
        // sent — saying otherwise would leave the bar overstating progress.
        loaded[index] = 0;
        report();
        await delay(500 * 2 ** (attempt - 1), abortSignal);
      } finally {
        clearTimeout(watchdog);
        abortSignal?.removeEventListener('abort', forwardAbort);
      }
    }
  };

  let next = 0;
  const worker = async () => {
    for (let index = next++; index < partCount; index = next++) {
      parts[index] = await sendPart(index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, partCount) }, worker));

  const blob = await completeMultipartUpload(file.name, parts, partOptions);
  return { url: blob.url };
}
