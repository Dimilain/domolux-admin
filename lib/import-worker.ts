import { Queue, Worker } from 'bullmq';
import axios from 'axios';

const STRAPI_URL = process.env.NEXT_PUBLIC_STRAPI_API_URL || 'http://localhost:1337';
const REDIS_URL = process.env.REDIS_URL || process.env.REDISCLOUD_URL || 'redis://localhost:6379';

// Initialize BullMQ queue and worker
let importQueue: Queue | null = null;
let importWorker: Worker | null = null;

interface CSVRow {
  [key: string]: string;
}

interface FieldMappings {
  [csvColumn: string]: string;
}

interface ImportJobData {
  csvData: CSVRow[];
  fieldMappings: FieldMappings;
  jwt: string;
  userId: number;
}

// Process a single product import
async function processProductImport(
  row: CSVRow,
  fieldMappings: FieldMappings,
  jwt: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Map CSV row to product data
    const productData: any = {
      name: '',
      sku: '',
      slug: '',
      shortDesc: '',
      longDesc: '',
      price: null,
      currency: 'EUR',
      category: 'Chair',
      tags: [],
      dimensions: {
        width: null,
        depth: null,
        height: null,
        unit: 'cm',
      },
      finishes: [],
      availability: 'In Stock',
      hotel_grade: false,
    };

    // Map CSV columns to product fields
    Object.keys(fieldMappings).forEach((csvColumn) => {
      const productField = fieldMappings[csvColumn];
      if (!productField || !row[csvColumn]) return;

      const value = row[csvColumn].trim();

      switch (productField) {
        case 'name':
          productData.name = value;
          break;
        case 'sku':
          productData.sku = value;
          break;
        case 'slug':
          productData.slug = value;
          break;
        case 'shortDesc':
          productData.shortDesc = value;
          break;
        case 'longDesc':
          productData.longDesc = value;
          break;
        case 'price':
          productData.price = parseFloat(value) || null;
          break;
        case 'currency':
          productData.currency = value.toUpperCase();
          break;
        case 'category':
          productData.category = value;
          break;
        case 'tags':
          productData.tags = value.split(',').map((t) => t.trim()).filter(Boolean);
          break;
        case 'width':
          productData.dimensions.width = parseFloat(value) || null;
          break;
        case 'depth':
          productData.dimensions.depth = parseFloat(value) || null;
          break;
        case 'height':
          productData.dimensions.height = parseFloat(value) || null;
          break;
        case 'unit':
          productData.dimensions.unit = value;
          break;
        case 'finishes':
          productData.finishes = value.split(',').map((f) => {
            const parts = f.trim().split(':');
            return {
              name: parts[0] || f.trim(),
              colorHex: parts[1] || '#000000',
            };
          });
          break;
        case 'availability':
          productData.availability = value;
          break;
        case 'hotel_grade':
          productData.hotel_grade = value.toLowerCase() === 'true' || value.toLowerCase() === 'yes';
          break;
      }
    });

    // Auto-generate slug if not provided
    if (!productData.slug && productData.name) {
      productData.slug = productData.name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    }

    // Validate required fields
    if (!productData.name) {
      return { success: false, error: 'Name is required' };
    }

    // Create product in Strapi
    const response = await axios.post(
      `${STRAPI_URL}/api/products`,
      {
        data: productData,
      },
      {
        headers: {
          Authorization: `Bearer ${jwt}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const productId = response.data.data.id;

    // Queue asset downloads if URLs are present
    // Note: Asset downloads would be queued here if we implement a download worker
    // For now, we'll just log them
    const assetUrls: string[] = [];
    if (row.image_urls) {
      assetUrls.push(...row.image_urls.split(',').map((url) => url.trim()));
    }
    if (row.glb_url) {
      assetUrls.push(row.glb_url.trim());
    }
    if (row.usdz_url) {
      assetUrls.push(row.usdz_url.trim());
    }
    if (row.cad_urls) {
      assetUrls.push(...row.cad_urls.split(',').map((url) => url.trim()));
    }

    if (assetUrls.length > 0) {
      console.log(`Product ${productId} has ${assetUrls.length} assets to download`);
    }

    return { success: true };
  } catch (error: any) {
    console.error('Product import error:', error);
    return {
      success: false,
      error: error.response?.data?.error?.message || error.message || 'Unknown error',
    };
  }
}

// Initialize worker if Redis is available
if (REDIS_URL && REDIS_URL !== 'redis://localhost:6379') {
  try {
    importQueue = new Queue('product-import', {
      connection: {
        url: REDIS_URL,
      },
    });

    importWorker = new Worker(
      'product-import',
      async (job) => {
        const { csvData, fieldMappings, jwt } = job.data as ImportJobData;
        const errors: string[] = [];
        let processed = 0;

        for (let i = 0; i < csvData.length; i++) {
          const row = csvData[i];
          const result = await processProductImport(row, fieldMappings, jwt);

          if (result.success) {
            processed++;
          } else {
            errors.push(`Row ${i + 1}: ${result.error || 'Unknown error'}`);
          }

          // Update job progress
          await job.updateProgress(Math.round(((i + 1) / csvData.length) * 100));
        }

        return {
          processed,
          total: csvData.length,
          errors,
        };
      },
      {
        connection: {
          url: REDIS_URL,
        },
        concurrency: 1, // Process one product at a time to avoid overwhelming Strapi
      }
    );

    importWorker.on('completed', (job) => {
      console.log(`Import job ${job.id} completed`);
    });

    importWorker.on('failed', (job, err) => {
      console.error(`Import job ${job?.id} failed:`, err);
    });
  } catch (error) {
    console.warn('Failed to initialize import worker:', error);
  }
}

export { importQueue, importWorker };





