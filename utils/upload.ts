/**
 * Utility functions for API calls
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:1337';
const API_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN || '';

/**
 * Simple fetch wrapper for API calls
 */
export const apiFetch = async (path: string): Promise<any> => {
  const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:1337';
  const url = path.startsWith('/') ? `${base}/api${path}` : `${base}/api/${path}`;
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (API_TOKEN) {
    headers['Authorization'] = `Bearer ${API_TOKEN}`;
  }

  const res = await fetch(url, { headers });

  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
};

/**
 * Sanitize filename for storage upload (Supabase Storage)
 */
export const sanitizeFilename = (filename: string): string => {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
};

/**
 * Generate unique file key for storage upload (Supabase Storage)
 */
export const generateFileKey = (filename: string, prefix: string = 'uploads'): string => {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 15);
  const sanitized = sanitizeFilename(filename);
  return `${prefix}/${timestamp}-${randomString}-${sanitized}`;
};

/**
 * Format file size to human readable format
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

/**
 * Validate file type
 */
export const validateFileType = (file: File, allowedTypes: string[]): boolean => {
  return allowedTypes.includes(file.type);
};

/**
 * Validate file size
 */
export const validateFileSize = (file: File, maxSizeBytes: number): boolean => {
  return file.size <= maxSizeBytes;
};

