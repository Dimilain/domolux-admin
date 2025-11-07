import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import puppeteer from 'puppeteer';

const STRAPI_URL = process.env.NEXT_PUBLIC_STRAPI_API_URL || 'http://localhost:1337';

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { leadId, lead } = body;

    if (!lead) {
      return NextResponse.json({ error: 'Lead data is required' }, { status: 400 });
    }

    // Launch Puppeteer
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 1600 });

    // Generate HTML for quote
    const productsHtml = (lead.products || []).map((p: any) => {
      const productName = p.attributes?.name || p.name || 'Unknown Product';
      const productSku = p.attributes?.sku || p.sku || '';
      const productPrice = p.attributes?.price || p.price || 0;
      const productCurrency = p.attributes?.currency || p.currency || 'EUR';
      const thumbnailUrl = p.attributes?.thumbnail?.data?.attributes?.url || 
                          p.thumbnail?.url || 
                          '/placeholder.jpg';
      const fullThumbnailUrl = thumbnailUrl.startsWith('http') 
        ? thumbnailUrl 
        : `${STRAPI_URL}${thumbnailUrl}`;

      return `
        <div style="margin-bottom: 20px; padding: 15px; border: 1px solid #e5e7eb; border-radius: 8px; display: flex; gap: 15px;">
          <img src="${fullThumbnailUrl}" alt="${productName}" style="width: 100px; height: 100px; object-fit: cover; border-radius: 4px;" />
          <div style="flex: 1;">
            <h3 style="margin: 0 0 5px 0; font-size: 18px; font-weight: 600; color: #1F2832;">${productName}</h3>
            ${productSku ? `<p style="margin: 0 0 5px 0; font-size: 14px; color: #6b7280;">SKU: ${productSku}</p>` : ''}
            <p style="margin: 0; font-size: 16px; font-weight: 600; color: #6CAEDD;">${productCurrency} ${productPrice.toFixed(2)}</p>
          </div>
        </div>
      `;
    }).join('');

    const totalPrice = (lead.products || []).reduce((sum: number, p: any) => {
      return sum + (p.attributes?.price || p.price || 0);
    }, 0);
    const currency = (lead.products || []).find((p: any) => p.attributes?.currency || p.currency)?.attributes?.currency || 
                     (lead.products || []).find((p: any) => p.attributes?.currency || p.currency)?.currency || 
                     'EUR';

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body {
              font-family: 'Lato', Arial, sans-serif;
              margin: 0;
              padding: 40px;
              color: #1F2832;
              background: #ffffff;
            }
            .header {
              margin-bottom: 40px;
              padding-bottom: 20px;
              border-bottom: 2px solid #6CAEDD;
            }
            .header h1 {
              margin: 0 0 10px 0;
              font-size: 32px;
              font-weight: 700;
              color: #1F2832;
              font-family: 'Playfair Display', serif;
            }
            .header p {
              margin: 5px 0;
              font-size: 14px;
              color: #6b7280;
            }
            .customer-info {
              margin-bottom: 30px;
              padding: 20px;
              background: #f9fafb;
              border-radius: 8px;
            }
            .customer-info h2 {
              margin: 0 0 15px 0;
              font-size: 20px;
              font-weight: 600;
              color: #1F2832;
              font-family: 'Playfair Display', serif;
            }
            .customer-info p {
              margin: 5px 0;
              font-size: 14px;
              color: #374151;
            }
            .products-section {
              margin-bottom: 30px;
            }
            .products-section h2 {
              margin: 0 0 20px 0;
              font-size: 20px;
              font-weight: 600;
              color: #1F2832;
              font-family: 'Playfair Display', serif;
            }
            .total {
              margin-top: 30px;
              padding: 20px;
              background: #6CAEDD;
              color: white;
              border-radius: 8px;
              text-align: right;
            }
            .total h3 {
              margin: 0;
              font-size: 24px;
              font-weight: 700;
            }
            .footer {
              margin-top: 40px;
              padding-top: 20px;
              border-top: 1px solid #e5e7eb;
              text-align: center;
              font-size: 12px;
              color: #6b7280;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Product Quote</h1>
            <p>Quote Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
            <p>Quote ID: Q-${leadId}-${Date.now()}</p>
          </div>
          
          <div class="customer-info">
            <h2>Customer Information</h2>
            <p><strong>Name:</strong> ${lead.name}</p>
            <p><strong>Email:</strong> ${lead.email}</p>
            ${lead.company ? `<p><strong>Company:</strong> ${lead.company}</p>` : ''}
          </div>
          
          <div class="products-section">
            <h2>Products</h2>
            ${productsHtml || '<p>No products specified</p>'}
          </div>
          
          <div class="total">
            <h3>Total: ${currency} ${totalPrice.toFixed(2)}</h3>
          </div>
          
          <div class="footer">
            <p>This is an automated quote generated by Domolux Design</p>
            <p>For inquiries, please contact sales@domolux.com</p>
          </div>
        </body>
      </html>
    `;

    // Set HTML content
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20mm',
        right: '15mm',
        bottom: '20mm',
        left: '15mm',
      },
    });

    await browser.close();

    // Return PDF
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="quote-${leadId}-${Date.now()}.pdf"`,
      },
    });
  } catch (error: any) {
    console.error('Error generating quote:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate quote' },
      { status: 500 }
    );
  }
}




