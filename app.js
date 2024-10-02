const express = require('express'); // Importa el módulo express
const { Pool } = require('pg'); // Importa el módulo pg para PostgreSQL
const path = require('path'); // Importa el módulo path
const bodyParser = require('body-parser'); // Importa el módulo body-parser
const session = require('express-session'); // Importa el módulo express-session
const bcrypt = require('bcrypt'); // Importa el módulo bcrypt para hashing de contraseñas
const config = require('./config'); // Importa el archivo config.js para las credenciales de la base de datos

const app = express(); // Crea una instancia de express

const pool = new Pool(config); // Crea un pool de conexiones usando la configuración de Supabase

pool.connect(err => { // Conecta a la base de datos
    if (err) {
        console.error('Error connecting to the PostgreSQL database:', err.stack);
        return;
    }
    console.log('Connected to the PostgreSQL database'); // Mensaje de confirmación de conexión exitosa
});

app.set('view engine', 'ejs'); // Configura el motor de plantillas a EJS
app.set('views', path.join(__dirname, 'views')); // Configura la ruta de las vistas

app.use(bodyParser.urlencoded({ extended: false })); // Configura el body-parser para analizar datos URL-encoded
app.use(express.static(path.join(__dirname, 'public'))); // Configura la carpeta de archivos estáticos

app.use(session({ // Configura las sesiones
    secret: 'your_secret_key', // Llave secreta para firmar la sesión
    resave: false, // No guarda la sesión si no hay cambios
    saveUninitialized: true // Guarda una sesión nueva y vacía
}));
app.get('/historial/:id', async (req, res) => {
    const pqrssiId = req.params.id; // Obtiene el ID de la PQRSSI de los parámetros de la URL

    try {
        // Consulta el historial de la PQRSSI
        const result = await pool.query('SELECT * FROM historial WHERE pqrssi_id = $1 ORDER BY fecha ASC', [pqrssiId]); 
        const historial = result.rows;

        if (historial.length > 0) {
            res.render('historial', { historial }); // Renderiza la vista historial con los datos obtenidos
        } else {
            res.status(404).send('Historial no encontrado'); // Manejo de caso en que no hay historial
        }
    } catch (error) {
        console.error('Error al obtener el historial:', error);
        res.status(500).send('Error en el servidor'); // Manejo de errores
    }
});


// Ruta principal
app.get('/', (req, res) => {
    res.render('index', { nombre: req.session.nombre, isAdmin: req.session.isAdmin }); // Renderiza la vista index y pasa el nombre de usuario de la sesión
});

// Ruta de registro
app.get('/register', (req, res) => {
    res.render('register'); // Renderiza la vista de registro
});

app.post('/register', async (req, res) => {
    const { nombre, email, contraseña } = req.body; // Obtiene los datos del formulario
    const hashedPassword = await bcrypt.hash(contraseña, 10); // Hashea la contraseña

    var contraseñaRegex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*()+,.?":{}|<>]).{8,}$/;

    if (!contraseñaRegex.test(contraseña)) {
        return res.send("La contraseña debe tener al menos 8 caracteres y contener al menos una letra mayúscula, una letra minúscula, un número y un carácter especial.")
    } else {
        pool.query('SELECT * FROM usuarios WHERE email = $1', [email], (err, results) => {
            if (err) throw err;
            if (results.rows.length > 0) {
                return res.send('El email ya está registrado'); // Si el email ya existe, envía un mensaje
            } else {
                pool.query('INSERT INTO usuarios (nombre, email, contraseña) VALUES ($1, $2, $3) RETURNING id',
                    [nombre, email, hashedPassword],
                    (err, result) => {
                        if (err) throw err;
                        res.redirect('/login'); // Redirige a la página de login
                    });
            }
        });
    }
});

// Ruta de inicio de sesión
app.get('/login', (req, res) => {
    res.render('login'); // Renderiza la vista de login
});

app.post('/login', (req, res) => {
    const { email, contraseña } = req.body; // Obtiene los datos del formulario
    pool.query('SELECT * FROM usuarios WHERE email = $1', [email], async (err, results) => {
        if (err) throw err;
        if (results.rows.length > 0) {
            const user = results.rows[0];
            if (await bcrypt.compare(contraseña, user.contraseña)) { // Compara la contraseña hasheada
                req.session.loggedin = true; // Marca la sesión como iniciada
                req.session.nombre = user.nombre; // Guarda el nombre del usuario en la sesión
                req.session.userId = user.id; // Guarda el ID del usuario en la sesión
                req.session.isAdmin = user.is_admin; // Guarda si el usuario es administrador en la sesión
                res.redirect('/'); // Redirige a la página principal
            } else {
                res.send('Contraseña incorrecta!'); // Si la contraseña es incorrecta, envía un mensaje
            }
        } else {
            res.send('Usuario no encontrado!'); // Si el usuario no se encuentra, envía un mensaje
        }
    });
});

