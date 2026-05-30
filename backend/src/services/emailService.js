const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
    if (transporter) return transporter;

    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) return null;

    transporter = nodemailer.createTransport({
        host,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user, pass }
    });

    return transporter;
}

async function sendReminderEmail({ to, username, taskName, deadline, hoursLeft }) {
    const transport = getTransporter();
    if (!transport) return false;

    const fromName = process.env.SMTP_FROM_NAME || 'Taskerly';
    const fromEmail = process.env.SMTP_USER;

    const deadlineStr = new Date(deadline).toLocaleString('es', {
        dateStyle: 'long',
        timeStyle: 'short'
    });

    const subject = hoursLeft <= 1
        ? `⚠️ Tarea vence en menos de 1 hora: ${taskName}`
        : `🔔 Recordatorio: "${taskName}" vence en ${hoursLeft}h`;

    const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #f8fafc; border-radius: 12px; overflow: hidden;">
      <div style="background: #2563eb; padding: 28px 32px; text-align: center;">
        <h1 style="color: #fff; margin: 0; font-size: 22px; font-weight: 700;">📋 Taskerly</h1>
        <p style="color: #bfdbfe; margin: 6px 0 0; font-size: 14px;">Recordatorio de tarea</p>
      </div>
      <div style="padding: 28px 32px;">
        <p style="color: #334155; font-size: 16px; margin-bottom: 18px;">Hola <strong>${username}</strong>,</p>
        <div style="background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; margin-bottom: 20px;">
          <p style="margin: 0 0 8px; color: #64748b; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Tarea pendiente</p>
          <p style="margin: 0; color: #1e293b; font-size: 18px; font-weight: 700;">${taskName}</p>
          <p style="margin: 10px 0 0; color: #64748b; font-size: 14px;">📅 Fecha límite: <strong style="color: #dc2626;">${deadlineStr}</strong></p>
          ${hoursLeft <= 24 ? `<p style="margin: 6px 0 0; font-size: 14px; color: ${hoursLeft <= 1 ? '#dc2626' : '#d97706'}; font-weight: 600;">⏰ Quedan aproximadamente ${hoursLeft <= 1 ? 'menos de 1 hora' : hoursLeft + ' horas'}</p>` : ''}
        </div>
        <p style="color: #64748b; font-size: 14px;">Ingresa a Taskerly para gestionar tus tareas y marcarla como completada.</p>
      </div>
      <div style="background: #f1f5f9; padding: 16px 32px; text-align: center;">
        <p style="color: #94a3b8; font-size: 12px; margin: 0;">Taskerly · Gestor de tareas · Este correo es automático, no respondas.</p>
      </div>
    </div>`;

    try {
        await transport.sendMail({
            from: `"${fromName}" <${fromEmail}>`,
            to,
            subject,
            html
        });
        return true;
    } catch (err) {
        console.error('Error enviando email:', err.message);
        return false;
    }
}

module.exports = { sendReminderEmail };
