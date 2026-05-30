const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    Username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    Password: {
        type: String,
        required: true
    },
    Email: {
        type: String,
        default: null,
        trim: true,
        lowercase: true
    },
    EmailReminders: {
        type: Boolean,
        default: true
    },
    CreatedAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('user', UserSchema, 'Users');
