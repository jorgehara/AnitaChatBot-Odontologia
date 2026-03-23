import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
});

export interface ExtractedIntent {
    option?: '1' | '2' | '3' | '4';
    name?: string;
    timePreference?: string;
}

export interface ExtractedDateIntent {
    date?: string; // Formato YYYY-MM-DD
    dayOfWeek?: string; // 'lunes', 'martes', etc.
    dayNumber?: number; // 25, 26, etc.
    timePreference?: 'mañana' | 'tarde' | 'any';
    rawMessage: string;
}

/**
 * Extrae la intención del usuario cuando envía múltiples datos en un solo mensaje.
 * Ejemplo: "1 Juan Pérez martes 18" → { option: "1", name: "Juan Pérez", timePreference: "martes 18" }
 */
export async function extractUserIntent(message: string): Promise<ExtractedIntent> {
    console.log(`[INTENT_EXTRACTOR] Procesando mensaje: "${message}"`);

    const prompt = `Analiza este mensaje de un paciente que está reservando un turno odontológico.

Mensaje: "${message}"

Extrae SOLO la información que esté PRESENTE en el mensaje:
- option: número de opción (1, 2 o 3) si existe al inicio del mensaje
- name: nombre completo del paciente si existe (2 o más palabras que parecen un nombre)
- timePreference: preferencia de día/horario si existe (ej: "martes 18", "mañana", "tarde", "lunes a las 15")

IMPORTANTE:
- Si solo dice un número (ej: "1"), NO inventes un nombre
- Si el mensaje es solo texto sin número, NO inventes un option
- timePreference debe ser específico de tiempo (día de semana, hora, "mañana", "tarde")

Responde SOLO con JSON válido (sin markdown, sin explicaciones):
{
  "option": "1" | "2" | "3" | null,
  "name": string | null,
  "timePreference": string | null
}`;

    try {
        const response = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 200,
            messages: [{
                role: 'user',
                content: prompt,
            }],
        });

        const content = response.content[0];
        if (content.type !== 'text') {
            console.warn('[INTENT_EXTRACTOR] Haiku no devolvió texto');
            return {};
        }

        // Limpiar respuesta (por si viene con markdown)
        const cleanedText = content.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        const parsed = JSON.parse(cleanedText);
        console.log('[INTENT_EXTRACTOR] Parsed:', parsed);

        return {
            option: parsed.option || undefined,
            name: parsed.name || undefined,
            timePreference: parsed.timePreference || undefined,
        };
    } catch (error) {
        console.error('[INTENT_EXTRACTOR] Error:', error);
        // Fallback: solo extraer el primer carácter si es 1, 2, 3 o 4
        const firstChar = message.trim()[0];
        if (firstChar === '1' || firstChar === '2' || firstChar === '3' || firstChar === '4') {
            return { option: firstChar as '1' | '2' | '3' | '4' };
        }
        return {};
    }
}

/**
 * Extrae información de fecha del mensaje del usuario usando Claude Haiku.
 * Ejemplos:
 * - "martes 25" → { dayOfWeek: 'martes', dayNumber: 25 }
 * - "25 de marzo por la tarde" → { dayNumber: 25, timePreference: 'tarde' }
 * - "el jueves que viene" → { dayOfWeek: 'jueves' }
 */
export async function extractDateIntent(message: string): Promise<ExtractedDateIntent> {
    console.log(`[DATE_EXTRACTOR] Procesando mensaje: "${message}"`);

    const prompt = `Analiza este mensaje de un paciente que necesita un turno odontológico.

Mensaje: "${message}"

Extrae información de FECHA Y HORA si está presente:
- dayOfWeek: día de la semana si lo menciona ('lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo')
- dayNumber: número de día del mes si lo menciona (ej: 25, 26, 27)
- timePreference: 'mañana' si menciona mañana/mañanita/am, 'tarde' si menciona tarde/tardecita/pm, o 'any' si no especifica

IMPORTANTE:
- Si dice "mañana" refiriéndose al día siguiente (no al horario), NO es timePreference, es dayOfWeek contextual
- Si solo dice un día de semana sin número, extraer el dayOfWeek
- Si dice "hoy" o "ahora" → no extraer fecha (devolver nulls)
- NO inventes fechas que no están en el mensaje

Responde SOLO con JSON válido (sin markdown, sin explicaciones):
{
  "dayOfWeek": string | null,
  "dayNumber": number | null,
  "timePreference": "mañana" | "tarde" | "any" | null
}`;

    try {
        const response = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 200,
            messages: [{
                role: 'user',
                content: prompt,
            }],
        });

        const content = response.content[0];
        if (content.type !== 'text') {
            console.warn('[DATE_EXTRACTOR] Haiku no devolvió texto');
            return { rawMessage: message };
        }

        const cleanedText = content.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleanedText);
        console.log('[DATE_EXTRACTOR] Parsed:', parsed);

        // Construir fecha YYYY-MM-DD si tenemos suficiente info
        let constructedDate: string | undefined;
        if (parsed.dayNumber) {
            const now = new Date();
            const year = now.getFullYear();
            const month = now.getMonth() + 1; // Asumimos mes actual por defecto
            constructedDate = `${year}-${String(month).padStart(2, '0')}-${String(parsed.dayNumber).padStart(2, '0')}`;
        }

        return {
            date: constructedDate,
            dayOfWeek: parsed.dayOfWeek || undefined,
            dayNumber: parsed.dayNumber || undefined,
            timePreference: parsed.timePreference || 'any',
            rawMessage: message,
        };
    } catch (error) {
        console.error('[DATE_EXTRACTOR] Error:', error);
        return { rawMessage: message };
    }
}
