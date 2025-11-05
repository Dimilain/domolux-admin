import { sanitizeFilename, generateFileKey, formatFileSize, validateFileType, validateFileSize } from '@/utils/upload';

describe('upload utilities', () => {
  describe('sanitizeFilename', () => {
    it('should sanitize filename with special characters', () => {
      expect(sanitizeFilename('test file (1).jpg')).toBe('test_file__1__jpg');
      expect(sanitizeFilename('product@name#123.png')).toBe('product_name_123.png');
    });

    it('should keep valid characters', () => {
      expect(sanitizeFilename('product-image_123.jpg')).toBe('product-image_123.jpg');
      expect(sanitizeFilename('test.file-name.png')).toBe('test.file-name.png');
    });

    it('should handle empty string', () => {
      expect(sanitizeFilename('')).toBe('');
    });
  });

  describe('generateFileKey', () => {
    it('should generate unique file key', () => {
      const key1 = generateFileKey('test.jpg');
      const key2 = generateFileKey('test.jpg');
      
      expect(key1).toMatch(/^uploads\/\d+-[a-z0-9]+-test\.jpg$/);
      expect(key2).toMatch(/^uploads\/\d+-[a-z0-9]+-test\.jpg$/);
      expect(key1).not.toBe(key2);
    });

    it('should use custom prefix', () => {
      const key = generateFileKey('test.jpg', 'media');
      expect(key).toMatch(/^media\/\d+-[a-z0-9]+-test\.jpg$/);
    });

    it('should sanitize filename in key', () => {
      const key = generateFileKey('test file (1).jpg');
      expect(key).toMatch(/test_file__1__jpg$/);
    });
  });

  describe('formatFileSize', () => {
    it('should format bytes correctly', () => {
      expect(formatFileSize(0)).toBe('0 Bytes');
      expect(formatFileSize(1024)).toBe('1 KB');
      expect(formatFileSize(1048576)).toBe('1 MB');
      expect(formatFileSize(1073741824)).toBe('1 GB');
    });

    it('should handle decimal values', () => {
      expect(formatFileSize(1536)).toBe('1.5 KB');
      expect(formatFileSize(2621440)).toBe('2.5 MB');
    });
  });

  describe('validateFileType', () => {
    it('should validate allowed file types', () => {
      const file = new File([''], 'test.jpg', { type: 'image/jpeg' });
      expect(validateFileType(file, ['image/jpeg', 'image/png'])).toBe(true);
      expect(validateFileType(file, ['image/png'])).toBe(false);
    });

    it('should handle empty allowed types', () => {
      const file = new File([''], 'test.jpg', { type: 'image/jpeg' });
      expect(validateFileType(file, [])).toBe(false);
    });
  });

  describe('validateFileSize', () => {
    it('should validate file size', () => {
      const file1 = new File(['x'.repeat(1024)], 'test.jpg');
      const file2 = new File(['x'.repeat(2048)], 'test.jpg');
      
      expect(validateFileSize(file1, 2048)).toBe(true);
      expect(validateFileSize(file2, 1024)).toBe(false);
    });

    it('should handle zero size', () => {
      const file = new File([''], 'test.jpg');
      expect(validateFileSize(file, 1000)).toBe(true);
    });
  });
});

