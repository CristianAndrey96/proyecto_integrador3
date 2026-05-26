const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');

// 1. Cargar variables de entorno al inicio
if (!process.env.ON_RENDER) {
    console.log("Cargando variables de entorno desde archivo");
    const env = require('node-env-file');
    env(path.join(__dirname, '.env'));
}

// 2. Conectar a la base de datos
const connectDB = require('./src/config/db');
connectDB();

const api = require('./src/routes/api');
const port = process.env.PORT || 3000;
const app = express();

// 3. Middlewares
app.use(bodyParser.json());

// 4. Permitir peticiones desde el frontend separado
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173,http://127.0.0.1:5173,http://[::1]:5173')
    .split(',')
    .map(origin => origin.trim());

app.use((req, res, next) => {
    const origin = req.headers.origin;
    const isLocalDevOrigin = origin && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);

    if (origin && (allowedOrigins.includes(origin) || isLocalDevOrigin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }

    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }

    next();
});

// 5. Enrutador de la API
app.use('/api', api);

app.get('/', (req, res) => {
    res.send('Backend corriendo');
});

// 6. Arrancar servidor
app.listen(port, function () {
    console.log("Server is listening at port: " + port);
});
