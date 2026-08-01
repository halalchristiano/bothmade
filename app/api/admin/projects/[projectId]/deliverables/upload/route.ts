import { NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { getCurrentSession } from '@/lib/auth';

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
        return {
          allowedContentTypes: undefined, // allow any file type
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
