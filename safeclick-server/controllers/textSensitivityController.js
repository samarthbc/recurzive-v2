const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require('axios');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Model configuration with fallback
const NVIDIA_MODEL = 'meta/llama-4-maverick-17b-128e-instruct';
const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const GEMINI_PRIMARY_MODEL = 'gemini-2.0-flash-exp';
const GEMINI_FALLBACK_MODEL = 'gemini-1.5-flash';

// Helper function to call NVIDIA Llama model
async function callNvidiaModel(prompt) {
    const headers = {
        "Authorization": `Bearer ${process.env.NVIDIA_API_KEY}`,
        "Accept": "application/json",
        "Content-Type": "application/json"
    };

    const payload = {
        "model": NVIDIA_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 2048,
        "temperature": 0.3,
        "top_p": 1.00,
        "frequency_penalty": 0.00,
        "presence_penalty": 0.00,
        "stream": false
    };

    const response = await axios.post(NVIDIA_API_URL, payload, { headers });
    return response.data.choices[0].message.content;
}

// Helper function to get Gemini model with fallback
async function getGeminiModel(preferPrimary = true) {
    try {
        if (preferPrimary) {
            console.log(`[MODEL] Attempting to use Gemini primary model: ${GEMINI_PRIMARY_MODEL}`);
            return genAI.getGenerativeModel({ model: GEMINI_PRIMARY_MODEL });
        } else {
            console.log(`[MODEL] Using Gemini fallback model: ${GEMINI_FALLBACK_MODEL}`);
            return genAI.getGenerativeModel({ model: GEMINI_FALLBACK_MODEL });
        }
    } catch (err) {
        console.log(`[MODEL] Error getting Gemini model, using fallback: ${err.message}`);
        return genAI.getGenerativeModel({ model: GEMINI_FALLBACK_MODEL });
    }
}

exports.analyzeSensitivity = async (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "Text is required" });

    const prompt = `
You are a sensitive information detector and redactor. Analyze the following text and:

1. Calculate a sensitivity score from 0-100 (0 = no sensitive info, 100 = highly sensitive)
2. Identify sensitive information like:
   - Personal identifiers (SSN, phone numbers, email addresses, names)
   - Financial information (credit card numbers, bank accounts)
   - Medical information
   - Passwords or API keys
   - Private addresses
   - Any other personally identifiable information (PII)

3. Provide the text with all sensitive information redacted using [REDACTED] placeholders

Return your response in this exact JSON format:
{
  "sensitivityScore": <number 0-100>,
  "redactedText": "<text with sensitive info replaced with [REDACTED]>"
}

Text to analyze:
"""${text}"""
`;

    // Try NVIDIA Llama model first (primary)
    try {
        console.log(`[SENSITIVITY] Attempting primary model: ${NVIDIA_MODEL}`);
        const response = await callNvidiaModel(prompt);
        
        // Parse JSON response
        let result;
        try {
            // Extract JSON from response if it's wrapped in other text
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                result = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error("No JSON found in response");
            }
        } catch (parseErr) {
            // Fallback parsing if JSON is malformed
            const scoreMatch = response.match(/sensitivityScore["\s]*:\s*(\d+)/i);
            const redactedMatch = response.match(/redactedText["\s]*:\s*["']([^"']*)["']/i);
            
            result = {
                sensitivityScore: scoreMatch ? parseInt(scoreMatch[1], 10) : 0,
                redactedText: redactedMatch ? redactedMatch[1] : text
            };
        }

        console.log(`[SENSITIVITY] Analysis complete using NVIDIA Llama model: ${result.sensitivityScore}% sensitivity`);

        res.json({
            textPreview: text.slice(0, 100) + (text.length > 100 ? "..." : ""),
            sensitivityScore: result.sensitivityScore,
            redactedText: result.redactedText
        });
        return;
    } catch (err) {
        console.error('[SENSITIVITY-ERROR] NVIDIA Llama model failed:', err.message);
    }

    // Fallback to Gemini primary model
    try {
        console.log('[SENSITIVITY-FALLBACK] Retrying with Gemini primary model...');
        const model = await getGeminiModel(true);
        const result = await model.generateContent(prompt);
        const response = await result.response.text();
        
        // Parse JSON response
        let parsedResult;
        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsedResult = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error("No JSON found in response");
            }
        } catch (parseErr) {
            // Fallback parsing if JSON is malformed
            const scoreMatch = response.match(/sensitivityScore["\s]*:\s*(\d+)/i);
            const redactedMatch = response.match(/redactedText["\s]*:\s*["']([^"']*)["']/i);
            
            parsedResult = {
                sensitivityScore: scoreMatch ? parseInt(scoreMatch[1], 10) : 0,
                redactedText: redactedMatch ? redactedMatch[1] : text
            };
        }

        console.log(`[SENSITIVITY] Analysis complete using Gemini primary model: ${parsedResult.sensitivityScore}% sensitivity`);

        res.json({
            textPreview: text.slice(0, 100) + (text.length > 100 ? "..." : ""),
            sensitivityScore: parsedResult.sensitivityScore,
            redactedText: parsedResult.redactedText
        });
        return;
    } catch (err) {
        console.error('[SENSITIVITY-ERROR] Gemini primary model failed:', err.message);
    }

    // Final fallback to Gemini fallback model
    try {
        console.log('[SENSITIVITY-FALLBACK] Retrying with Gemini fallback model...');
        const model = await getGeminiModel(false);
        const result = await model.generateContent(prompt);
        const response = await result.response.text();
        
        // Parse JSON response
        let parsedResult;
        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsedResult = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error("No JSON found in response");
            }
        } catch (parseErr) {
            // Fallback parsing if JSON is malformed
            const scoreMatch = response.match(/sensitivityScore["\s]*:\s*(\d+)/i);
            const redactedMatch = response.match(/redactedText["\s]*:\s*["']([^"']*)["']/i);
            
            parsedResult = {
                sensitivityScore: scoreMatch ? parseInt(scoreMatch[1], 10) : 0,
                redactedText: redactedMatch ? redactedMatch[1] : text
            };
        }

        console.log(`[SENSITIVITY] Analysis complete using Gemini fallback model: ${parsedResult.sensitivityScore}% sensitivity`);

        res.json({
            textPreview: text.slice(0, 100) + (text.length > 100 ? "..." : ""),
            sensitivityScore: parsedResult.sensitivityScore,
            redactedText: parsedResult.redactedText
        });
    } catch (fallbackErr) {
        console.error('[SENSITIVITY-FALLBACK-ERROR] All models failed:', fallbackErr.message);
        res.status(500).json({ error: "All sensitivity analysis models failed. Please try again later." });
    }
};
