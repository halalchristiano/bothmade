import { NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { requireStaff } from '@/lib/middleware';
import { CLIENT_ATTACHMENT_CONTENT_TYPES, CLIENT_ATTACHMENT_MAX_BYTES } from '@/lib/uploads';

/**
 * Token endpoint for staff attaching a file to a team-chat message.
 *
 * Same envelope as the client attachment route — the file types a person
 * would reasonably share in a conversation, capped at the same size — but
 * gated on a staff session. The chat is internal, so there's no ownership
 * question to check beyond "you work here."
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
          allowedContentTypes: CLIENT_ATTACHMENT_CONTENT_TYPES,
          maximumSizeInBytes: CLIENT_ATTACHMENT_MAX_BYTES,
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => {},
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 400 }
    );
  }
}
