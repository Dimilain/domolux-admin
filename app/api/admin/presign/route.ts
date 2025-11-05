import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import axios from 'axios';

const STRAPI_URL = process.env.NEXT_PUBLIC_STRAPI_API_URL || 'http://localhost:1337';

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const jwt = (session.user as any)?.jwt;
    if (!jwt) {
      return NextResponse.json({ error: 'No JWT token' }, { status: 401 });
    }

    // Get request body
    const body = await request.json();
    const { filename, contentType, method = 'PUT' } = body;

    if (!filename || !contentType) {
      return NextResponse.json(
        { error: 'filename and contentType are required' },
        { status: 400 }
      );
    }

    // Call Strapi presign endpoint
    const response = await axios.post(
      `${STRAPI_URL}/api/upload/presign`,
      {
        filename,
        contentType,
        method,
      },
      {
        headers: {
          Authorization: `Bearer ${jwt}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return NextResponse.json(response.data);
  } catch (error: any) {
    console.error('Presign error:', error);
    
    if (axios.isAxiosError(error)) {
      const message = error.response?.data?.error?.message || error.message || 'Failed to generate presigned URL';
      return NextResponse.json(
        { error: message },
        { status: error.response?.status || 500 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to generate presigned URL' },
      { status: 500 }
    );
  }
}

