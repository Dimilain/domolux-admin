import { POST } from '../route';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import axios from 'axios';

// Mock dependencies
jest.mock('next-auth');
jest.mock('axios');
jest.mock('@/app/api/auth/[...nextauth]/route', () => ({
  authOptions: {},
}));

const mockedGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('POST /api/admin/presign', () => {
  let mockRequest: NextRequest;
  const mockSession = {
    user: {
      jwt: 'test-jwt-token',
    },
  };

  beforeEach(() => {
    // Setup environment variables
    process.env.NEXT_PUBLIC_STRAPI_API_URL = 'http://localhost:1337';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET = 'uploads';

    // Mock NextAuth session
    mockedGetServerSession.mockResolvedValue(mockSession as any);

    // Mock axios
    mockedAxios.post = jest.fn();
    mockedAxios.isAxiosError = jest.fn().mockReturnValue(false);

    // Create mock request
    mockRequest = new NextRequest('http://localhost:3000/api/admin/presign', {
      method: 'POST',
      body: JSON.stringify({
        filename: 'test-image.jpg',
        contentType: 'image/jpeg',
        method: 'POST',
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.NEXT_PUBLIC_STRAPI_API_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET;
  });

  describe('Authentication', () => {
    it('should return 401 if no session', async () => {
      mockedGetServerSession.mockResolvedValue(null);

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized: No valid session');
    });

    it('should return 401 if no JWT token in session', async () => {
      mockedGetServerSession.mockResolvedValue({
        user: {},
      } as any);

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized: No Strapi JWT token');
    });
  });

  describe('Request Validation', () => {
    it('should return 400 if filename is missing', async () => {
      const request = new NextRequest('http://localhost:3000/api/admin/presign', {
        method: 'POST',
        body: JSON.stringify({
          contentType: 'image/jpeg',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('filename and contentType are required');
    });

    it('should return 400 if contentType is missing', async () => {
      const request = new NextRequest('http://localhost:3000/api/admin/presign', {
        method: 'POST',
        body: JSON.stringify({
          filename: 'test.jpg',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('filename and contentType are required');
    });
  });

  describe('Strapi Integration', () => {
    it('should call Strapi presign endpoint with correct parameters', async () => {
      mockedAxios.post.mockResolvedValue({
        data: {
          uploadUrl: 'https://test.supabase.co/upload',
          fileKey: 'uploads/test-file.jpg',
          publicUrl: 'https://test.supabase.co/storage/v1/object/public/uploads/test-file.jpg',
        },
      });

      await POST(mockRequest);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://localhost:1337/api/upload/presign',
        {
          filename: 'test-image.jpg',
          contentType: 'image/jpeg',
          method: 'POST',
        },
        {
          headers: {
            Authorization: 'Bearer test-jwt-token',
            'Content-Type': 'application/json',
          },
        }
      );
    });

    it('should return presigned URL response for POST method', async () => {
      mockedAxios.post.mockResolvedValue({
        data: {
          url: 'https://test.supabase.co/upload',
          fields: { key: 'uploads/test-file.jpg' },
          fileKey: 'uploads/test-file.jpg',
          publicUrl: 'https://test.supabase.co/storage/v1/object/public/uploads/test-file.jpg',
        },
      });

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toMatchObject({
        uploadUrl: 'https://test.supabase.co/upload',
        fields: { key: 'uploads/test-file.jpg' },
        publicUrl: 'https://test.supabase.co/storage/v1/object/public/uploads/test-file.jpg',
        fileKey: 'uploads/test-file.jpg',
      });
    });

    it('should return presigned URL response for PUT method', async () => {
      const request = new NextRequest('http://localhost:3000/api/admin/presign', {
        method: 'POST',
        body: JSON.stringify({
          filename: 'test-image.jpg',
          contentType: 'image/jpeg',
          method: 'PUT',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      mockedAxios.post.mockResolvedValue({
        data: {
          uploadUrl: 'https://test.supabase.co/upload',
          fileKey: 'uploads/test-file.jpg',
          publicUrl: 'https://test.supabase.co/storage/v1/object/public/uploads/test-file.jpg',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toMatchObject({
        uploadUrl: 'https://test.supabase.co/upload',
        publicUrl: 'https://test.supabase.co/storage/v1/object/public/uploads/test-file.jpg',
        fileKey: 'uploads/test-file.jpg',
      });
    });

    it('should construct public URL if not provided by Strapi', async () => {
      mockedAxios.post.mockResolvedValue({
        data: {
          url: 'https://test.supabase.co/upload',
          fields: { key: 'uploads/test-file.jpg' },
          fileKey: 'uploads/test-file.jpg',
        },
      });

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(data.publicUrl).toBe(
        'https://test.supabase.co/storage/v1/object/public/uploads/uploads/test-file.jpg'
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle Strapi API errors', async () => {
      const axiosError = {
        response: {
          status: 500,
          data: {
            error: {
              message: 'Internal server error',
            },
          },
        },
        isAxiosError: true,
      };

      mockedAxios.isAxiosError = jest.fn().mockReturnValue(true);
      mockedAxios.post.mockRejectedValue(axiosError);

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Internal server error');
    });

    it('should handle network errors', async () => {
      mockedAxios.isAxiosError = jest.fn().mockReturnValue(true);
      mockedAxios.post.mockRejectedValue(new Error('Network error'));

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toContain('Failed to generate presigned URL');
    });

    it('should handle unexpected errors', async () => {
      mockedAxios.post.mockRejectedValue(new Error('Unexpected error'));

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Unexpected error');
    });
  });
});

