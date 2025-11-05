import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import axios from 'axios';
import { Queue, Worker, Job } from 'bullmq';

const STRAPI_URL = process.env.NEXT_PUBLIC_STRAPI_API_URL || 'http://localhost:1337';
const REDIS_URL = process.env.REDIS_URL || process.env.REDISCLOUD_URL || 'redis://localhost:6379';

// Initialize BullMQ queue for import jobs
let importQueue: Queue | null = null;

try {
  importQueue = new Queue('product-import', {
    connection: {
      url: REDIS_URL,
    },
  });
} catch (error) {
  console.warn('Failed to initialize Redis queue:', error);
  console.warn('Large imports will run synchronously');
}

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

const LARGE_IMPORT_THRESHOLD = 50; // Process in background if more than 50 products

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
    const assetUrls: string[] = [];
    if (row.image_urls) {
      assetUrls.push(...row.image_urls.split(',').map((url) => ({ type: 'image', url: url.trim() })));
    }
    if (row.glb_url) {
      assetUrls.push({ type: 'glb', url: row.glb_url.trim() });
    }
    if (row.usdz_url) {
      assetUrls.push({ type: 'usdz', url: row.usdz_url.trim() });
    }
    if (row.cad_urls) {
      assetUrls.push(...row.cad_urls.split(',').map((url) => ({ type: 'cad', url: url.trim() })));
    }

    // Note: Asset downloads would be queued here if we implement a download worker
    // For now, we'll just log them
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

// POST /api/admin/import - Start import
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

    const body = await request.json();
    const { csvData, fieldMappings }: { csvData: CSVRow[]; fieldMappings: FieldMappings } = body;

    if (!csvData || !Array.isArray(csvData) || csvData.length === 0) {
      return NextResponse.json({ error: 'CSV data is required' }, { status: 400 });
    }

    if (!fieldMappings || Object.keys(fieldMappings).length === 0) {
      return NextResponse.json({ error: 'Field mappings are required' }, { status: 400 });
    }

    const totalProducts = csvData.length;
    const isLargeImport = totalProducts > LARGE_IMPORT_THRESHOLD;

    // For large imports, queue job
    if (isLargeImport && importQueue) {
      const job = await importQueue.add(
        'import-products',
        {
          csvData,
          fieldMappings,
          jwt,
          userId: (session.user as any).id,
        } as ImportJobData,
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        }
      );

      return NextResponse.json({
        id: job.id,
        status: 'pending',
        progress: 0,
        total: totalProducts,
        processed: 0,
        errors: [],
      });
    }

    // For small imports, process synchronously
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
    }

    return NextResponse.json({
      success: true,
      processed,
      total: totalProducts,
      errors,
    });
  } catch (error: any) {
    console.error('Import error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to start import' },
      { status: 500 }
    );
  }
}

