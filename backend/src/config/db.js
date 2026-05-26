const mongoose = require('mongoose');

const DBMONGOUSER = process.env.DBMONGOUSER;
const DBMONGOPASS = process.env.DBMONGOPASS;
const DBMONGOSERV = process.env.DBMONGOSERV;
const DBMONGO = process.env.DBMONGO;

const dbUri = `mongodb+srv://${DBMONGOUSER}:${DBMONGOPASS}@${DBMONGOSERV}/${DBMONGO}?retryWrites=true&w=majority`;

mongoose.Promise = global.Promise;

const connectDB = () => {
    return mongoose.connect(dbUri)
        .then(() => {
            console.log('Conexión a la base de datos exitosa');
        })
        .catch((err) => {
            console.error('Error al conectar a la base de datos', err);
            process.exit(1);
        });
};

module.exports = connectDB;
