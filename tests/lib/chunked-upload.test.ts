import { beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadFileInParts } from '@/lib/chunked-upload';

/**
 * The uploader a 334MB screen recording from a phone goes through.
 *
 * What matters is that the file is never held in memory — parts are slices
 * of the file still on disk — and that one part failing costs one part
 * rather than the whole upload. Both are the difference between a phone
 * finishing a large upload and a progress bar stopping at 5%.
 */

const createMultipartUploadMock = vi.fn(async (..._args: unknown[]) => ({ key: 'k', uploadId: 'u' }));
const completeMock = vi.fn(async (..._args: unknown[]) => ({ url: 'https://blob.test/walkthrough.mov' }));
const uploadPartMock = vi.fn(
  async (_pathname: string, _body: unknown, options: { partNumber: number }) => ({
    etag: `etag-${options.partNumber}`,
    partNumber: options.partNumber,
  })
);

vi.mock('@vercel/blob/client', () => ({
  createMultipartUpload: (...args: unknown[]) => createMultipartUploadMock(...args),
  uploadPart: (...args: unknown[]) =>
    uploadPartMock(args[0] as string, args[1], args[2] as { partNumber: number }),
  completeMultipartUpload: (...args: unknown[]) => completeMock(...args),
  upload: vi.fn(),
}));

const PART_SIZE = 8 * 1024 * 1024;

/**
 * A stand-in for a File that records what was sliced off it, so a test can
 * tell a slice from a copy without allocating hundreds of megabytes.
 */
function fakeFile(size: number) {
  const slices: { start: number; end: number }[] = [];
  const file = {
    name: 'walkthrough.mov',
    size,
    slice(start: number, end: number) {
      slices.push({ start, end });
      return { size: end - start } as Blob;
    },
  };
  return { file: file as unknown as File, slices };
}

function options(file: File, onProgress = vi.fn()) {
  return {
    file,
    contentType: 'video/quicktime',
    handleUploadUrl: '/api/admin/leads/lead_1/mockups/upload',
    onProgress,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ clientToken: 'vercel_blob_client_tok' }) }))
  );
});

describe('sending the file in parts', () => {
  it('asks our own route for the token, so the upload is still staff-only', async () => {
    const { file } = fakeFile(20 * 1024 * 1024);

    await uploadFileInParts(options(file));

    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe('/api/admin/leads/lead_1/mockups/upload');
    expect(JSON.parse((init as { body: string }).body)).toMatchObject({
      type: 'blob.generate-client-token',
      payload: { pathname: 'walkthrough.mov', multipart: true },
    });
  });

  it('slices the file rather than reading it into memory, covering every byte once', async () => {
    const size = 20 * 1024 * 1024;
    const { file, slices } = fakeFile(size);

    await uploadFileInParts(options(file));

    expect(slices).toEqual([
      { start: 0, end: PART_SIZE },
      { start: PART_SIZE, end: 2 * PART_SIZE },
      { start: 2 * PART_SIZE, end: size },
    ]);
  });

  it('completes with every part, in order', async () => {
    const { file } = fakeFile(20 * 1024 * 1024);

    const result = await uploadFileInParts(options(file));

    expect(completeMock.mock.calls[0]![1]).toEqual([
      { etag: 'etag-1', partNumber: 1 },
      { etag: 'etag-2', partNumber: 2 },
      { etag: 'etag-3', partNumber: 3 },
    ]);
    expect(result).toEqual({ url: 'https://blob.test/walkthrough.mov' });
  });

  it('sends the content type we worked out rather than leaving Blob to guess', async () => {
    const { file } = fakeFile(20 * 1024 * 1024);

    await uploadFileInParts(options(file));

    expect(createMultipartUploadMock.mock.calls[0]![1]).toMatchObject({
      contentType: 'video/quicktime',
    });
  });

  it('counts a part in full once it lands — the last bytes of each are otherwise never reported', async () => {
    const size = 20 * 1024 * 1024;
    const { file } = fakeFile(size);
    const onProgress = vi.fn();

    await uploadFileInParts(options(file, onProgress));

    const reported = onProgress.mock.calls.map(([loaded]) => loaded as number);
    expect(Math.max(...reported)).toBe(size);
    expect(reported.every((n) => n <= size)).toBe(true);
  });
});

describe('when a part does not make it', () => {
  it('re-sends that part instead of failing the whole upload', async () => {
    const { file } = fakeFile(20 * 1024 * 1024);
    uploadPartMock.mockRejectedValueOnce(new TypeError('Network request failed'));

    const result = await uploadFileInParts(options(file));

    // Three parts, one of them sent twice.
    expect(uploadPartMock).toHaveBeenCalledTimes(4);
    expect(result).toEqual({ url: 'https://blob.test/walkthrough.mov' });
  });

  it('takes the retried part back off the total, so the bar never overstates what was sent', async () => {
    const size = 20 * 1024 * 1024;
    const { file } = fakeFile(size);
    uploadPartMock.mockImplementationOnce(async (_p, _b, o) => {
      // Report most of the part as sent, then lose it.
      const opts = o as unknown as { onUploadProgress?: (e: { loaded: number }) => void };
      opts.onUploadProgress?.({ loaded: PART_SIZE });
      throw new TypeError('Network request failed');
    });
    const onProgress = vi.fn();

    await uploadFileInParts(options(file, onProgress));

    const reported = onProgress.mock.calls.map(([loaded]) => loaded as number);
    expect(reported.every((n) => n <= size)).toBe(true);
    expect(reported.at(-1)).toBe(size);
  });

  it('gives up on the upload if the token cannot be had at all', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, json: async () => ({ error: 'Unauthorized' }) }))
    );
    const { file } = fakeFile(20 * 1024 * 1024);

    await expect(uploadFileInParts(options(file))).rejects.toThrow('Unauthorized');
    expect(createMultipartUploadMock).not.toHaveBeenCalled();
  });
});
