const Task = require('../models/Task');

// Crear tarea
exports.createTask = (req, res) => {
    let task_id = req.body.TaskId;
    let name = req.body.Name;
    let deadline = req.body.Deadline;
    let alarmTime = req.body.AlarmTime || null;

    let taskData = {
        TaskId: task_id,
        Name: name,
        Deadline: deadline,
        AlarmTime: alarmTime,
        Completed: false,
        UserId: req.user.UserId
    };

    var newTask = new Task(taskData);

    newTask.save()
        .then(data => {
            res.status(200).send("OK\n");
        })
        .catch(err => {
            console.log(err);
            res.status(500).send("Internal error\n");
        });
};

// Obtener todas las tareas del usuario
exports.getAllTasks = (req, res) => {
    Task.find({ UserId: req.user.UserId })
        .then(data => {
            res.status(200).send(data);
        })
        .catch(err => {
            console.log(err);
            res.status(500).send("Internal error\n");
        });
};

// Actualizar tarea
exports.updateTask = (req, res) => {
    const taskUpdates = {
        Name: req.body.Name,
        Deadline: req.body.Deadline,
        AlarmTime: req.body.AlarmTime || null
    };

    if (req.body.Completed !== undefined) {
        taskUpdates.Completed = Boolean(req.body.Completed);
    }

    Task.updateOne(
        { TaskId: req.body.TaskId, UserId: req.user.UserId, Completed: { $ne: true } },
        taskUpdates
    )
        .then(data => {
            res.status(200).send("OK\n");
        })
        .catch(err => {
            console.log(err);
            res.status(500).send("Internal error\n");
        });
};

// Marcar tarea como completada
exports.completeTask = (req, res) => {
    Task.updateOne(
        { TaskId: req.body.TaskId, UserId: req.user.UserId },
        { Completed: true }
    )
        .then(data => {
            res.status(200).send("OK\n");
        })
        .catch(err => {
            console.log(err);
            res.status(500).send("Internal error\n");
        });
};

// Eliminar tarea
exports.deleteTask = (req, res) => {
    Task.deleteOne({ TaskId: req.body.TaskId, UserId: req.user.UserId })
        .then(data => {
            res.status(200).send("OK\n");
        })
        .catch(err => {
            console.log(err);
            res.status(500).send("Internal error\n");
        });
};

exports.moveTask = async (req, res) => {
    try {
        const { TaskId, Status } = req.body;
        const validStatuses = ['todo', 'in_progress', 'done'];
 
        if (!validStatuses.includes(Status)) {
            return res.status(400).json({ message: 'Estado inválido' });
        }
 
        // Si se mueve a "done", también marca Completed = true
        const update = { Status };
        if (Status === 'done')       update.Completed = true;
        if (Status !== 'done')       update.Completed = false;
 
        await Task.findOneAndUpdate(
            { TaskId, UserId: req.user.id },
            update
        );
 
        res.json({ message: 'Tarea movida' });
    } catch (error) {
        res.status(500).json({ message: 'Error moviendo tarea', error });
    }
};
 
// reorderTasks — recibe array [{ TaskId, Order }]
exports.reorderTasks = async (req, res) => {
    try {
        const { tasks } = req.body; // [{ TaskId, Order }]
 
        await Promise.all(
            tasks.map(({ TaskId, Order }) =>
                Task.findOneAndUpdate(
                    { TaskId, UserId: req.user.id },
                    { Order }
                )
            )
        );
 
        res.json({ message: 'Orden actualizado' });
    } catch (error) {
        res.status(500).json({ message: 'Error reordenando tareas', error });
    }
};
 
// updateTask — REEMPLAZA el tuyo existente para incluir los nuevos campos
exports.updateTask = async (req, res) => {
    try {
        const { TaskId, Name, Deadline, AlarmTime, Completed,
                Description, Priority, Tags, Status } = req.body;
 
        await Task.findOneAndUpdate(
            { TaskId, UserId: req.user.id },
            { Name, Deadline, AlarmTime, Completed,
              Description, Priority, Tags, Status }
        );
 
        res.json({ message: 'Tarea actualizada' });
    } catch (error) {
        res.status(500).json({ message: 'Error actualizando tarea', error });
    }
};
 
// createTask — REEMPLAZA el tuyo existente para incluir los nuevos campos
exports.createTask = async (req, res) => {
    try {
        const { TaskId, Name, Deadline, AlarmTime,
                Description, Priority, Tags } = req.body;
 
        const task = new Task({
            TaskId,
            Name,
            Deadline,
            AlarmTime,
            Description: Description || '',
            Priority: Priority || 'medium',
            Tags: Tags || [],
            Status: 'todo',
            Order: Date.now(),
            UserId: req.user.id
        });
 
        await task.save();
        res.status(201).json({ message: 'Tarea creada', task });
    } catch (error) {
        res.status(500).json({ message: 'Error creando tarea', error });
    }
};