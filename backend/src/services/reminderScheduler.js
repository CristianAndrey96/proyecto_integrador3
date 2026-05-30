const cron = require('node-cron');
const Task = require('../models/Task');
const User = require('../models/User');
const { sendReminderEmail } = require('./emailService');

// Guardamos qué recordatorios ya se enviaron en esta sesión de servidor
const sentReminders = new Set();

function getReminderKey(taskId, type) {
    return `${taskId}:${type}`;
}

async function checkAndSendReminders() {
    try {
        const now = new Date();

        // Buscar tareas no completadas con deadline en las próximas 25h
        const upcoming = await Task.find({
            Completed: false,
            Deadline: {
                $gte: now,
                $lte: new Date(now.getTime() + 25 * 60 * 60 * 1000)
            }
        });

        for (const task of upcoming) {
            const msLeft = new Date(task.Deadline) - now;
            const hoursLeft = msLeft / (1000 * 60 * 60);

            // Determinar qué tipo de recordatorio aplica (24h o 1h)
            let reminderType = null;
            if (hoursLeft <= 25 && hoursLeft > 2) reminderType = '24h';
            else if (hoursLeft <= 2 && hoursLeft > 0) reminderType = '1h';

            if (!reminderType) continue;

            const key = getReminderKey(task._id.toString(), reminderType);
            if (sentReminders.has(key)) continue;

            const user = await User.findById(task.UserId);
            if (!user || !user.Email || !user.EmailReminders) continue;

            const sent = await sendReminderEmail({
                to: user.Email,
                username: user.Username,
                taskName: task.Name,
                deadline: task.Deadline,
                hoursLeft: Math.ceil(hoursLeft)
            });

            if (sent) {
                sentReminders.add(key);
                console.log(`Recordatorio ${reminderType} enviado a ${user.Email} para tarea "${task.Name}"`);
            }
        }
    } catch (err) {
        console.error('Error en scheduler de recordatorios:', err.message);
    }
}

function startReminderScheduler() {
    // Ejecutar cada 30 minutos
    cron.schedule('*/30 * * * *', checkAndSendReminders);
    console.log('Scheduler de recordatorios por email iniciado (cada 30 min)');
}

module.exports = { startReminderScheduler };
