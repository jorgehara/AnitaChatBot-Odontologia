import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
});

export interface ExtractedIntent {
    option?: '1' | '2' | '3';
    name?: string;
    timePreference?: string;
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
        // Fallback: solo extraer el primer carácter si es 1, 2 o 3
        const firstChar = message.trim()[0];
        if (firstChar === '1' || firstChar === '2' || firstChar === '3') {
            return { option: firstChar as '1' | '2' | '3' };
        }
        return {};
    }
}
