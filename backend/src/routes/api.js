const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const taskController = require('../controllers/taskController');
const authenticateToken = require('../middlewares/auth');

// Autenticación
router.post('/register', authController.register);
router.post('/login', authController.login);
router.put('/update-profile', authenticateToken, authController.updateProfile);

// Tareas
router.post('/create-task', authenticateToken, taskController.createTask);
router.get('/all-tasks', authenticateToken, taskController.getAllTasks);
router.put('/update-task', authenticateToken, taskController.updateTask);
router.put('/complete-task', authenticateToken, taskController.completeTask);
router.delete('/delete-task', authenticateToken, taskController.deleteTask);

// Kanban
router.put('/move-task', authenticateToken, taskController.moveTask);
router.put('/reorder-tasks', authenticateToken, taskController.reorderTasks);

module.exports = router;
