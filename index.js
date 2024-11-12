var express = require('express')
var cors = require('cors')
var mysql = require('mysql2/promise')
var bodyParser = require('body-parser') 
var jwt = require('jsonwebtoken')
var bcrypt = require('bcryptjs')
const nodemailer = require('nodemailer')
const { error } = require('console')
require('dotenv').config()


var app = express()
var salt = bcrypt.genSaltSync(10)

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: false }))
app.use(cors());
  
app.listen("3018", () => console.log("Escuchando"))

var con = mysql.createConnection({
    multipleStatements: true,
    host: "127.0.0.1",
    user: "ocho",  // usuario de mysql. Cambiar para cada grupo
    password: "8421ocho",  // clave. Cambiar para cada grupo
    database: 'ocho'  // nombre de la base de datos, cambiar para cada grupo
});

initServer();

async function initServer() {
  await con;
  con.then((connection => {
    con = connection;
    con.connect((err) => {
      if (err) throw err
    });
  }));
}

/* Servicios */

app.use(['/edit', '/traer', '/masInfo', '/masInfoAdmin', '/bloquear', '/desbloquear'], auth);
app.use(['/masInfoAdmin', '/bloquear', '/desbloquear'], authAdmin);

app.get("/traer", traer);                 // Devuelve informacion limitada de todos los usuarios
app.post("/add", add);                    // Agrega una nueva entrada
app.post("/edit", edit);                  // Edita un entrada existente
app.post("/login", login);                // Autentica un usuario
app.post("/register", register);          // Registra un nuevo usuario
app.get('/reset', reset);                 // (Debug) Resetea las bases de datos
app.get('/verCuentas', verCuentas);       // (Debug) Muestra todos los contenidos de la tabla Cuentas
app.get('/verUsuarios', verUsuarios);     // (Debug) Muestra todos los contenidos de la tabla Usuarios
app.post('/masInfo', masInfo);            // Devuelve toda la informacion de un usuario
app.post('/masInfoAdmin', masInfoAdmin);  // Devuelve toda la informacion de un usuario mas los datos de su cuenta
app.post('/bloquear', bloquear);          // Bloquea un usuario
app.post('/desbloquear', desbloquear);    // Desbloquea un usuario
app.get('/auth', (req, res) => auth(req, res, () => res.status(200).json({})));


/* Implementacion de Servicios */



function add(request, response) {
  var nuevo = request.body;
  var errr = chequearNuevo(nuevo);
  if (errr === ""){
    con.query("INSERT INTO Usuarios (mail, apellido, nombre, numero) VALUES (?, ?, ?, ?)", 
      [nuevo.email, nuevo.apellido, nuevo.nombre, nuevo.telefono],
      (err, result, fields) => {
        if (err) {
          if (err.code === 'ER_DUP_ENTRY'){
            response.json({error: "Mail ya registrado"});
          } else {
            throw err;
          }
        } else {
          response.json({error: ""});
        }});
  } else {
    response.json({error: errr});
  }
}

async function edit(request, response) {
  try {
    const autorizado = request.headers['emailAutorizado'];
    const emailCambio = request.body.email;
    var cambio = request.body.nuevo;
    if (autorizado !== emailCambio) {
      response.status(403).json({error: "Credenciales incorrectas"});
      return;
    }
    var err = await chequearCambio(emailCambio, cambio);
    if (err === ""){
      const [results, fields] = await con.query("UPDATE Usuarios SET nombre = ?, apellido = ?, telefono = ? WHERE email = ?", [cambio.nombre, cambio.apellido, cambio.telefono, emailCambio]);
      response.status(200).json({});
    } else {
      console.log(err);
      response.status(422).json({error: err});
    }
  } catch(e) {
    console.log(e);
    response.status(500).json({error: "Error en la base de datos"});
  }
}

