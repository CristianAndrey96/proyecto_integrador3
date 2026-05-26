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
    CreatedAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('user', UserSchema, 'Users');
