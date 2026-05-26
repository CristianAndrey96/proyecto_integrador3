const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'todo_super_secret_key_12345';

// Registro de usuario
exports.register = async (req, res) => {
    try {
        let username = req.body.Username;
        let password = req.body.Password;

        if (!username || !password) {
            return res.status(400).json({ message: 'Usuario y contraseña son requeridos' });
        }

        username = username.trim().toLowerCase();

        // Verificar si el usuario ya existe
        const existingUser = await User.findOne({ Username: username });
        if (existingUser) {
            return res.status(400).json({ message: 'El nombre de usuario ya está registrado' });
        }

        // Cifrar la contraseña
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new User({
            Username: username,
            Password: hashedPassword
        });

        await newUser.save();
        res.status(201).json({ message: 'Usuario registrado exitosamente' });
    } catch (err) {
        console.error('Error en registro:', err);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
};

// Inicio de sesión
exports.login = async (req, res) => {
    try {
        let username = req.body.Username;
        let password = req.body.Password;

        if (!username || !password) {
            return res.status(400).json({ message: 'Usuario y contraseña son requeridos' });
        }

        username = username.trim().toLowerCase();

        // Buscar al usuario
        const user = await User.findOne({ Username: username });
        if (!user) {
            return res.status(400).json({ message: 'Credenciales inválidas' });
        }

        // Verificar la contraseña
        const isMatch = await bcrypt.compare(password, user.Password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Credenciales inválidas' });
        }

        // Generar JWT
        const token = jwt.sign(
            { UserId: user._id, Username: user.Username },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.status(200).json({
            message: 'Inicio de sesión exitoso',
            token: token,
            user: {
                UserId: user._id,
                Username: user.Username
            }
        });
    } catch (err) {
        console.error('Error en login:', err);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
};
