const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const MI_NUMERO = '5491128491501@c.us';
const usuariosSaludados = new Set();
const datosClientes = {};
const inactivos = {};

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
    console.log('Escaneá el QR para conectar el bot');
});

client.on('ready', () => {
    console.log('✅ Bot conectado y listo');
    setInterval(() => {
        const ahora = Date.now();
        for (const [cliente, tiempo] of Object.entries(inactivos)) {
            if (ahora - tiempo >= 30 * 60 * 1000) {
                client.sendMessage(cliente,
                    `🕒 Notamos que no completaste el proceso.
Si necesitás ayuda, podés escribir directamente al operador:
👉 +54 9 11 2849‑1501`);
                client.sendMessage(MI_NUMERO,
                    `⚠️ El cliente ${cliente.replace("@c.us", "").replace(/^549/, "")} no respondió durante más de 30 minutos.`);
                delete inactivos[cliente];
            }
        }
    }, 60 * 1000);
});

client.on('message', async msg => {
    const contacto = msg.from;
    const texto = msg.body?.toLowerCase() || '';
    const esOperador = contacto === MI_NUMERO;

    if (esOperador) return;

    if (!datosClientes[contacto]) {
        datosClientes[contacto] = { etapa: 0, servicio: '', nombre: '', boleta: null, dni: null };
    }

    inactivos[contacto] = Date.now();
    const cliente = datosClientes[contacto];

    if (!usuariosSaludados.has(contacto)) {
        await client.sendMessage(contacto,
            `🧾 *¡Hola! Bienvenido al servicio de pago de boletas al 50%*
Podés pagar luz, agua, gas, multas, impuestos y mucho más.
👇 Escribí “quiero pagar” para continuar.`);
        usuariosSaludados.add(contacto);
        return;
    }

    if ((/pagar|boleta|factura/.test(texto) && cliente.etapa === 0) || 
        (/quiero.*pagar|como.*pagar|necesito.*pagar|me interesa.*pagar/.test(texto) && cliente.etapa === 0)) {
        cliente.etapa = 1;
        return await client.sendMessage(contacto,
            `✅ Genial. ¿Qué servicio necesitas pagar?
Por ejemplo: luz, agua, gas, multas, teléfono, etc.`);
    }

    if (cliente.etapa === 1 && texto.length > 2) {
        cliente.servicio = msg.body;
        cliente.etapa = 2;
        return await client.sendMessage(contacto,
            `📸 Perfecto. Ahora por favor mandanos:
- Foto clara de la boleta
- Tu nombre completo
- Foto del frente de tu DNI`);
    }

    if (cliente.etapa === 2) {
        const textoBajo = texto.toLowerCase();
        if (textoBajo.includes("no tengo") ||
            textoBajo.includes("no la tengo") ||
            textoBajo.includes("no tengo foto del dni") ||
            textoBajo.includes("no tengo el dni") ||
            textoBajo.includes("no puedo mandar el dni") ||
            textoBajo.includes("te lo paso después") ||
            textoBajo.includes("más tarde") ||
            textoBajo.includes("después te lo mando")) {

            await client.sendMessage(MI_NUMERO, 
                `📬 Cliente necesita ayuda manual:

📱 Número: ${contacto.replace("@c.us", "").replace(/^549/, "")}
📄 Mensaje: ${msg.body}`);
            await client.sendMessage(contacto, 
                `📞 *No hay problema. Si necesitás ayuda, podés escribir directamente al operador:*
👉 +54 9 11 2849‑1501`);
            delete datosClientes[contacto];
            delete inactivos[contacto];
            return;
        }

        if (msg.hasMedia) {
            const media = await msg.downloadMedia();
            if (!cliente.boleta) {
                cliente.boleta = media;
                await client.sendMessage(contacto, "📎 Boleta recibida.");
            } else if (!cliente.dni) {
                cliente.dni = media;
                await client.sendMessage(contacto, "🪪 DNI recibido.");
            }
        } else if (!cliente.nombre && texto.length > 2) {
            cliente.nombre = msg.body;
            await client.sendMessage(contacto, "🧍 Nombre recibido.");
        }

        if (cliente.servicio && cliente.boleta && cliente.nombre && cliente.dni) {
            await client.sendMessage(contacto, 
                `✅ *Perfecto. Ya recibimos todos tus datos.*
En breve te vamos a estar escribiendo.
💸 *No es necesario realizar ningún pago previo.*`);
            await client.sendMessage(contacto, 
                `📞 *Si necesitás hablar con un operador, podés escribir a este número:*
👉 +54 9 11 2849‑1501`);

            await client.sendMessage(MI_NUMERO, 
                `📬 Nuevo cliente interesado en pagar boleta al 50%:

📱 Número: ${contacto.replace("@c.us", "").replace(/^549/, "")}
📄 Servicio: ${cliente.servicio}
🧍 Nombre: ${cliente.nombre}`);
            await client.sendMessage(MI_NUMERO, cliente.boleta, { caption: '📎 Boleta' });
            await client.sendMessage(MI_NUMERO, cliente.dni, { caption: '🪪 DNI' });

            delete datosClientes[contacto];
            delete inactivos[contacto];
        }
    }
});

client.initialize();
