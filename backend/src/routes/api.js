const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const taskController = require('../controllers/taskController');
const authenticateToken = require('../middlewares/auth');

// Rutas de autenticación
router.post('/register', authController.register);
router.post('/login', authController.login);

// Rutas de tareas (Protegidas)
router.post('/create-task', authenticateToken, taskController.createTask);
router.get('/all-tasks', authenticateToken, taskController.getAllTasks);
router.put('/update-task', authenticateToken, taskController.updateTask);
router.put('/complete-task', authenticateToken, taskController.completeTask);
router.delete('/delete-task', authenticateToken, taskController.deleteTask);

module.exports = router;
