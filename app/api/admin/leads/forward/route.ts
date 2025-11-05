import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import nodemailer from 'nodemailer';

const STRAPI_URL = process.env.NEXT_PUBLIC_STRAPI_API_URL || 'http://localhost:1337';
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587');
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SALES_EMAIL = process.env.SALES_EMAIL || 'sales@domolux.com';

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

    // Configure email transporter
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: SMTP_USER && SMTP_PASS ? {
        user: SMTP_USER,
        pass: SMTP_PASS,
      } : undefined,
    });

    // Prepare email content
    const productsList = lead.products?.map((p: any) => {
      const productName = p.attributes?.name || p.name || 'Unknown Product';
      const productPrice = p.attributes?.price || p.price || 0;
      const productCurrency = p.attributes?.currency || p.currency || 'EUR';
      return `- ${productName} (${productCurrency} ${productPrice})`;
    }).join('\n') || 'No products specified';

    const emailHtml = `
      <h2>New Lead - Forward to Sales</h2>
      <p><strong>Lead ID:</strong> ${leadId}</p>
      <p><strong>Name:</strong> ${lead.name}</p>
      <p><strong>Email:</strong> ${lead.email}</p>
      <p><strong>Company:</strong> ${lead.company || 'Not provided'}</p>
      <p><strong>Message:</strong></p>
      <p>${lead.message || 'No message'}</p>
      <p><strong>Products:</strong></p>
      <pre>${productsList}</pre>
      <p><a href="${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/admin/leads">View Lead in Admin</a></p>
    `;

    // Send email
    await transporter.sendMail({
      from: SMTP_USER || `noreply@${process.env.NEXT_PUBLIC_SITE_URL?.replace('https://', '').replace('http://', '') || 'domolux.com'}`,
      to: SALES_EMAIL,
      subject: `New Lead: ${lead.name} - ${lead.company || 'No Company'}`,
      html: emailHtml,
      text: `
        New Lead - Forward to Sales
        
        Lead ID: ${leadId}
        Name: ${lead.name}
        Email: ${lead.email}
        Company: ${lead.company || 'Not provided'}
        
        Message:
        ${lead.message || 'No message'}
        
        Products:
        ${productsList}
      `,
    });

    return NextResponse.json({ success: true, message: 'Lead forwarded to sales team' });
  } catch (error: any) {
    console.error('Error forwarding lead:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to forward lead' },
      { status: 500 }
    );
  }
}

