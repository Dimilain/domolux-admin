/**
 * Integration tests for upload flow (mocking Supabase)
 */

import { sanitizeFilename, generateFileKey, formatFileSize, validateFileType, validateFileSize } from '@/utils/upload';

// Mock Supabase client for integration tests
jest.mock('@supabase/supabase-js', () => {
  const mockStorage = {
    from: jest.fn().mockReturnThis(),
    upload: jest.fn(),
    createSignedUploadUrl: jest.fn(),
    getPublicUrl: jest.fn(),
  };

  return {
    createClient: jest.fn(() => ({
      storage: mockStorage,
    })),
  };
});

describe('Upload Flow Integration', () => {
  describe('File preparation', () => {
    it('should sanitize filename before upload', () => {
      const originalName = 'product image (1)@#$%.jpg';
      const sanitized = sanitizeFilename(originalName);
      
      expect(sanitized).toBe('product_image__1_____.jpg');
      expect(sanitized).toMatch(/^[a-zA-Z0-9._-]+$/);
    });

    it('should generate unique file key for upload', () => {
      const filename = 'test-image.jpg';
      const key1 = generateFileKey(filename);
      const key2 = generateFileKey(filename);
      
      expect(key1).toMatch(/^uploads\/\d+-[a-z0-9]+-test-image\.jpg$/);
      expect(key2).toMatch(/^uploads\/\d+-[a-z0-9]+-test-image\.jpg$/);
      expect(key1).not.toBe(key2);
    });

    it('should format file size for display', () => {
      const sizes = [
        { bytes: 0, expected: '0 Bytes' },
        { bytes: 1024, expected: '1 KB' },
        { bytes: 1048576, expected: '1 MB' },
        { bytes: 1073741824, expected: '1 GB' },
        { bytes: 1536, expected: '1.5 KB' },
      ];

      sizes.forEach(({ bytes, expected }) => {
        expect(formatFileSize(bytes)).toBe(expected);
      });
    });
  });

  describe('File validation', () => {
    it('should validate image file types', () => {
      const imageFile = new File([''], 'image.jpg', { type: 'image/jpeg' });
      const pdfFile = new File([''], 'document.pdf', { type: 'application/pdf' });
      
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      
      expect(validateFileType(imageFile, allowedTypes)).toBe(true);
      expect(validateFileType(pdfFile, allowedTypes)).toBe(false);
    });

    it('should validate GLB file types', () => {
      const glbFile = new File([''], 'model.glb', { type: 'model/gltf-binary' });
      const usdzFile = new File([''], 'model.usdz', { type: 'model/vnd.usdz+zip' });
      
      const allowedTypes = ['model/gltf-binary', 'model/vnd.usdz+zip'];
      
      expect(validateFileType(glbFile, allowedTypes)).toBe(true);
      expect(validateFileType(usdzFile, allowedTypes)).toBe(true);
    });

    it('should validate file size limits', () => {
      const smallFile = new File(['x'.repeat(1024)], 'small.jpg'); // 1KB
      const largeFile = new File(['x'.repeat(11 * 1024 * 1024)], 'large.jpg'); // 11MB
      
      const maxSize = 10 * 1024 * 1024; // 10MB
      
      expect(validateFileSize(smallFile, maxSize)).toBe(true);
      expect(validateFileSize(largeFile, maxSize)).toBe(false);
    });

    it('should handle zero-sized files', () => {
      const emptyFile = new File([''], 'empty.jpg');
      
      expect(validateFileSize(emptyFile, 1000)).toBe(true);
    });
  });

  describe('Upload flow simulation', () => {
    it('should prepare file for upload with correct format', () => {
      const originalFile = {
        name: 'Product Image (Final).jpg',
        type: 'image/jpeg',
        size: 2048576, // 2MB
      };

      // Step 1: Sanitize filename
      const sanitized = sanitizeFilename(originalFile.name);
      expect(sanitized).toBe('Product_Image__Final_.jpg');

      // Step 2: Generate file key
      const fileKey = generateFileKey(sanitized);
      expect(fileKey).toMatch(/^uploads\/\d+-[a-z0-9]+-Product_Image__Final_\.jpg$/);

      // Step 3: Validate file type
      const file = new File([''], originalFile.name, { type: originalFile.type });
      const isValidType = validateFileType(file, ['image/jpeg', 'image/png']);
      expect(isValidType).toBe(true);

      // Step 4: Validate file size
      const isValidSize = validateFileSize(file, 10 * 1024 * 1024);
      expect(isValidSize).toBe(true);

      // Step 5: Format size for display
      const formattedSize = formatFileSize(originalFile.size);
      // formatFileSize rounds to 2 decimal places, so 2048576 bytes = 1.95 MB
      expect(formattedSize).toBe('1.95 MB');
    });

    it('should handle GLB file upload flow', () => {
      const glbFile = {
        name: '3D Model.glb',
        type: 'model/gltf-binary',
        size: 5242880, // 5MB
      };

      const sanitized = sanitizeFilename(glbFile.name);
      const fileKey = generateFileKey(sanitized, 'models');
      
      expect(fileKey).toMatch(/^models\/\d+-[a-z0-9]+-3D_Model\.glb$/);

      const file = new File([''], glbFile.name, { type: glbFile.type });
      expect(validateFileType(file, ['model/gltf-binary'])).toBe(true);
      expect(validateFileSize(file, 10 * 1024 * 1024)).toBe(true);
    });

    it('should reject invalid file types', () => {
      const invalidFile = new File([''], 'script.exe', { type: 'application/x-msdownload' });
      
      const allowedTypes = ['image/jpeg', 'image/png', 'model/gltf-binary'];
      expect(validateFileType(invalidFile, allowedTypes)).toBe(false);
    });

    it('should reject files exceeding size limit', () => {
      const oversizedFile = new File(['x'.repeat(11 * 1024 * 1024)], 'large.jpg');
      
      expect(validateFileSize(oversizedFile, 10 * 1024 * 1024)).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should handle files with no extension', () => {
      const key = generateFileKey('file');
      expect(key).toMatch(/^uploads\/\d+-[a-z0-9]+-file$/);
    });

    it('should handle files with multiple extensions', () => {
      const key = generateFileKey('file.tar.gz');
      expect(key).toMatch(/^uploads\/\d+-[a-z0-9]+-file\.tar\.gz$/);
    });

    it('should handle very long filenames', () => {
      const longName = 'a'.repeat(200) + '.jpg';
      const sanitized = sanitizeFilename(longName);
      
      // Sanitize just replaces special chars, so length should be similar
      expect(sanitized).toMatch(/^[a-zA-Z0-9._-]+$/);
      expect(sanitized.endsWith('.jpg')).toBe(true);
    });

    it('should handle unicode characters', () => {
      const unicodeName = 'файл-тест.jpg';
      const sanitized = sanitizeFilename(unicodeName);
      
      // Unicode should be replaced with underscores
      expect(sanitized).not.toContain('файл');
      expect(sanitized).toMatch(/^[a-zA-Z0-9._-]+$/);
    });
  });
});

