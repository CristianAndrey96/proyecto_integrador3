const Task = require('../models/Task');

exports.createTask = async (req, res) => {
    try {
        const { TaskId, Name, Deadline, AlarmTime, Description, Priority, Tags } = req.body;

        const task = new Task({
            TaskId,
            Name,
            Deadline,
            AlarmTime: AlarmTime || null,
            Description: Description || '',
            Priority: Priority || 'medium',
            Tags: Tags || [],
            Status: 'todo',
            Order: Date.now(),
            UserId: req.user.UserId
        });

        await task.save();
        res.status(201).json({ message: 'Tarea creada', task });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error creando tarea', error });
    }
};

exports.getAllTasks = (req, res) => {
    Task.find({ UserId: req.user.UserId })
        .sort({ Order: 1 })
        .then(data => res.status(200).json(data))
        .catch(err => {
            console.error(err);
            res.status(500).send('Internal error\n');
        });
};

exports.updateTask = async (req, res) => {
    try {
        const { TaskId, Name, Deadline, AlarmTime, Completed, Description, Priority, Tags, Status } = req.body;

        await Task.findOneAndUpdate(
            { TaskId, UserId: req.user.UserId },
            { Name, Deadline, AlarmTime: AlarmTime || null, Completed, Description, Priority, Tags, Status }
        );

        res.json({ message: 'Tarea actualizada' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error actualizando tarea', error });
    }
};

exports.completeTask = (req, res) => {
    Task.updateOne(
        { TaskId: req.body.TaskId, UserId: req.user.UserId },
        { Completed: true, Status: 'done' }
    )
        .then(() => res.status(200).json({ message: 'Tarea completada' }))
        .catch(err => {
            console.error(err);
            res.status(500).send('Internal error\n');
        });
};

exports.deleteTask = (req, res) => {
    Task.deleteOne({ TaskId: req.body.TaskId, UserId: req.user.UserId })
        .then(() => res.status(200).json({ message: 'Tarea eliminada' }))
        .catch(err => {
            console.error(err);
            res.status(500).send('Internal error\n');
        });
};

exports.moveTask = async (req, res) => {
    try {
        const { TaskId, Status } = req.body;
        const validStatuses = ['todo', 'in_progress', 'done'];

        if (!validStatuses.includes(Status)) {
            return res.status(400).json({ message: 'Estado inválido' });
        }

        const update = { Status };
        update.Completed = Status === 'done';

        await Task.findOneAndUpdate(
            { TaskId, UserId: req.user.UserId },
            update
        );

        res.json({ message: 'Tarea movida' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error moviendo tarea', error });
    }
};

exports.reorderTasks = async (req, res) => {
    try {
        const { tasks } = req.body;

        await Promise.all(
            tasks.map(({ TaskId, Order }) =>
                Task.findOneAndUpdate(
                    { TaskId, UserId: req.user.UserId },
                    { Order }
                )
            )
        );

        res.json({ message: 'Orden actualizado' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error reordenando tareas', error });
    }
};
