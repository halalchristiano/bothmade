import { NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { getCurrentSession } from '@/lib/auth';
import { requireRole, OPS } from '@/lib/authz';

/** 500 MB. Generous for a design hand-off or a build archive, and finite. */
const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

/**
 * Token endpoint for direct-to-Blob uploads from the admin deliverables UI.
 * The actual file bytes never pass through this serverless function — the
 * browser uploads straight to Blob storage using the short-lived token this
 * route hands out, which avoids the ~4.5MB request-body limit entirely.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        const session = await getCurrentSession();
        if (!session || session.type !== 'user') {
          throw new Error('Unauthorized');
        }
        // Deliverables are client project files, so this sits behind the same
        // ops boundary as the rest of projects/**. This callback has to throw
        // rather than return a response — handleUpload owns the response.
        if (requireRole(session, OPS)) {
          throw new Error('Forbidden');
        }
        return {
          // Deliverables are genuinely any type — a zip, a Sketch file, a
          // video cut. Restricting the list would break real hand-offs, so
          // the limit that matters here is size, not format.
          allowedContentTypes: undefined,
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => {
        // No-op: the client already receives the blob URL directly from
        // upload() and persists it via the existing deliverables POST route.
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 400 }
    );
  }
}
