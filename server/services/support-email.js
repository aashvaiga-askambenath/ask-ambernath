const nodemailer = require('nodemailer');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function createSupportMailer({ gmailUser, gmailAppPassword, transportFactory = nodemailer.createTransport }) {
  if (!gmailUser && !gmailAppPassword) return null;
  if (!gmailUser || !gmailAppPassword) {
    throw new Error('GMAIL_USER and GMAIL_APP_PASSWORD must be configured together');
  }

  const transport = transportFactory({
    service: 'gmail',
    auth: { user: gmailUser, pass: gmailAppPassword.replace(/\s+/g, '') },
  });

  return async (ticket, notificationType) => {
    const isStatusUpdate = notificationType === 'status_update';
    const title = isStatusUpdate
      ? `Update on support ticket ${ticket.ticket_number}`
      : `We received your support ticket ${ticket.ticket_number}`;
    const statusText = ticket.status.replaceAll('_', ' ');
    const text = [
      `Hello ${ticket.name},`,
      '',
      isStatusUpdate
        ? `The status of your Ask Ambernath support ticket is now: ${statusText}.`
        : 'We received your Ask Ambernath support request.',
      `Ticket number: ${ticket.ticket_number}`,
      `Subject: ${ticket.subject}`,
      '',
      `Your message: ${ticket.message}`,
      '',
      'Keep this email and ticket number for reference.',
    ].join('\n');
    const html = [
      `<p>Hello ${escapeHtml(ticket.name)},</p>`,
      `<p>${isStatusUpdate
        ? `The status of your Ask Ambernath support ticket is now <strong>${escapeHtml(statusText)}</strong>.`
        : 'We received your Ask Ambernath support request.'}</p>`,
      `<p><strong>Ticket number:</strong> ${escapeHtml(ticket.ticket_number)}<br>`,
      `<strong>Subject:</strong> ${escapeHtml(ticket.subject)}</p>`,
      `<p><strong>Your message:</strong><br>${escapeHtml(ticket.message).replace(/\r?\n/g, '<br>')}</p>`,
      '<p>Keep this email and ticket number for reference.</p>',
    ].join('');

    await transport.sendMail({
      from: { name: 'Ask Ambernath', address: gmailUser },
      to: ticket.email,
      subject: title,
      text,
      html,
    });
  };
}

module.exports = { createSupportMailer };
