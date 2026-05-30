const mongoose = require('mongoose');

const TaskSchema = new mongoose.Schema({
    TaskId: {
        type: Number,
        required: true
    },
    Name: {
        type: String,
        required: true
    },
    Description: {
        type: String,
        default: ''
    },
    Deadline: {
        type: Date,
        default: Date.now
    },
    UserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
        required: false
    },
    Completed: {
        type: Boolean,
        default: false
    },
    AlarmTime: {
        type: Date,
        required: false,
        default: null
    },
    // ── Nuevos campos Kanban ──────────────────────────────────
    Status: {
        type: String,
        enum: ['todo', 'in_progress', 'done'],
        default: 'todo'
    },
    Priority: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'medium'
    },
    Tags: {
        type: [String],
        default: []
    },
    Order: {
        type: Number,
        default: 0
    }
});

module.exports = mongoose.model('task', TaskSchema, 'Tasks');
