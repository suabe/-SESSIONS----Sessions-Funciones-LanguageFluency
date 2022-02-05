const functions = require("firebase-functions");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });
const StripeCreator = require('stripe');
const apiKey = 'sk_test_51IdzQvFjLGC5FmHqrgFNYL0jVX0gHMB4vaVBkSexf8EYSCSO0yDBrRdwOnprDsX06tevgA4iVhIj1tWgR1F8D3Lp00ro1XfjxY';
const accountSid = 'AC22ae1dad8bd832a2ecd25b28742feddc'; // Your Account SID from www.twilio.com/console
const authToken = 'ce081d6d5457e766381d8ba6ca09d468';   // Your Auth Token from www.twilio.com/console
const nodemailer = require('nodemailer');
const { assign } = require("nodemailer/lib/shared");
const { ref } = require("firebase-functions/lib/providers/database");

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
// exports.helloWorld = functions.https.onRequest((request, response) => {
//   functions.logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

admin.initializeApp();

// Funciones Stripe

exports.attachSourceNewCustomer = functions.https.onRequest((request, response) => {
    cors( request, response, () => {
        response.setHeader('Access-Control-Allow-Origin', '*');
        let stripe = StripeCreator(apiKey);
        stripe.customers.create({
            name: request.body.name,
            email: request.body.email,
            source: request.body.token
        }).then((customer) => {
            response.send(customer);
        }).catch( error => {
            response.send(error)
        });
    });
});

exports.crearPlan = functions.https.onRequest((request, response) => {
    cors( request, response, () => {
        response.setHeader('Access-Control-Allow-Origin', '*');
        let stripe = StripeCreator(apiKey);
        stripe.subscriptions.create({
            customer: request.body.customer,
            items: [
                {price: request.body.priceId},
              ]
        }).then((respuesta) => {
            response.send(respuesta);
        }).catch( error => {
            response.send(error);
        });
        // response.send('saludos');
    });
});

exports.updatePlan = functions.https.onRequest((request, response) => {
    cors(request, response, () => {
        response.setHeader('Access-Control-Allow-Origin', '*');
        let stripe = StripeCreator(apiKey);
        stripe.subscriptions.update(request.body.plan,{
            customer: request.body.customer
        }).then((respuesta) => {
            response.send(respuesta);
        }).catch( error => {
            response.send(error);
        });
    })
})

exports.deletePlan = functions.https.onRequest((request, response) => {
    cors( request, response, () => {
        response.setHeader('Access-Control-Allow-Origin', '*');
        let stripe = StripeCreator(apiKey);
        stripe.subscriptions.del(request.body.plan).then((respuesta) => {
            response.send(respuesta);
        }).catch( error => {
            response.send(error);
        });
    } )
})

exports.recurringPayment = functions.https.onRequest((request, response) => {
    cors(request, response, async () => {
        response.setHeader('Access-Control-Allow-Origin', '*');
        const hook = request.body.type
        const data = request.body.data.object
        if (!data) throw new Error('sin datos');
        const db = admin.firestore();
        const wallet =  db.collection('plans');
        const user = await wallet.where('customer', '==', data.customer).get();
        if (!user.empty) {
            const snapshot = user.docs[0].data()
            //response.send(snapshot)
            switch (hook) {
                case 'invoice.payment_succeeded':
                    let susCrip = {
                        customer: data.customer,
                        uid: snapshot.uid,
                        subscription: data.subscription,
                        invoice: data.id,
                        created: data.created,
                        amount_paid: data.amount_paid,
                        urlInvoice: data.hosted_invoice_url,
                        pdfInvoice: data.invoice_pdf,
                        active: true
                    }
                    const activate = await db.collection('plans').doc(data.subscription).update({activa: true})
                    const plan = await db.collection('pagos').doc(data.id).set(susCrip)
                    response.send({err: 0, msg: 'Ok...'})
                    break;
                
                case 'invoice.payment_failed':
                    const update = await db.collection('plans').doc(data.subscription).update({activa: false})
                    response.send({err: 0, msg: 'Ok...'})
                    break;
            
                default:
                    break;
            }
            
        } else {
            response.send({err: 0, msg: 'No hay plan asociado'})
        }
       
    });
});

//Funciones Twilio
//Speaker Inicia llamada
exports.llamadaSaliente = functions.https.onRequest((request, response) => {
    cors( request, response,  () => {
        response.setHeader('Access-Control-Allow-Origin', '*');
        const client = require('twilio')(accountSid, authToken);
        client.calls.create({
            url: 'https://us-central1-ejemplocrud-e7eb1.cloudfunctions.net/agregarNumero?destino='+request.body.destination,//Se manda el numero del Improver para contactarlo una ves el Speaker conteste la llamada
            to: request.body.source,//Nmumero del Speaker
            from: '+14703482834',//Numero que asigna Twilio, este es de pruebas
            record: true
        }).then(call => {//Se guardan los datos de la llamda, conesto se consultara para obtenr los datos y grabaciones de la misma
            const db = admin.firestore();
            let dataCall = {
                sid: call.sid,
                uri: call.uri,
                create: Date.now().toString(),
                recordings: call.subresourceUris.recordings,
                inmpId:  request.body.impId,
                speId: request.body.speId,
                planId: request.body.planId
            }
            let registrar = db.collection('calls').doc(call.sid).set(dataCall)
            response.send(call);
        }).catch( error => {
            response.send(error);
        });
    });
});