// Ruta de administrador
app.get('/admin', (req, res) => {
    if (!req.session.loggedin || !req.session.isAdmin) { // Verifica si el usuario está logueado y es administrador
        return res.redirect('/login'); // Si no, redirige a la página de login
    }
    pool.query('SELECT * FROM pqrssi', (err, results) => { // Consulta todas las PQRSSI
        if (err) throw err;
        res.render('admin', { pqrssi: results.rows }); // Renderiza la vista de administrador con las PQRSSI
    });
});

app.post('/admin/change-status', (req, res) => {
    if (!req.session.loggedin || !req.session.isAdmin) { // Verifica si el usuario está logueado y es administrador
        return res.redirect('/login'); // Si no, redirige a la página de login
    }
    const { pqrssi_id, estado_id, comentario } = req.body; // Obtiene los datos del formulario
    const comentarioCompleto = `Estado cambiado por administrador: ${comentario}`; // Prepara el comentario completo

    pool.query('UPDATE pqrssi SET estado_id = $1 WHERE id = $2', [estado_id, pqrssi_id], (err) => { // Actualiza el estado de la PQRSSI
        if (err) throw err;

        pool.query('INSERT INTO historial (pqrssi_id, estado_id, comentario) VALUES ($1, $2, $3)',
            [pqrssi_id, estado_id, comentarioCompleto],
            (err) => {
                if (err) throw err;
                res.redirect('/admin'); // Redirige a la página de administrador
            }
        );
    });
});

// Ruta de cierre de sesión
app.get('/logout', (req, res) => {
    req.session.destroy((err) => { // Destruye la sesión
        if (err) {
            return res.status(500).send('Error al cerrar la sesión');
        }
        res.redirect('/'); // Redirige a la página principal (index.ejs)
    });
});

// Ruta para enviar una PQRSSI
app.get('/submit', (req, res) => {
    if (!req.session.loggedin) { // Verifica si el usuario está logueado
        return res.redirect('/login'); // Si no, redirige a la página de login
    }
    pool.query('SELECT * FROM categorias', (err, results) => { // Consulta todas las categorías
        if (err) throw err;
        res.render('submit', { categorias: results.rows }); // Renderiza la vista de enviar PQRSSI con las categorías
    });
});

app.post('/submit', (req, res) => {
    if (!req.session.loggedin) { // Verifica si el usuario está logueado
        return res.redirect('/login'); // Si no, redirige a la página de login
    }
    const { tipo, descripcion, categoria_id } = req.body; // Obtiene los datos del formulario
    const usuario_id = req.session.userId; // Usa el ID del usuario autenticado
    const estado_id = 1; // Estado inicial de la PQRSSI

    pool.query('INSERT INTO pqrssi (tipo, descripcion, usuario_id, estado_id, categoria_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [tipo, descripcion, usuario_id, estado_id, categoria_id],
        (err, result) => {
            if (err) throw err;

            const pqrssi_id = result.rows[0].id; // Obtiene el ID de la PQRSSI recién creada

            pool.query('INSERT INTO historial (pqrssi_id, estado_id, comentario) VALUES ($1, $2, $3)',
                [pqrssi_id, estado_id, 'Solicitud creada'],
                (err) => {
                    if (err) throw err;
                    res.redirect('/'); // Redirige a la página principal
                }
            );
        }
    );
});

// Ruta para ver las PQRSSI
app.get('/view', (req, res) => {
    if (!req.session.loggedin) { // Verifica si el usuario está logueado
        return res.redirect('/login'); // Si no, redirige a la página de login
    }
    pool.query(`
        SELECT p.id, p.tipo, p.descripcion, e.nombre AS estado, p.fecha, c.nombre AS categoria, u.nombre AS usuario
        FROM pqrssi p
        JOIN estados e ON p.estado_id = e.id
        JOIN categorias c ON p.categoria_id = c.id
        JOIN usuarios u ON p.usuario_id = u.id
        WHERE p.usuario_id = $1
    `, [req.session.userId], (err, results) => {
        if (err) throw err;
        res.render('view', { pqrssi: results.rows }); // Renderiza la vista de ver PQRSSI con los resultados
    });
});

// Puerto de la aplicación
const PORT = process.env.PORT || 3000; // Define el puerto en el que se ejecuta la aplicación

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`); // Mensaje de confirmación de que el servidor está corriendo
});
