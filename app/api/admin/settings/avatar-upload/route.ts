import { NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { requireStaff } from '@/lib/middleware';
import { AVATAR_CONTENT_TYPES, AVATAR_MAX_BYTES } from '@/lib/uploads';

/** Token endpoint for an admin uploading their own profile headshot. */
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
          allowedContentTypes: AVATAR_CONTENT_TYPES,
          maximumSizeInBytes: AVATAR_MAX_BYTES,
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
