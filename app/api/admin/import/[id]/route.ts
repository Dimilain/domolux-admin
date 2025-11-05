import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { Queue } from 'bullmq';

const REDIS_URL = process.env.REDIS_URL || process.env.REDISCLOUD_URL || 'redis://localhost:6379';

// Initialize BullMQ queue for job status
let importQueue: Queue | null = null;

try {
  importQueue = new Queue('product-import', {
    connection: {
      url: REDIS_URL,
    },
  });
} catch (error) {
  console.warn('Failed to initialize Redis queue:', error);
}

// GET /api/admin/import/[id] - Get job status
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    if (!importQueue) {
      return NextResponse.json(
        { error: 'Job queue not available' },
        { status: 503 }
      );
    }

    // Get job from queue
    const job = await importQueue.getJob(id);

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Get job state
    const state = await job.getState();
    const progress = job.progress as number || 0;
    const returnValue = job.returnvalue as any;

    // Determine status
    let status: 'pending' | 'processing' | 'completed' | 'failed' = 'pending';
    if (state === 'completed') {
      status = 'completed';
    } else if (state === 'failed') {
      status = 'failed';
    } else if (state === 'active') {
      status = 'processing';
    }

    // Get job data
    const jobData = job.data as any;
    const total = jobData?.csvData?.length || 0;

    // Build response
    const response: any = {
      id: job.id,
      status,
      progress: typeof progress === 'number' ? progress : 0,
      total,
      processed: returnValue?.processed || 0,
      errors: returnValue?.errors || [],
    };

    // If job failed, include error message
    if (state === 'failed') {
      response.error = job.failedReason || 'Job failed';
    }

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Job status error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get job status' },
      { status: 500 }
    );
  }
}



