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
