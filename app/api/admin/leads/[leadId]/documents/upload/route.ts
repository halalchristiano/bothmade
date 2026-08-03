import { NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { requireStaff } from '@/lib/middleware';
import { DOCUMENT_CONTENT_TYPES, DOCUMENT_MAX_BYTES } from '@/lib/uploads';

/**
 * Token endpoint for the lead's paperwork fields — the mockup PDF and the
 * invoice PDF under "Files & access".
 *
 * Those fields used to take a URL and nothing else, which quietly assumed
 * the file was already hosted somewhere. In practice the PDF is sitting on
 * somebody's desktop, so the field could only be filled by first uploading
 * it elsewhere and pasting the link back. Now it takes either.
 *
 * Same direct-to-Blob shape as the mockups and deliverables routes: the
 * bytes go straight from the browser to storage and never pass through this
 * function, so a large export doesn't have to fit in a serverless request
 * body. Its own policy rather than the deliverables one, because a field
 * labelled "Invoice PDF" should not accept a video.
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
          allowedContentTypes: DOCUMENT_CONTENT_TYPES,
          maximumSizeInBytes: DOCUMENT_MAX_BYTES,
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => {
        // No-op: the browser receives the blob URL from upload() and saves
        // it onto the lead through the existing PATCH route.
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