//Esta funcion inicia unaves el Speker conteste la llamada de Twilio
//Se utiliza al API de Twilio
exports.agregarNumero = functions.https.onRequest((request, response) => {
    cors( request, response, () => {
        response.setHeader('Access-Control-Allow-Origin', '*');
        const VoiceResponse = require('twilio').twiml.VoiceResponse;

        const  respuesta = new VoiceResponse();
        respuesta.say({
            voice: "woman",
            language: "es-MX"
        },"Espere, procesando llamada");//Mensaje al Speaker/Intento de llamada al ImProver
        const dial = respuesta.dial({ timeLimit: 600 });//Limite de la llamda, tiempo en segundos
        respuesta.record();
        dial.number(request.query.destino);
        //console.log(respuesta.toString());
        response.send(respuesta.toString());
    });
});

exports.twilioWebhook = functions.https.onRequest((request, response) =>{
    cors( request, response, () => {
        response.setHeader('Access-Control-Allow-Origin', '*');
        const db = admin.firestore();
        let d = Date.now().toString();
        const record = db.collection('webHook').doc(d).set(request.body)
        response.status(201).send('good').end();
    } );
});

// FUnciones Firebase Messagein
//Se registan los usuario a Temas(Topic)
exports.registTopic = functions.database.ref('/perfiles/{userUID}').onUpdate((change, context) => {
    const user = change.data();
    console.log(user);
    if (user.role === 'cliente') {
        admin.messaging().subscribeToTopic(user.mtoken,'improvers')
    }
    if (user.role === 'conversador') {
        admin.messaging().subscribeToTopic(user.mtoken,'speakers')
    }
})


//Funciones Admin
//Se registra usuario Administrador en Firebase, no se genera perfil
exports.regAdmin = functions.https.onRequest((request, response) => {
    cors( request, response, () =>{
        response.setHeader('Access-Control-Allow-Origin', '*');
        admin.auth().createUser({
            email: request.body.email,
            emailVerified: true, //No se envia email de verificacion           
            password: request.body.password,
            displayName: `${request.body.name} ${request.body.lastName}`,
            disabled: false
        }).then((userRecord) => {
            response.send({uid: userRecord.uid, msg: 'Successfully created new user'})
        }).catch((error) => {
            response.send({error: error})
        });
    });
})

//Registro de potencial aprovado
exports.regSpeaker = functions.https.onRequest((request, response) => {
    cors( request, response, () =>{
        response.setHeader('Access-Control-Allow-Origin', '*');
        admin.auth().createUser({
            email: request.body.email,
            emailVerified: true, //No se envia email de verificacion           
            password: request.body.password,
            displayName: `${request.body.name} ${request.body.lastName}`,
            disabled: false
        }).then((userRecord) => {
            response.send({uid: userRecord.uid, msg: 'Successfully created new user'})
        }).catch((error) => {
            response.send({error: error})
        });
    });
})

let transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'seiyasuabe@gmail.com',
        pass: 'hbifoudwoehlbiyq'
    }
})

exports.sendEmailInvoice = functions.https.onRequest((request, response) => {
    cors(request, response, () => {
        response.setHeader('Access-Control-Allow-Origin', '*');
        const mailOptions = {
            from: 'Language Fluency <admin@lflanguagefluency.com>',
            to: request.body.email,
            subject: 'Factura Servicio',
            html: `<h1>Order Confirmation</h1>
            <p> <b>Email: </b>Invoice </p>`,
            attachments: [
                {
                    filename: 'Factura.pdf',
                    path: request.body.file
                }
            ]
        }

        return transporter.sendMail(mailOptions, (erro, info) => {
            if(erro){
                return res.send(erro.toString());
            }
            return res.send('Sended');
        });
    });
})

exports.sendEmailSupport = functions.https.onRequest((request, response) => {
    cors(request, response, () => {
        response.setHeader('Access-Control-Allow-Origin', '*');
        const mailOptions = {
            from: 'Language Fluency <admin@lflanguagefluency.com>',
            to: request.body.email,
            subject: 'contact form support',
            html: `<h1>Support Response</h1>
            <p> <b>Email: </b>${request.body.response} </p>`
        }

        return transporter.sendMail(mailOptions, (erro, info) => {
            if(erro){
                return res.send(erro.toString());
            }
            return res.send('Sended');
        });
    });
})

exports.contSpeakers = functions.firestore.document('perfiles/{uid}').onCreate(
    async (snap, context) => {
        const db = admin.firestore();
        if (snap.data().role == 'conversador') {
            let pais = 'helo'
        }
    }
);

exports.createIdF = functions.firestore.document('perfiles/{uid}').onCreate(
    async (snap, context) => {
        const db = admin.firestore();
        var padLeft = n => "0000000".substring(0, "0000000".length - n.length) + n;
        if (snap.data().role == 'cliente') {
            const improvers = await db.collection('perfiles').where('role', '==', 'cliente').get()
            if (!improvers.empty) {
                let contador = improvers.size;
                let data = {
                    LFId: 'I'+padLeft(contador + "")
                };          
                await db.collection('perfiles').doc(context.params.uid).update(data)
            }
            
        } if (snap.data().role == 'conversador') {
            const improvers = await db.collection('perfiles').where('role', '==', 'conversador').get()
            if (!improvers.empty) {
                let contador = improvers.size;
                let data = {
                    LFId: 'S'+padLeft(contador + "")
                };          
                await db.collection('perfiles').doc(context.params.uid).update(data)
            }
        }
    }
)


exports.sendEmailPotencial = functions.firestore.document('potenciales/{potecialId}').onCreate(
    async (snap, context) => {        
        const mailOptions = {
            from: 'Language Fluency <admin@lflanguagefluency.com>',
            to: snap.data().email,
            subject: 'contact form message',
            html: `<h1>Order Confirmation</h1>
            <p> <b>Email: </b>${snap.data().email} </p>`
        }

        return transporter.sendMail(mailOptions, (erro, info) => {
            if(erro){
                return res.send(erro.toString());
            }
            return res.send('Sended');
        });
    }
)