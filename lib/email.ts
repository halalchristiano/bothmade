import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'contact@bothmade.com';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export interface EmailData {
  to: string;
  subject: string;
  html: string;
}

/**
 * Send email using Resend
 */
export async function sendEmail(data: EmailData): Promise<boolean> {
  try {
    const result = await resend.emails.send({
      from: `Bothmade <${CONTACT_EMAIL}>`,
      to: data.to,
      subject: data.subject,
      html: data.html,
    });

    if (result.error) {
      console.error('Resend error:', result.error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Email send failed:', error);
    return false;
  }
}

/**
 * Send welcome email to new client
 */
export async function sendWelcomeEmail(
  clientEmail: string,
  clientName: string,
  password: string,
  projectName: string,
  serviceType?: string,
  timeline?: string
): Promise<boolean> {
  const loginUrl = `${SITE_URL}/client/login`;
  const projectDetails = [
    serviceType ? `<li><strong>Service:</strong> ${serviceType}</li>` : '',
    timeline ? `<li><strong>Timeline:</strong> ${timeline}</li>` : '',
  ]
    .filter(Boolean)
    .join('');

  const html = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Welcome to Bothmade</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #333; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
      .header { background: #000; color: #fff; padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0; }
      .content { background: #f9f9f9; padding: 40px 20px; border-radius: 0 0 8px 8px; }
      .button { display: inline-block; background: #000; color: #fff; padding: 12px 30px; text-decoration: none; border-radius: 4px; margin: 20px 0; }
      .credentials { background: #fff; border: 1px solid #ddd; padding: 20px; border-radius: 4px; margin: 20px 0; font-family: monospace; }
      .footer { text-align: center; font-size: 12px; color: #999; margin-top: 20px; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1 style="margin: 0;">Welcome to Bothmade</h1>
      </div>
      <div class="content">
        <p>Hi ${clientName},</p>
        <p>Your project <strong>${projectName}</strong> has been created and is ready to begin. We're excited to work with you!</p>

        ${projectDetails ? `<h3>Project Details</h3><ul>${projectDetails}</ul>` : ''}

        <h3>Your Login Credentials</h3>
        <div class="credentials">
          <p><strong>Email:</strong> ${clientEmail}</p>
          <p><strong>Temporary Password:</strong> ${password}</p>
        </div>

        <p><strong>Please change your password after your first login.</strong></p>

        <p>
          <a href="${loginUrl}" class="button">Access Your Project Dashboard</a>
        </p>

        <h3>What's Next?</h3>
        <ul>
          <li>Log in to your dashboard to view your project timeline and deliverables</li>
          <li>Message the team directly in your project thread</li>
          <li>Manage your email notification preferences anytime</li>
        </ul>

        <p>If you have any questions, don't hesitate to reach out. We're here to help!</p>

        <p>Best regards,<br><strong>The Bothmade Team</strong></p>
      </div>
      <div class="footer">
        <p>&copy; 2026 Bothmade. All rights reserved.</p>
      </div>
    </div>
  </body>
</html>
  `;

  return sendEmail({
    to: clientEmail,
    subject: `Welcome to Bothmade – Your Project is Ready`,
    html,
  });
}

/**
 * Send status update email to client
 */
export async function sendStatusUpdateEmail(
  clientEmail: string,
  clientName: string,
  projectName: string,
  updateTitle: string,
  updateDescription: string,
  projectId: string
): Promise<boolean> {
  const dashboardUrl = `${SITE_URL}/client/${projectId}`;

  const html = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Project Update – ${projectName}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #333; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
      .header { background: #000; color: #fff; padding: 20px; border-radius: 8px 8px 0 0; }
      .content { background: #f9f9f9; padding: 40px 20px; border-radius: 0 0 8px 8px; }
      .update-box { background: #fff; border-left: 4px solid #000; padding: 20px; margin: 20px 0; }
      .button { display: inline-block; background: #000; color: #fff; padding: 12px 30px; text-decoration: none; border-radius: 4px; margin: 20px 0; }
      .footer { text-align: center; font-size: 12px; color: #999; margin-top: 20px; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h2 style="margin: 0;">${projectName}</h2>
        <p style="margin: 8px 0 0 0; opacity: 0.9;">Project Update</p>
      </div>
      <div class="content">
        <p>Hi ${clientName},</p>
        <p>We have a new update on your project!</p>

        <div class="update-box">
          <h3 style="margin-top: 0;">${updateTitle}</h3>
          <p>${updateDescription}</p>
        </div>

        <p>
          <a href="${dashboardUrl}" class="button">View in Dashboard</a>
        </p>

        <p>You can also reply directly in your project thread or adjust your notification preferences anytime.</p>

        <p>Best regards,<br><strong>The Bothmade Team</strong></p>
      </div>
      <div class="footer">
        <p>&copy; 2026 Bothmade. All rights reserved.</p>
      </div>
    </div>
  </body>
</html>
  `;

  return sendEmail({
    to: clientEmail,
    subject: `${projectName}: ${updateTitle}`,
    html,
  });
}

/**
 * Send new message notification email
 */
export async function sendMessageNotificationEmail(
  clientEmail: string,
  clientName: string,
  projectName: string,
  messagePreview: string,
  projectId: string
): Promise<boolean> {
  const dashboardUrl = `${SITE_URL}/client/${projectId}`;

  const html = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>New Message – ${projectName}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #333; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
      .header { background: #000; color: #fff; padding: 20px; border-radius: 8px 8px 0 0; }
      .content { background: #f9f9f9; padding: 40px 20px; border-radius: 0 0 8px 8px; }
      .message-box { background: #fff; border: 1px solid #ddd; padding: 20px; margin: 20px 0; border-radius: 4px; }
      .button { display: inline-block; background: #000; color: #fff; padding: 12px 30px; text-decoration: none; border-radius: 4px; margin: 20px 0; }
      .footer { text-align: center; font-size: 12px; color: #999; margin-top: 20px; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h2 style="margin: 0;">${projectName}</h2>
        <p style="margin: 8px 0 0 0; opacity: 0.9;">New Message from the Team</p>
      </div>
      <div class="content">
        <p>Hi ${clientName},</p>
        <p>You have a new message from the Bothmade team on your project.</p>

        <div class="message-box">
          <p>${messagePreview}</p>
        </div>

        <p>
          <a href="${dashboardUrl}" class="button">View Full Conversation</a>
        </p>

        <p>You can manage your notification preferences in your dashboard anytime.</p>

        <p>Best regards,<br><strong>The Bothmade Team</strong></p>
      </div>
      <div class="footer">
        <p>&copy; 2026 Bothmade. All rights reserved.</p>
      </div>
    </div>
  </body>
</html>
  `;

  return sendEmail({
    to: clientEmail,
    subject: `New message on ${projectName}`,
    html,
  });
}
