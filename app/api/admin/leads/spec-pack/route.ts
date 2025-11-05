import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import puppeteer from 'puppeteer';
import axios from 'axios';

const STRAPI_URL = process.env.NEXT_PUBLIC_STRAPI_API_URL || 'http://localhost:1337';

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const jwt = (session.user as any)?.jwt;
    const body = await request.json();
    const { leadId, lead } = body;

    if (!lead) {
      return NextResponse.json({ error: 'Lead data is required' }, { status: 400 });
    }

    // Fetch full product details from Strapi
    const productsWithDetails = await Promise.all(
      (lead.products || []).map(async (p: any) => {
        const productId = p.id || p.attributes?.id;
        if (!productId) return p;

        try {
          const response = await axios.get(
            `${STRAPI_URL}/api/products/${productId}?populate=*`,
            {
              headers: {
                Authorization: `Bearer ${jwt}`,
              },
            }
          );
          return response.data.data;
        } catch (error) {
          console.error(`Error fetching product ${productId}:`, error);
          return p;
        }
      })
    );

    // Launch Puppeteer
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 2000 });

    // Generate HTML for spec pack
    const productsHtml = productsWithDetails.map((p: any) => {
      const attrs = p.attributes || p;
      const productName = attrs.name || 'Unknown Product';
      const productSku = attrs.sku || '';
      const productPrice = attrs.price || 0;
      const productCurrency = attrs.currency || 'EUR';
      const productCategory = attrs.category || '';
      const productShortDesc = attrs.shortDesc || attrs.shortDesc || '';
      const productLongDesc = attrs.longDesc || attrs.description || '';
      
      const dimensions = attrs.dimensions || {};
      const dimensionsText = dimensions.width && dimensions.depth && dimensions.height
        ? `${dimensions.width} × ${dimensions.depth} × ${dimensions.height} ${dimensions.unit || 'cm'}`
        : 'Not specified';

      const thumbnailUrl = attrs.thumbnail?.data?.attributes?.url || 
                          attrs.images?.data?.[0]?.attributes?.url ||
                          '/placeholder.jpg';
      const fullThumbnailUrl = thumbnailUrl.startsWith('http') 
        ? thumbnailUrl 
        : `${STRAPI_URL}${thumbnailUrl}`;

      const finishes = attrs.finishes || [];
      const finishesText = finishes.length > 0
        ? finishes.map((f: any) => f.name || f).join(', ')
        : 'Not specified';

      return `
        <div style="margin-bottom: 30px; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px; page-break-inside: avoid;">
          <div style="display: flex; gap: 20px; margin-bottom: 15px;">
            <img src="${fullThumbnailUrl}" alt="${productName}" style="width: 150px; height: 150px; object-fit: cover; border-radius: 4px;" />
            <div style="flex: 1;">
              <h3 style="margin: 0 0 10px 0; font-size: 22px; font-weight: 600; color: #1F2832; font-family: 'Playfair Display', serif;">${productName}</h3>
              ${productSku ? `<p style="margin: 0 0 5px 0; font-size: 14px; color: #6b7280;">SKU: ${productSku}</p>` : ''}
              ${productCategory ? `<p style="margin: 0 0 5px 0; font-size: 14px; color: #6b7280;">Category: ${productCategory}</p>` : ''}
              <p style="margin: 10px 0 0 0; font-size: 18px; font-weight: 600; color: #6CAEDD;">${productCurrency} ${productPrice.toFixed(2)}</p>
            </div>
          </div>
          
          ${productShortDesc ? `<p style="margin: 10px 0; font-size: 14px; color: #374151; font-style: italic;">${productShortDesc}</p>` : ''}
          
          <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e5e7eb;">
            <h4 style="margin: 0 0 10px 0; font-size: 16px; font-weight: 600; color: #1F2832;">Specifications</h4>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 5px 0; font-size: 14px; color: #6b7280; width: 150px;">Dimensions:</td>
                <td style="padding: 5px 0; font-size: 14px; color: #374151; font-weight: 500;">${dimensionsText}</td>
              </tr>
              <tr>
                <td style="padding: 5px 0; font-size: 14px; color: #6b7280;">Finishes:</td>
                <td style="padding: 5px 0; font-size: 14px; color: #374151; font-weight: 500;">${finishesText}</td>
              </tr>
            </table>
          </div>
          
          ${productLongDesc ? `
            <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e5e7eb;">
              <h4 style="margin: 0 0 10px 0; font-size: 16px; font-weight: 600; color: #1F2832;">Description</h4>
              <div style="font-size: 14px; color: #374151; line-height: 1.6;">${productLongDesc.replace(/<[^>]*>/g, '')}</div>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    const totalPrice = productsWithDetails.reduce((sum: number, p: any) => {
      const attrs = p.attributes || p;
      return sum + (attrs.price || 0);
    }, 0);
    const currency = productsWithDetails.find((p: any) => {
      const attrs = p.attributes || p;
      return attrs.currency;
    })?.attributes?.currency || 
    productsWithDetails.find((p: any) => {
      const attrs = p.attributes || p;
      return attrs.currency;
    })?.currency || 
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
            <h1>Product Specification Pack</h1>
            <p>Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
            <p>Reference: SP-${leadId}-${Date.now()}</p>
          </div>
          
          <div class="customer-info">
            <h2>Customer Information</h2>
            <p><strong>Name:</strong> ${lead.name}</p>
            <p><strong>Email:</strong> ${lead.email}</p>
            ${lead.company ? `<p><strong>Company:</strong> ${lead.company}</p>` : ''}
          </div>
          
          <div class="products-section">
            <h2>Product Specifications</h2>
            ${productsHtml || '<p>No products specified</p>'}
          </div>
          
          <div class="total">
            <h3>Total Estimated Price: ${currency} ${totalPrice.toFixed(2)}</h3>
            <p style="margin: 5px 0 0 0; font-size: 14px; opacity: 0.9;">Prices are estimates and may vary based on customization and quantity</p>
          </div>
          
          <div class="footer">
            <p>This specification pack is provided by Domolux Design</p>
            <p>For detailed quotes and inquiries, please contact sales@domolux.com</p>
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
        'Content-Disposition': `attachment; filename="spec-pack-${leadId}-${Date.now()}.pdf"`,
      },
    });
  } catch (error: any) {
    console.error('Error generating spec pack:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate spec pack' },
      { status: 500 }
    );
  }
}


