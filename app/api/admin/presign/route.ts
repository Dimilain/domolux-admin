import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import axios from 'axios';

const STRAPI_URL = process.env.NEXT_PUBLIC_STRAPI_API_URL || 'http://localhost:1337';
const AWS_BUCKET = process.env.AWS_BUCKET;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const AWS_CLOUDFRONT_URL = process.env.AWS_CLOUDFRONT_URL; // Optional: CloudFront distribution URL

interface PresignRequestBody {
  filename: string;
  contentType: string;
  method?: 'POST' | 'PUT';
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication - validate NextAuth token
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized: No valid session' },
        { status: 401 }
      );
    }

    // Get Strapi JWT from session
    const jwt = (session.user as any)?.jwt;
    if (!jwt) {
      return NextResponse.json(
        { error: 'Unauthorized: No Strapi JWT token' },
        { status: 401 }
      );
    }

    // Validate request body
    const body: PresignRequestBody = await request.json();
    const { filename, contentType, method = 'POST' } = body;

    if (!filename || !contentType) {
      return NextResponse.json(
        { error: 'filename and contentType are required' },
        { status: 400 }
      );
    }

    // Call Strapi presign endpoint
    try {
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

      const strapiData = response.data;

      // Extract presigned URL and fields
      let uploadUrl: string;
      let fields: Record<string, string> = {};
      let publicUrl: string;

      if (method === 'POST' && strapiData.url && strapiData.fields) {
        // Presigned POST URL with fields
        uploadUrl = strapiData.url;
        fields = strapiData.fields;
        
        // Construct public URL from fileKey
        const fileKey = strapiData.fields?.key || strapiData.fileKey;
        if (fileKey) {
          // Use CloudFront URL if available, otherwise construct S3 URL
          if (AWS_CLOUDFRONT_URL) {
            publicUrl = `${AWS_CLOUDFRONT_URL}/${fileKey}`;
          } else if (AWS_BUCKET) {
            publicUrl = `https://${AWS_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${fileKey}`;
          } else {
            // Fallback: try to extract from upload URL
            const urlMatch = uploadUrl.match(/https?:\/\/([^\/]+)/);
            if (urlMatch) {
              publicUrl = `https://${urlMatch[1]}/${fileKey}`;
            } else {
              publicUrl = uploadUrl;
            }
          }
        } else {
          publicUrl = uploadUrl;
        }
      } else if (method === 'PUT' && strapiData.uploadUrl) {
        // Presigned PUT URL
        uploadUrl = strapiData.uploadUrl;
        
        // Construct public URL from fileKey
        const fileKey = strapiData.fileKey;
        if (fileKey) {
          if (AWS_CLOUDFRONT_URL) {
            publicUrl = `${AWS_CLOUDFRONT_URL}/${fileKey}`;
          } else if (AWS_BUCKET) {
            publicUrl = `https://${AWS_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${fileKey}`;
          } else {
            // Extract bucket from uploadUrl
            const urlMatch = uploadUrl.match(/https?:\/\/([^\/]+)/);
            if (urlMatch) {
              publicUrl = `https://${urlMatch[1]}/${fileKey}`;
            } else {
              publicUrl = uploadUrl;
            }
          }
        } else {
          publicUrl = uploadUrl;
        }
      } else {
        // Fallback: use Strapi response as-is
        uploadUrl = strapiData.url || strapiData.uploadUrl || '';
        fields = strapiData.fields || {};
        publicUrl = strapiData.publicUrl || uploadUrl;
      }

      // Return standardized response
      return NextResponse.json({
        uploadUrl,
        fields,
        publicUrl,
        method: strapiData.method || method,
        fileKey: strapiData.fileKey || fields.key || null,
      });
    } catch (strapiError: any) {
      console.error('Strapi presign error:', strapiError);
      
      if (axios.isAxiosError(strapiError)) {
        const message = strapiError.response?.data?.error?.message || 
                       strapiError.response?.data?.message || 
                       strapiError.message || 
                       'Failed to generate presigned URL from Strapi';
        
        return NextResponse.json(
          { error: message },
          { status: strapiError.response?.status || 500 }
        );
      }

      throw strapiError;
    }
  } catch (error: any) {
    console.error('Presign API error:', error);
    
    return NextResponse.json(
      { error: error.message || 'Failed to generate presigned URL' },
      { status: 500 }
    );
  }
}

