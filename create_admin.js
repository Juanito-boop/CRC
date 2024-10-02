const { Pool } = require('pg'); // Importa el módulo pg para PostgreSQL
const bcrypt = require('bcrypt'); // Importa bcrypt para el hash de contraseñas
const config = require('./config'); // Importa la configuración de la base de datos

// Crea un pool de conexiones a la base de datos
const pool = new Pool(config);

// Conecta a la base de datos
pool.connect(err => {
    if (err) {
        console.error('Error connecting to the database:', err.stack);
        return;
    }
    console.log('Connected to the PostgreSQL database'); // Confirmación de conexión exitosa

    const nombre = 'Administrador Paula'; // Nombre del nuevo administrador
    const email = 'paula@outlook.com'; // Email del nuevo administrador
    const contraseña = 'Paula@1234'; // Contraseña del nuevo administrador

    // Genera un hash de la contraseña utilizando bcrypt
    bcrypt.hash(contraseña, 10, (err, hashedPassword) => {
        if (err) {
            console.error('Error hashing the password:', err);
            return;
        }

        // Query para insertar el nuevo administrador en la tabla 'usuarios'
        const query = 'INSERT INTO usuarios (nombre, email, contraseña, is_admin) VALUES ($1, $2, $3, $4)';
        const values = [nombre, email, hashedPassword, true]; // Valores a insertar

        // Ejecuta la consulta SQL para insertar el nuevo administrador
        pool.query(query, values, (err, result) => {
            if (err) {
                console.error('Error inserting the admin user:', err);
                return;
            }
            console.log('Admin user created successfully'); // Confirmación de creación del administrador
            pool.end(); // Cierra la conexión a la base de datos
        });
    });
});
