import { NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { requireStaff } from '@/lib/middleware';
import { DELIVERABLE_CONTENT_TYPES, DELIVERABLE_MAX_BYTES } from '@/lib/uploads';

/**
 * Token endpoint for direct-to-Blob mockup uploads, same shape as the
 * project deliverables one: the file bytes go straight from the browser to
 * Blob storage, so a 20MB design export never has to fit through a
 * serverless request body. The URL it returns is what gets attached to the
 * lead as the next mockup.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        const session = await requireStaff();
        if (!session) {
          throw new Error('Unauthorized');
        }
        return {
          // A mockup is a design deliverable — a PNG, a PDF, sometimes a
          // video walkthrough — so it takes the deliverables policy rather
          // than "any type, any size". See lib/uploads.ts.
          allowedContentTypes: DELIVERABLE_CONTENT_TYPES,
          maximumSizeInBytes: DELIVERABLE_MAX_BYTES,
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => {
        // No-op: the browser gets the blob URL back from upload() and
        // attaches it via the mockups POST route.
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
