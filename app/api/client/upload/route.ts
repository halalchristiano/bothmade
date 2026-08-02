import { NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { prisma } from '@/lib/prisma';
import { requireClient } from '@/lib/middleware';
import {
  CLIENT_ATTACHMENT_CONTENT_TYPES,
  CLIENT_ATTACHMENT_MAX_BYTES,
  readProjectIdFromPayload,
} from '@/lib/uploads';

/**
 * Token endpoint for clients uploading a file to attach to a project message.
 *
 * Three things changed here. It used to accept *any* session — including a
 * staff session, and including a client mid-forced-password-change — with
 * no file type restriction and no size cap, and with no notion of which
 * project the upload belonged to. Now the caller must be a client in good
 * standing, the file has to be a plausible attachment, and the upload has to
 * name a project that client actually owns.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const { session } = await requireClient();
        if (!session) {
          throw new Error('Unauthorized');
        }

        const projectId = readProjectIdFromPayload(clientPayload);
        if (!projectId) {
          throw new Error('Upload must name the project it belongs to');
        }

        // The payload comes from the browser, so ownership is checked
        // against the database rather than taken on the client's word.
        const project = await prisma.project.findFirst({
          where: { id: projectId, clientId: session.clientId },
          select: { id: true },
        });
        if (!project) {
          throw new Error('Project not found');
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
