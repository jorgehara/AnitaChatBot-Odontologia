import { addKeyword } from '@builderbot/bot';
import { BaileysProvider as Provider } from '@builderbot/provider-baileys';
import { newPatientFlow } from './newPatient.flow';
import { controlFlow } from './control.flow';
import { extractUserIntent } from '../utils/intentExtractor';

const WELCOME_KEYWORDS = [
    'hi', 'hello', 'hola', 'buenas', 'buenos días', 'buenas tardes',
    'buenas noches', 'ho', 'ola', 'ole', 'turnos', 'turno',
].map(k => k.toLowerCase()) as [string, ...string[]];

export const mainMenuFlow = addKeyword<Provider, IDBDatabase>(WELCOME_KEYWORDS)
    .addAction(async (ctx, { state }) => {
        console.log(`[MENU] Mensaje recibido de ${ctx.from}: "${ctx.body}"`);
        const clientName = await state.get('clientName');
        const slotsCache = await state.get('slotsCache');
        if (clientName || slotsCache) {
            console.log('[MENU] Flujo activo detectado — no interrumpir');
            return;
        }
    })
    .addAnswer(
        '🦷 *¡Bienvenido al consultorio de la Od. Melina Villalba!* 🦷\n\n' +
        'Soy ANITA, tu asistente virtual 😊\n\n' +
        '¿En qué puedo ayudarte?\n\n' +
        '1️⃣ Primera consulta (ATM / Bruxismo)\n' +
        '2️⃣ Control o seguimiento\n' +
        '3️⃣ Tengo dolor / urgencia\n\n' +
        '_Respondé con el número de tu opción_',
        { capture: true },
        async (ctx, { gotoFlow, flowDynamic, state }) => {
            const userMessage = ctx.body.trim();
            console.log(`[MENU] Mensaje recibido: "${userMessage}"`);

            // Extraer intención con Claude Haiku (detecta opción + nombre + preferencia horaria)
            const intent = await extractUserIntent(userMessage);
            console.log(`[MENU] Intención extraída:`, intent);

            const option = intent.option;

            if (!option) {
                await flowDynamic('❌ Opción no válida. Por favor, respondé con *1*, *2* o *3*.');
                return;
            }

            // Si el usuario incluyó su nombre o preferencia, guardarlos en el state
            if (intent.name) {
                console.log(`[MENU] → Nombre detectado: "${intent.name}"`);
                await state.update({ clientName: intent.name });
            }
            if (intent.timePreference) {
                console.log(`[MENU] → Preferencia horaria detectada: "${intent.timePreference}"`);
                await state.update({ timePreference: intent.timePreference });
            }

            if (option === '1') {
                console.log('[MENU] → Derivando a newPatientFlow');
                return gotoFlow(newPatientFlow);
            }
            if (option === '2') {
                console.log('[MENU] → Derivando a controlFlow');
                return gotoFlow(controlFlow);
            }

            if (option === '3') {
                const emergencyPhone = process.env.EMERGENCY_PHONE_NUMBER || 'XXXXXXXXXX';
                await flowDynamic(
                    '😟 Entiendo que estás con dolor.\n\n' +
                    'Para casos de urgencia, comunicate directamente con la Dra. Villalba:\n\n' +
                    `📞 *${emergencyPhone}*\n\n` +
                    '¡Esperamos poderte atender pronto! 💙'
                );
                return;
            }

            await flowDynamic('❌ Opción no válida. Por favor, respondé con *1*, *2* o *3*.');
        }
    );
