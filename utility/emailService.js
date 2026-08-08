import nodemailer from 'nodemailer';

// Create reusable transporter object using SMTP transport
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });
};

/**
 * Send email notification
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @param {string} options.text - Plain text content (optional)
 * @returns {Promise<Object>} - Result object with success status
 */
export const sendEmail = async ({ to, subject, html, text }) => {
  try {
    if (!to || !subject || !html) {
      throw new Error('Missing required email fields: to, subject, html');
    }

    const transporter = createTransporter();

    const mailOptions = {
      from: `"${process.env.SMTP_FROM_NAME || 'Notification System'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      to: to,
      subject: subject,
      html: html,
      text: text || html.replace(/<[^>]*>/g, ''), // Strip HTML tags for text version
    };

    const info = await transporter.sendMail(mailOptions);
    

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Get user email from Firebase Admin Auth
 * @param {Object} admin - Firebase Admin instance
 * @param {string} uid - User UID
 * @returns {Promise<string|null>} - User email or null
 */
export const getUserEmail = async (admin, uid) => {
  try {
    if (!uid) return null;
    
    const userRecord = await admin.auth().getUser(uid);
    return userRecord.email || null;
  } catch (error) {
    return null;
  }
};

/**
 * Send notification email for issue
 * @param {Object} options - Notification options
 * @param {string} options.userEmail - Recipient email
 * @param {string} options.userName - Recipient name
 * @param {string} options.issueNo - Issue number
 * @param {string} options.issueTitle - Issue title
 * @param {string} options.actionType - Action type (create, update, status_change, etc.)
 * @param {string} options.actionByName - Name of person who performed action
 * @param {string} options.projectName - Project name
 * @param {string} options.issueDescription - Issue description
 * @param {string} options.actionDetails - Additional action details
 * @returns {Promise<Object>} - Result object
 */
export const sendIssueNotificationEmail = async ({
  userEmail,
  userName,
  issueNo,
  issueTitle,
  actionType,
  actionByName,
  projectName,
  issueDescription,
  actionDetails,
  issueKey,
  notificationNumber,
}) => {
  if (!userEmail) {
    return { success: false, error: 'User email not found' };
  }

  // Get frontend URL from environment or use default
  const frontendUrl = process.env.FRONTEND_URL_KEY || 'http://localhost:8080';
  const issueUrl = `${frontendUrl}/backlog-canvas?key=${issueKey || ''}`;

  let subject = '';
  let actionText = '';

  switch (actionType) {
    case 'create':
      subject = `New Issue Assigned: #${issueNo}`;
      actionText = 'assigned you a new issue';
      break;
    case 'status_change':
      subject = `Issue Status Changed: #${issueNo}`;
      actionText = `changed the status${actionDetails?.oldStatus && actionDetails?.newStatus ? ` from "${actionDetails.oldStatus}" to "${actionDetails.newStatus}"` : ''}`;
      break;
    case 'type_change':
      subject = `Issue Type Changed: #${issueNo}`;
      actionText = `changed the type${actionDetails?.oldType && actionDetails?.newType ? ` from "${actionDetails.oldType}" to "${actionDetails.newType}"` : ''}`;
      break;
    case 'forward':
      subject = `Issue Forwarded: #${issueNo}`;
      actionText = 'forwarded an issue to you';
      break;
    case 'close_send':
      subject = `Issue Closed and Sent: #${issueNo}`;
      actionText = 'closed and sent an issue to you';
      break;
    case 'comment':
      subject = `New Comment on Issue: #${issueNo}`;
      actionText = 'commented on an issue';
      break;
    case 'update':
      subject = `Issue Updated: #${issueNo}`;
      actionText = 'updated an issue';
      break;
    default:
      subject = `Issue Notification: #${issueNo}`;
      actionText = 'performed an action on an issue';
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          background-color: #f4f4f4;
          padding: 20px;
        }
        .email-container {
          max-width: 600px;
          margin: 0 auto;
          background-color: #ffffff;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .header {
          background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%);
          color: white;
          padding: 30px 20px;
          text-align: center;
        }
        .header h1 {
          font-size: 24px;
          font-weight: 600;
          margin: 0;
        }
        .notification-badge {
          display: inline-block;
          background-color: rgba(255,255,255,0.2);
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 12px;
          margin-top: 10px;
          font-weight: 500;
        }
        .content {
          padding: 30px 20px;
        }
        .greeting {
          font-size: 16px;
          color: #333;
          margin-bottom: 15px;
        }
        .action-text {
          font-size: 15px;
          color: #666;
          margin-bottom: 25px;
          line-height: 1.8;
        }
        .action-text strong {
          color: #1890ff;
          font-weight: 600;
        }
        .issue-card {
          background: linear-gradient(135deg, #f0f7ff 0%, #e6f4ff 100%);
          border-left: 4px solid #1890ff;
          padding: 20px;
          margin: 20px 0;
          border-radius: 6px;
        }
        .issue-card h3 {
          color: #1890ff;
          font-size: 18px;
          margin-bottom: 15px;
          font-weight: 600;
        }
        .issue-card p {
          margin: 8px 0;
          color: #555;
          font-size: 14px;
        }
        .issue-card strong {
          color: #333;
          font-weight: 600;
        }
        .button-container {
          text-align: center;
          margin: 30px 0;
        }
        .button {
          display: inline-block;
          padding: 14px 32px;
          background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%);
          color: white;
          text-decoration: none;
          border-radius: 6px;
          font-weight: 600;
          font-size: 15px;
          box-shadow: 0 4px 12px rgba(24, 144, 255, 0.3);
          transition: all 0.3s ease;
        }
        .button:hover {
          box-shadow: 0 6px 16px rgba(24, 144, 255, 0.4);
          transform: translateY(-2px);
        }
        .footer {
          background-color: #fafafa;
          padding: 20px;
          text-align: center;
          border-top: 1px solid #e8e8e8;
          font-size: 12px;
          color: #999;
        }
        .footer p {
          margin: 5px 0;
        }
        .notification-number {
          color: #1890ff;
          font-weight: 600;
        }
      </style>
    </head>
    <body>
      <div class="email-container">
        <div class="header">
          <h1>${subject}</h1>
          ${notificationNumber ? `<span class="notification-badge">Notification #${notificationNumber}</span>` : ''}
        </div>
        <div class="content">
          <p class="greeting">Hello ${userName || 'User'},</p>
          <p class="action-text"><strong>${actionByName || 'Someone'}</strong> ${actionText}.</p>
          
          <div class="issue-card">
            <h3>Issue #${issueNo}</h3>
            ${issueTitle ? `<p><strong>Title:</strong> ${issueTitle}</p>` : ''}
            ${projectName ? `<p><strong>Project:</strong> ${projectName}</p>` : ''}
            ${issueDescription ? `<p><strong>Description:</strong> ${issueDescription.substring(0, 200)}${issueDescription.length > 200 ? '...' : ''}</p>` : ''}
            ${notificationNumber ? `<p><strong>Notification Number:</strong> <span class="notification-number">#${notificationNumber}</span></p>` : ''}
          </div>
          
          <div class="button-container">
            <a href="${issueUrl}" class="button">View Issue</a>
          </div>
          
          <p style="text-align: center; color: #999; font-size: 13px; margin-top: 20px;">
            Click the button above to view and respond to this issue.
          </p>
        </div>
        <div class="footer">
          <p>This is an automated notification from your project management system.</p>
          <p>Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return await sendEmail({
    to: userEmail,
    subject: subject,
    html: html,
  });
};

