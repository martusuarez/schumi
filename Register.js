import React, { useState } from 'react';
import "./estilos/Login.css";
import Cookies from 'js-cookie'

const back = 'http://186.136.155.242:30018/'
const home = 'home'

function Register() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [surname, setSurname] = useState('');
    const [phone, setPhone] = useState('');
    const [error, setError] = useState('');

    function handleLogin(e) {
        e.preventDefault();

        if (email === '' || password === '' || name === '' || surname === '' || phone === '') {
            setError('Todos los campos son obligatorios.');
            return;
        } 

        var userCredentials = {
            nombre: name,
            apellido: surname,
            telefono: phone,
            email: email,
            password: password,
        };

        var dataPackage = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userCredentials)
        }

        fetch(back + 'register', dataPackage)
            .then((response) => response.json())
            .then((result) => handleServerResponse(result))
            .catch((e) => handleFailedConection(e));
    };

    function handleServerResponse(response) {
        if (response.token) {
            Cookies.set('authToken', response.token);
            Cookies.set('authEmail', email);
            window.location.href = home; // Redirige al dashboard u otra ruta
        } else {
            if (response.error) {
                setError(response.error);
            } else {
                setError('Error en el registro');
            }
        }
    }

    function handleFailedConection(error) {
        console.log(e);
        setError('No se pudo conectar con el servidor. Inténtelo más tarde.');
    }

    return (
        <div className='register'>
            <div className ="add-form">
                <h2>Register</h2>
                <form onSubmit={handleLogin}>
                    <input
                        type="name"
                        placeholder="Nombre"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                    />
                    <input
                        type="surname"
                        placeholder="Apellido"
                        value={surname}
                        onChange={(e) => setSurname(e.target.value)}
                    />
                    <input
                        type="phone"
                        placeholder="Telefono"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                    />
                    <input
                        type="email"
                        placeholder="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                    <input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />
                    {error && <p>{error}</p>}
                    <button type="submit">Registrarse</button>
                </form>
            </div>
        </div>
    );
}

export default Register;