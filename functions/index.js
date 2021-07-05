const functions = require("firebase-functions");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });
const StripeCreator = require('stripe');
const apiKey = 'sk_test_51IdzQvFjLGC5FmHqrgFNYL0jVX0gHMB4vaVBkSexf8EYSCSO0yDBrRdwOnprDsX06tevgA4iVhIj1tWgR1F8D3Lp00ro1XfjxY';
const accountSid = 'AC22ae1dad8bd832a2ecd25b28742feddc'; // Your Account SID from www.twilio.com/console
const authToken = '05aa8e9764b5cdc3a22cb155de1ce8fa';   // Your Auth Token from www.twilio.com/console

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
        }).then((respesta) => {
            response.send(respesta);
        }).catch( error => {
            response.send(error);
        });
        // response.send('saludos');
    });
});

exports.recurringPayment = functions.https.onRequest((request, response) => {
    cors(request, response, async () => {
        response.setHeader('Access-Control-Allow-Origin', '*');
        const hook = request.body.type
        const data = request.body.data.object
        if (!data) throw new Error('sin datos');
        const db = admin.firestore();
        const wallet =  db.collection('wallet');
        const user = await wallet.where('customer', '==', data.customer).get();
        if (!user.empty) {
            const snapshot = user.docs[0]
            //response.send(snapshot.id)
            switch (hook) {
                case 'invoice.payment_succeeded':
                    let susCrip = {
                        customer: data.customer,
                        uid: snapshot.id,
                        subscription: data.subscription,
                        invoice: data.id,
                        created: data.created,
                        amount_paid: data.amount_paid,
                        urlInvoice: data.hosted_invoice_url,
                        pdfInvoice: data.invoice_pdf,
                        active: true
                    }
                    const activate = await db.collection('wallet').doc(snapshot.id).update({activa: true})
                    const plan = await db.collection('pagos').doc(data.id).set(susCrip)
                    response.send({err: 0, msg: 'Ok...'})
                    break;
                
                case 'invoice.payment_failed':
                    const update = await db.collection('wallet').doc(snapshot.id).update({activa: false})
                    response.send({err: 0, msg: 'Ok...'})
                    break;
            
                default:
                    break;
            }
            
        }
       
    });
});

//Funciones Twilio

exports.llamadaSaliente = functions.https.onRequest((request, response) => {
    cors( request, response,  () => {
        response.setHeader('Access-Control-Allow-Origin', '*');
        const client = require('twilio')(accountSid, authToken);
        client.calls.create({
            url: 'https://us-central1-ejemplocrud-e7eb1.cloudfunctions.net/agregarNumero?destino='+request.body.destination,
            to: request.body.source,
            from: '+14703482834',
            record: true
        }).then(call => {
            const db = admin.firestore();
            let dataCall = {
                sid: call.sid,
                uri: call.uri,
                recordings: call.subresourceUris.recordings,
                inmpId:  request.body.impId,
                speId: request.body.speId
            }
            let registrar = db.collection('calls').doc(call.sid).set(dataCall)
            response.send(call);
        }).catch( error => {
            response.send(error);
        });
    });
});

async function registCall (call) {
    const db = admin.firestore();
    let dataCall = {
        sid: call.sid,
        uri: call.uri,
        recordings: call.subresourceUris.recordings,
        inmpId:  request.body.impId,
        speId: request.body.speId
    }
    const registrar = await db.collection('calls').doc(call.sid).set(dataCall)
}

exports.agregarNumero = functions.https.onRequest((request, response) => {
    cors( request, response, () => {
        response.setHeader('Access-Control-Allow-Origin', '*');
        const VoiceResponse = require('twilio').twiml.VoiceResponse;

        const  respuesta = new VoiceResponse();
        respuesta.say({
            voice: "woman",
            language: "es-MX"
        },"Espere, procesando llamada");
        const dial = respuesta.dial();
        dial.number(request.query.destino);
        //console.log(respuesta.toString());
        response.send(respuesta.toString());
    });
});

// FUnciones Firebase Messagein

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

exports.regAdmin = functions.https.onRequest((request, response) => {
    cors( request, response, () =>{
        response.setHeader('Access-Control-Allow-Origin', '*');
        admin.auth().createUser({
            email: request.body.email,
            emailVerified: true,            
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