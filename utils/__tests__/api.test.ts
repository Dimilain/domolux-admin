import { apiFetch } from '@/utils/api';

// Mock fetch globally
global.fetch = jest.fn();

describe('api utilities', () => {
  beforeEach(() => {
    (fetch as jest.Mock).mockClear();
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:1337';
    process.env.NEXT_PUBLIC_API_TOKEN = 'test-token';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('apiFetch', () => {
    it('should fetch data successfully', async () => {
      const mockData = { data: [{ id: 1, name: 'Test' }] };
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      const result = await apiFetch('/products');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:1337/api/products',
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-token',
          },
        }
      );
      expect(result).toEqual(mockData);
    });

    it('should handle paths with leading slash', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await apiFetch('/products');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:1337/api/products',
        expect.any(Object)
      );
    });

    it('should handle paths without leading slash', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await apiFetch('products');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:1337/api/products',
        expect.any(Object)
      );
    });

    it('should throw error on failed request', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(apiFetch('/products')).rejects.toThrow('API error: 404 Not Found');
    });

    it('should work without API token', async () => {
      process.env.NEXT_PUBLIC_API_TOKEN = '';
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await apiFetch('/products');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:1337/api/products',
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    });
  });
});

