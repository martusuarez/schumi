import express from 'express';
import cors from 'cors';
import mysql from 'mysql';
import bodyParser from 'body-parser';
import jwt from 'jsonwebtoken';

/* Set Up */

var app = express()

app.use(cors({
  origin: 'http://localhost:3008', 
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,}));
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: false }))

app.listen("3018", () => console.log("Escuchando"))

var con = mysql.createConnection({
   host: "127.0.0.1",
   user: "ocho",  // usuario de mysql. Cambiar para cada grupo
   password: "8421ocho",  // clave. Cambiar para cada grupo
   database: 'ocho'  // nombre de la base de datos, cambiar para cada grupo
 })

con.connect((err) => {
   if (err) throw err
})  //  conecta con mysql de acuerdo a los datos que le pasamos a con (ver arriba)

/* Funciones Middleware */

app.use("/home", (req, res, next) => {
  console.log("Increiblee");
  next();
})


/* Funciones Backend */

app.post("/add", (req, res) => {
  var nuevo = req.body;
  var errr = chequearNuevo(nuevo);
  console.log("para agregar err=" + errr);
  if (errr === ""){
    con.query("INSERT INTO usuarios (mail, apellido, nombre, numero) VALUES (?, ?, ?, ?)", [nuevo.email, nuevo.apellido, nuevo.nombre, nuevo.telefono], (err, result, fields) => {
      if (err) {
        if (err.code === 'ER_DUP_ENTRY'){
        console.log("cayendo");
        res.json({error: "Mail ya registrado"});
        } else {
          throw err;
        }
      } else {
        console.log("volviendo");
        res.json({error: ""});
      }
    });
  } else {
    console.log("cayendo");
    res.json({error: errr});
  }
});

app.post("/edit", (req, res) => {
  var cambio = req.body.nuevo;
  var orig = req.body.orig;
  var err = chequearCambio(orig, cambio)
  console.log(orig + " para cambiar err=" + err);
  if (err === ""){
    con.query("UPDATE usuarios SET nombre = ?, apellido = ?, numero = ?, mail = ? WHERE mail = ?", 
      [cambio.nombre, cambio.apellido, cambio.telefono, cambio.email, orig], (err, _1, _2) => {
      if (err) {
        if (err.code === 'ER_DUP_ENTRY'){
        console.log("cayendo");
        res.json({error: "Mail ya registrado"});
        } else {
          throw err;
        }
      } else {
        console.log("volviendo");
        res.json({error: ""});
      }
    });
  } else {
    console.log("cayendo");
    res.json({error: err});
}});

app.get("/traer", (req, res) => {
  con.query("SELECT * FROM usuarios", (err, result, fields) => {
    if (err) throw err;
    res.json(result);
  });
});

app.post("/login", (req, res) => {
  var email = req.body.email;
  var password = req.body.password;
  con.query("SELECT password FROM cuentas WHERE email=?", {email}, (err, result, fields) => {
    if (err) {
      console.error(err);
      return res.status(500).json("message: Error de la base de datos");
    }
    if (result.length === 0) {
      return res.status(404).json("message: No se encontró el usuario");
    }
    if (password == result) {
      jwt.sign() // > Estaba haciendo aca
    }
    res.json(result);
  });
})

/* Funciones Auxiliares */

function chequearCambio(og_mail, cambio){
    var actual;
    var flag = false;
    if(cambio.nombre === "") return "Nombre vacio";
    if(cambio.apellido === "") return "Apellido vacio";
    if(cambio.email === "") return "Email vacio";
    if(cambio.telefono === "") return "Telefono vacio";
    con.query("SELECT * FROM usuarios WHERE mail=?", [og_mail], (err, result, fields) => { if (result.length !== 0 || err) flag = true;});
    if (flag) return "EL usuario que desea cambiar no existe";
    if(!(cambio.email.endsWith("@gmail.com") || cambio.email.endsWith("@hotmail.com") || cambio.email.endsWith("@ips.edu.ar"))) return "Direccion de correo invalida. No es es hotmail, gmail ni del poli";
    if(cambio.telefono.slice(0, 3) !== "+54") return "Numero extranjero, no empieza con +54";
    return "";
  }

function chequearNuevo(nuevo) {
    var flag = false;
    if(nuevo.nombre === "") return "Nombre vacio";
    if(nuevo.apellido === "") return "Apellido vacio";
    if(nuevo.email === "") return "Email vacio";
    if(nuevo.telefono === "") return "Telefono vacio";
    var mail = nuevo.email;
    if(nuevo.telefono.slice(0, 3) !== "+54") return "Numero extranjero, no empieza con +54";
    if(!(mail.endsWith("@gmail.com") || mail.endsWith("@hotmail.com") || mail.endsWith("@ips.edu.ar"))) return "Direccion de correo invalida. No es hotmail, gmail ni del poli";
    return "";
  }

  function generateToken(email) {
    const expirationDate = new Date();
    expirationDate.setHours(8);
    return jwt.sign({ email, expirationDate }, process.env.JWT_SECRET_KEY);
};

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

const emailRegex = /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/;

function sendEmail (email) {
    const token = generateToken(email);
    const link = "http://localhost:7010/verify?token=${token}";
  
    //Create mailrequest
    let mailRequest = getMailOptions(email, link);

    const transporter = nodemailer.createTransport({
        service: "gmail",
        host: "smtp.gmail.com",
        port: 465, 
        secure: false, 
        auth: {
          user: env.USUARIO,
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
          message: "Link sent to ${email}",
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
      const email = emailQueue.shift(); // Obtiene el primer correo de la cola
      await sendEmail(email); // Envía el correo y espera a que termine
      await new Promise(resolve => setTimeout(resolve, 300000)); // Espera antes de enviar el siguiente
    }
    isSending = false;
  }
  
  // Añadir correos electrónicos a la cola
  function addEmailToQueue(email) {
    emailQueue.push(email);
    processQueue(); // Procesa la cola cada vez que se añade un nuevo correo
  }

  app.post("/landing", (req, res) => {

    //Get email from request body
    const { email } = req.body;
    if (!emailRegex.test(email)) {
      res.status(400).send({
        message: "Invalid email address.",
      });
    }
  
    return addEmailToQueue(email);    
  });

  app.get("/verify", (req, res) => {
    const { token } = req.query;
    if (!token) {
      res.status(401).send("Invalid user token");
      return;
    }
  
    let decodedToken;
    try {
      decodedToken = jwt.verify(token, process.env.JWT_SECRET_KEY);
    } catch {
      res.status(401).send("Invalid authentication credentials");
      return;
    }
  
    if (
      !decodedToken.hasOwnProperty("email") ||
      !decodedToken.hasOwnProperty("expirationDate")
    ) {
      res.status(401).send("Invalid authentication credentials.");
      return;
    }
  
    const { expirationDate } = decodedToken;
    if (expirationDate < new Date()) {
      res.status(401).send("Token has expired.");
      return;
    }  
    res.status(200).send("verfication successful");
  });