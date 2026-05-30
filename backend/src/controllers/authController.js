const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'todo_super_secret_key_12345';

exports.register = async (req, res) => {
    try {
        let username = req.body.Username;
        let password = req.body.Password;
        let email = req.body.Email || null;

        if (!username || !password) {
            return res.status(400).json({ message: 'Usuario y contraseña son requeridos' });
        }

        username = username.trim().toLowerCase();
        if (email) email = email.trim().toLowerCase();

        const existingUser = await User.findOne({ Username: username });
        if (existingUser) {
            return res.status(400).json({ message: 'El nombre de usuario ya está registrado' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new User({
            Username: username,
            Password: hashedPassword,
            Email: email
        });

        await newUser.save();
        res.status(201).json({ message: 'Usuario registrado exitosamente' });
    } catch (err) {
        console.error('Error en registro:', err);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
};

exports.login = async (req, res) => {
    try {
        let username = req.body.Username;
        let password = req.body.Password;

        if (!username || !password) {
            return res.status(400).json({ message: 'Usuario y contraseña son requeridos' });
        }

        username = username.trim().toLowerCase();

        const user = await User.findOne({ Username: username });
        if (!user) {
            return res.status(400).json({ message: 'Credenciales inválidas' });
        }

        const isMatch = await bcrypt.compare(password, user.Password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Credenciales inválidas' });
        }

        const token = jwt.sign(
            { UserId: user._id, Username: user.Username },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.status(200).json({
            message: 'Inicio de sesión exitoso',
            token,
            user: {
                UserId: user._id,
                Username: user.Username,
                Email: user.Email,
                EmailReminders: user.EmailReminders
            }
        });
    } catch (err) {
        console.error('Error en login:', err);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const { Email, EmailReminders } = req.body;
        const update = {};
        if (Email !== undefined) update.Email = Email ? Email.trim().toLowerCase() : null;
        if (EmailReminders !== undefined) update.EmailReminders = Boolean(EmailReminders);

        if (Object.keys(update).length === 0) {
            return res.status(400).json({ message: 'No hay datos para actualizar' });
        }

        const user = await User.findByIdAndUpdate(
            req.user.UserId,
            { $set: update },
            { new: true, runValidators: false }
        );

        if (!user) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }

        res.json({
            message: 'Perfil actualizado',
            user: {
                UserId: user._id,
                Username: user.Username,
                Email: user.Email,
                EmailReminders: user.EmailReminders
            }
        });
    } catch (err) {
        console.error('Error actualizando perfil:', err);
        res.status(500).json({ message: 'Error interno del servidor: ' + err.message });
    }
};