/**
 * Send notification email for pull request
 * @param {Object} options - Notification options
 * @param {string} options.userEmail - Recipient email
 * @param {string} options.userName - Recipient name
 * @param {number} options.prNumber - Pull request number
 * @param {string} options.prTitle - Pull request title
 * @param {string} options.createdByName - Name of person who created PR
 * @param {string} options.projectName - Project name
 * @param {string} options.repoFullName - Repository full name
 * @param {string} options.compareRepoFullName - Compare repository full name
 * @param {string} options.prBody - Pull request body
 * @returns {Promise<Object>} - Result object
 */
export const sendPullRequestNotificationEmail = async ({
  userEmail,
  userName,
  prNumber,
  prTitle,
  createdByName,
  projectName,
  repoFullName,
  compareRepoFullName,
  prBody,
  notificationNumber,
  pullRequestId,
}) => {
  if (!userEmail) {
    return { success: false, error: 'User email not found' };
  }

  // Get frontend URL from environment or use default
  const frontendUrl = process.env.FRONTEND_URL_KEY || 'http://localhost:8080';
  const prUrl = `${frontendUrl}/crd-tree`;

  const subject = `New Pull Request: ${prTitle || `PR #${prNumber}`}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          background-color: #f4f4f4;
          padding: 20px;
        }
        .email-container {
          max-width: 600px;
          margin: 0 auto;
          background-color: #ffffff;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .header {
          background: linear-gradient(135deg, #52c41a 0%, #389e0d 100%);
          color: white;
          padding: 30px 20px;
          text-align: center;
        }
        .header h1 {
          font-size: 24px;
          font-weight: 600;
          margin: 0;
        }
        .notification-badge {
          display: inline-block;
          background-color: rgba(255,255,255,0.2);
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 12px;
          margin-top: 10px;
          font-weight: 500;
        }
        .content {
          padding: 30px 20px;
        }
        .greeting {
          font-size: 16px;
          color: #333;
          margin-bottom: 15px;
        }
        .action-text {
          font-size: 15px;
          color: #666;
          margin-bottom: 25px;
          line-height: 1.8;
        }
        .action-text strong {
          color: #52c41a;
          font-weight: 600;
        }
        .pr-card {
          background: linear-gradient(135deg, #f6ffed 0%, #d9f7be 100%);
          border-left: 4px solid #52c41a;
          padding: 20px;
          margin: 20px 0;
          border-radius: 6px;
        }
        .pr-card h3 {
          color: #52c41a;
          font-size: 18px;
          margin-bottom: 15px;
          font-weight: 600;
        }
        .pr-card p {
          margin: 8px 0;
          color: #555;
          font-size: 14px;
        }
        .pr-card strong {
          color: #333;
          font-weight: 600;
        }
        .button-container {
          text-align: center;
          margin: 30px 0;
        }
        .button {
          display: inline-block;
          padding: 14px 32px;
          background: linear-gradient(135deg, #52c41a 0%, #389e0d 100%);
          color: white;
          text-decoration: none;
          border-radius: 6px;
          font-weight: 600;
          font-size: 15px;
          box-shadow: 0 4px 12px rgba(82, 196, 26, 0.3);
          transition: all 0.3s ease;
        }
        .button:hover {
          box-shadow: 0 6px 16px rgba(82, 196, 26, 0.4);
          transform: translateY(-2px);
        }
        .footer {
          background-color: #fafafa;
          padding: 20px;
          text-align: center;
          border-top: 1px solid #e8e8e8;
          font-size: 12px;
          color: #999;
        }
        .footer p {
          margin: 5px 0;
        }
        .notification-number {
          color: #52c41a;
          font-weight: 600;
        }
      </style>
    </head>
    <body>
      <div class="email-container">
        <div class="header">
          <h1>${subject}</h1>
          ${notificationNumber ? `<span class="notification-badge">Notification #${notificationNumber}</span>` : ''}
        </div>
        <div class="content">
          <p class="greeting">Hello ${userName || 'User'},</p>
          <p class="action-text"><strong>${createdByName || 'Someone'}</strong> created a new pull request.</p>
          
          <div class="pr-card">
            <h3>Pull Request #${prNumber}</h3>
            <p><strong>Title:</strong> ${prTitle || 'N/A'}</p>
            ${projectName ? `<p><strong>Project:</strong> ${projectName}</p>` : ''}
            <p><strong>Repository:</strong> ${repoFullName || 'N/A'}</p>
            ${compareRepoFullName ? `<p><strong>Compare Repository:</strong> ${compareRepoFullName}</p>` : ''}
            ${prBody ? `<p><strong>Description:</strong> ${prBody.substring(0, 200)}${prBody.length > 200 ? '...' : ''}</p>` : ''}
            ${notificationNumber ? `<p><strong>Notification Number:</strong> <span class="notification-number">#${notificationNumber}</span></p>` : ''}
          </div>
          
          <div class="button-container">
            <a href="${prUrl}" class="button">View Pull Request</a>
          </div>
          
          <p style="text-align: center; color: #999; font-size: 13px; margin-top: 20px;">
            Click the button above to view and review this pull request.
          </p>
        </div>
        <div class="footer">
          <p>This is an automated notification from your project management system.</p>
          <p>Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return await sendEmail({
    to: userEmail,
    subject: subject,
    html: html,
  });
};