async function login(request, response) {
  try {
    var email = request.body.email;
    var password = request.body.password;
    const [results, fields] = await con.query("SELECT password, bloqueado, motivoBlock, fechaBlock, vecesEntro FROM Cuentas WHERE email=?", [email]);
    var result = results[0];
    if (results.length === 0) {
      response.status(422).json({error: "Ususario Inexistente"});
    } else if(result.bloqueado) {
      response.status(403).json({error: `Este usuario esta bloqueado desde ${result.fechaBlock}\nMotivo: ${result.motivoBlock}`});
    } else if (bcrypt.compareSync(password, result.password)) {
      await con.query("UPDATE Cuentas SET vecesEntro=?, ultimoIngreso=? WHERE email=?", [result.vecesEntro+1, getDateTime(), email]);
      tkn = generarToken(email);
      response.status(200).json({token: tkn});
    } else {
      response.status(401).json({error: "Contraseña incorrecta"}); 
    }
  } catch(e) {
    console.error(e);
    response.status(500).json({error: "Error de la base de datos"});
  }
}

async function register(request, response) {
  try {
    var nuevo = request.body;
    var email = request.body.email;
    var password = request.body.password;
    const cripted_pass = bcrypt.hashSync(password, salt);
    var creoCuenta = false;
    const [results, fields] = await con.query("SELECT * FROM Cuentas WHERE email=?", [email]);
    if (results.length > 0) {
      response.json({error: `La direccion ${email} ya está en uso`});
      return;
    }

    var status = chequearNuevo(nuevo);
    if (status != "") {
      response.json({error: status});
      return;
    }

    const token = jwt.sign({ nombre: nuevo.nombre, apellido: nuevo.apellido, email: nuevo.email, telefono: nuevo.telefono, pass: cripted_pass }, process.env.JWT_SECRET_KEY, { expiresIn: '8h' });

    addEmailToQueue(nuevo.email, token);

    await con.query(`INSERT INTO Cuentas (email, password, admin, bloqueado, motivoBlock, fechaBlock, fechaSubcripcion, ultimoIngreso, vecesEntro)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [email, cripted_pass, false, false, null, null, getDate(), getDateTime(), 1]);
    creoCuenta = true;
    await con.query("INSERT INTO Usuarios (nombre, apellido, email, telefono) VALUES (?, ?, ?, ?)", [nuevo.nombre, nuevo.apellido, nuevo.email, nuevo.telefono]);
    tkn = generarToken(email);
    response.json({token: tkn});
    return;

  } catch(e) {
    if (creoCuenta) {
      con.query("DELETE FROM Cuentas WHERE email=?", [email]);
    }
    console.log(e);
    response.json({error: "Error en la base de datos"});
    return;
  }
}

function getMailOptions (email, link) {
  let body = `
  <h2>Hola ${email}!</h2>
  <p>Para conseguir una nueva contraseña haz click en el siguiente link:</p>
  <p>${link}</p>
  <p>Este enlace luego de 8 horas pierde su validez</p>
  <p>Pórtese mal!!</p>`;

  return {
    body,
    subject: "Nueva Contraseña",
    to: email,
    html: body,
    from: env.EMAIL_ADDRESS,
  };
};

function sendEmail (email, token) {
  const link = "http://186.136.155.242:30008/verify?token=${token}";

  //Create mailrequest
  let mailRequest = getMailOptions(email, link, token);

  const transporter = nodemailer.createTransport({
      service: "gmail",
      host: "192.168.4.9",
      port: 587,
      secure: true, 
      auth: {
        user: env.EMAIL_ADDRESS,
        pass: env.CONTRASEÑA,
      },
  });

  //Send mail
  return transporter.sendMail(mailRequest, (error) => {
    if (error) {
      res.status(500).send("Can't send email.");
    } else {
      res.status(200);
      res.send({
        message: `Link sent to ${email}`,
      });
    }
  });
}

async function processQueue() {
  if (isSending || emailQueue.length === 0) {
    return;
  }

  isSending = true;
  while (emailQueue.length > 0) {
    const { email, token } = emailQueue.shift(); // Obtiene el primer correo de la cola
    sendEmail(email, token); // Envía el correo y espera a que termine
    await new Promise(resolve => setTimeout(resolve, 300000)); // Espera antes de enviar el siguiente
  }
  isSending = false;
}

// Añadir correos electrónicos a la cola
function addEmailToQueue(email, token) {
  mail_object = {email: email, token: token}
  emailQueue.push(mail_object);
  processQueue(); // Procesa la cola cada vez que se añade un nuevo correo
}

async function masInfo(request, response) {
  try {
    const autorizado = request.headers['emailAutorizado'];
    const email = request.body.email;
    
    if (autorizado !== email) {
      response.status(403).json({error: "Credenciales incorrectas"});
      return;
    }
    const [results, fields] = await con.query("SELECT nombre, apellido, email, telefono FROM Usuarios WHERE email=?", [email]);
    const result = results[0];
    response.status(200).json(result);
  } catch(e) {
      console.log(e);
      response.status(500).json({error: "Error en la base de datos"});
  }
}

async function traer(request, response) {
  try {
    const [results, fields] = await con.query("SELECT nombre, apellido, email FROM Usuarios");
    response.status(200).json(results);
  } catch(e) {
    console.log(e);
    response.status(500).json({error: "Error en la base de datos"});
  }
}

async function masInfoAdmin(request, response) {
  try {
    const email = request.body.email;

    const [results, fields] = await con.query(`SELECT Usuarios.nombre, Usuarios.apellido, Usuarios.telefono, Usuarios.email,
      Cuentas.password, Cuentas.admin, Cuentas.bloqueado, Cuentas.motivoBlock, Cuentas.fechaBlock, Cuentas.fechaSubcripcion, Cuentas.ultimoIngreso, Cuentas.vecesEntro
      FROM Cuentas
      INNER JOIN Usuarios
      ON Cuentas.email=Usuarios.email
      WHERE Cuentas.email = ?`, [email]);
    const result = results[0];
    if (results.length === 0) {
      response.status(422).json({error: "Ususario Inexistente"});
    } else {
      response.status(200).json(result);
    }
  } catch(e) {
    console.log(e);
    response.status(500).json({error: "Error en la base de Datos"});
  }
}

async function bloquear(request, response) {
  try {
    const email = request.body.email;
    const razon = request.body.razon;

    const [results, fields] = await con.query("SELECT bloqueado FROM Cuentas WHERE email=?", email);
    if (results.length === 0) {
      response.status(422).json({error: "Usuario Inexistente"});
    } else if (results[0].bloqueado){
      response.status(409).json({error: "Usuario ya está bloqueado"});
    } else {
      await con.query("UPDATE Cuentas SET bloqueado=?, motivoBlock=?, fechaBlock=? WHERE email=?", [true, razon, getDate(), email]);
      response.status(200).json({});
    }
  } catch(e) {
    console.log(e);
    response.status(500).json({error: "Error en la base de Datos"});
  }
}

async function desbloquear(request, response) {
  try {
    const email = request.body.email;
    const [results, fields] = await con.query("SELECT bloqueado FROM Cuentas WHERE email=?", email);
    if (results.length === 0) {
      response.status(422).json({error: "Usuario Inexistente"});
    } else if (!results[0].bloqueado){
      response.status(409).json({error: "Usuario no está bloqueado"});
    } else {
      await con.query("UPDATE Cuentas SET bloqueado=?, motivoBlock=?, fechaBlock=?", [false, null, null]);
      response.status(200).json({});
    }
  } catch(e) {
    console.log(e);
    response.status(500).json({error: "Error en la base de Datos"});
  }
}

/* Middleware */

async function auth(request, response, next) {
  try {
    const token = request.get('authToken');
    if (!token) {
      response.status(401).json({error: "Faltan Credenciales"});
      return;
    }
    const emailToken = jwt.verify(token, process.env.JWT_SECRET_KEY);
    const [results, fields] = await con.query("SELECT bloqueado, fechaBlock, motivoBlock FROM Cuentas WHERE email=?", [emailToken]);
    if(results.length === 0) {
      response.status(401).json({error: `Credenciales validas para ${emailToken}, quien no está registrado como usuario`});
      return;
    } else if (results[0].bloqueado) {
      response.status(403).json({error: `Este usuario esta bloqueado desde ${results[0].fechaBlock}\nMotivo: ${results[0].motivoBlock}`});
      return;
    } else {
      request.headers['emailAutorizado'] = emailToken;
      return next();
    }
  } catch(e) {
    console.log(e);
    response.status(500).json({error: "Error interno de Autenticacion"});
    return;
  }
}

async function authAdmin(request, response, next) {
  try {
    const autorizado = request.headers['emailAutorizado'];
    const [results, fields] = await con.query("SELECT admin FROM Cuentas WHERE email=?", [autorizado]);
    if (!results[0].admin) {
      response.status(403).json({error: "No es admin"});
      return;
    } else {
      next();
    }
  } catch(e) {
    console.log(e);
    response.status(500).json({error: "Error interno de Autenticacion"});
    return;
  }
}

/* Servicios debugeo */

async function reset(request, response) {
  var errores = 0;

  try {
    await con.query("DROP TABLE Cuentas");
  } catch (e) {
    console.log(e);
    errores++;
  }
  try {
    await con.query(`CREATE TABLE Cuentas 
      (email varchar(255) UNIQUE,
       password varchar(255),
       admin bool,
       bloqueado bool,
       motivoBlock varchar(255),
       fechaBlock Date,
       fechaSubcripcion Date,
       ultimoIngreso DateTime,
       vecesEntro smallint,
       primary key (email))`);
  } catch (e) {
    console.log(e);
    errores++;
  }
  try {
    await con.query("DROP TABLE Usuarios");
  } catch (e) {
    console.log(e);
    errores++;
  }
  try {
    await con.query(`CREATE TABLE Usuarios 
      (email varchar(255) UNIQUE,
       nombre varchar(255),
       apellido varchar(255),
       telefono varchar(255),
       primary key (email))`);
  } catch (e) {
    console.log(e);
    errores++;
  }
  try {
    await con.query(`INSERT INTO Cuentas (email, password, admin, bloqueado, motivoBlock, fechaBlock, fechaSubcripcion, ultimoIngreso, vecesEntro)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ["sodocamilo@gmail.com", bcrypt.hashSync("hipnoteta", salt), true, false, null, null, getDate(), getDateTime(), 1]);
      await con.query(`INSERT INTO Usuarios (email, nombre, apellido, telefono)
        VALUES (?, ?, ?, ?)`,
        ["sodocamilo@gmail.com", "Camilo", "Sodo", "+54 9 341 2299-355"]);
  } catch(e) {
    console.log(e);
    errores++;
  }
  try {
    await con.query(`INSERT INTO Cuentas (email, password, admin, bloqueado, motivoBlock, fechaBlock, fechaSubcripcion, ultimoIngreso, vecesEntro)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ["camiloveinte@gmail.com", bcrypt.hashSync("bigoteta", salt), false, true, "Es muy feo", getDate(), getDate(), getDateTime(), 1]);
      await con.query(`INSERT INTO Usuarios (email, nombre, apellido, telefono)
        VALUES (?, ?, ?, ?)`,
        ["camiloveinte@gmail.com", "KKKamilo", "S卍d卍", "+54 1488"]);
  } catch(e) {
    console.log(e);
    errores++;
  }
  response.json(`${6 - errores}/6 operaciones`);
}

async function verCuentas(request, response) {
  const [results, fields] = await con.query("SELECT * FROM Cuentas");
  response.json(results);
}

async function verUsuarios(request, response) {
  const [results, fields] = await con.query("SELECT * FROM Usuarios");
  response.json(results);
}

/* Funciones Auxiliares */

async function chequearCambio(og_mail, cambio){
  if(og_mail !== cambio.email) return "No se puede cambiar la direccion de correo electronico";
  if(cambio.nombre === "") return "Nombre vacio";
  if(cambio.apellido === "") return "Apellido vacio";
  if(cambio.telefono === "") return "Telefono vacio";
  const [results, fields] = await con.query("SELECT * FROM Usuarios WHERE email=?", [og_mail]);
  if (results.length === 0) return "EL usuario que desea cambiar no existe";
  if(cambio.telefono.slice(0, 3) !== "+54") return "Numero extranjero, no empieza con +54";
  return "";
}

function chequearNuevo(nuevo) {
  var flag = false;
  if(nuevo.nombre === "") return "Nombre vacio";
  if(nuevo.apellido === "") return "Apellido vacio";
  if(nuevo.email === "") return "Email vacio";
  if(nuevo.telefono === "") return "Telefono vacio";
  var email = nuevo.email;
  if(nuevo.telefono.slice(0, 3) !== "+54") return "Numero extranjero, no empieza con +54";
  if(!(email.endsWith("@gmail.com") || email.endsWith("@hotmail.com") || email.endsWith("@ips.edu.ar"))) return "Direccion de correo invalida. No es hotmail, gmail ni del poli";
  return "";
}

function generarToken(contenido) {
  return jwt.sign(contenido, process.env.JWT_SECRET_KEY);
}

function getDateTime() {
  return new Date(Date.now());
}

function getDate() {
  return new Date(Date.now());
}