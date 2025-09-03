const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
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
        "max_tokens": 512,
        "temperature": 1.00,
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

// STEP 1: Extract claims from input text
async function extractClaims(text) {
    const prompt = `
Extract clear factual claims from this text. Return them as a plain numbered list:
"""${text}"""
    `;

    // Try NVIDIA Llama model first (primary)
    try {
        console.log(`[1] Extracting claims with NVIDIA model: ${NVIDIA_MODEL}`);
        const response = await callNvidiaModel(prompt);
        const claims = response
            .split('\n')
            .filter(line => /^\d+[\).]/.test(line))
            .map(line => line.replace(/^\d+[\).\s]*/, '').trim());

        console.log(`[1.1] Found ${claims.length} claims using NVIDIA Llama model.`);
        return claims;
    } catch (err) {
        console.error('[1-ERROR] NVIDIA Llama model failed:', err.message);
    }

    // Fallback to Gemini primary model
    try {
        console.log('[1-FALLBACK] Retrying with Gemini primary model...');
        const model = await getGeminiModel(true);
        const result = await model.generateContent(prompt);
        const raw = await result.response.text();
        const claims = raw
            .split('\n')
            .filter(line => /^\d+[\).]/.test(line))
            .map(line => line.replace(/^\d+[\).\s]*/, '').trim());

        console.log(`[1.1] Found ${claims.length} claims using Gemini primary model.`);
        return claims;
    } catch (err) {
        console.error('[1-ERROR] Gemini primary model failed:', err.message);
    }

    // Final fallback to Gemini fallback model
    try {
        console.log('[1-FALLBACK] Retrying with Gemini fallback model...');
        const model = await getGeminiModel(false);
        const result = await model.generateContent(prompt);
        const raw = await result.response.text();
        const claims = raw
            .split('\n')
            .filter(line => /^\d+[\).]/.test(line))
            .map(line => line.replace(/^\d+[\).\s]*/, '').trim());

        console.log(`[1.1] Found ${claims.length} claims using Gemini fallback model.`);
        return claims;
    } catch (fallbackErr) {
        console.error('[1-FALLBACK-ERROR] All models failed:', fallbackErr.message);
        throw new Error('All claim extraction models failed. Please try again later.');
    }
}

// STEP 2: Search for each claim
async function searchWeb(claim) {
    try {
        console.log(`[2] Searching web for: "${claim}"`);
        const url = 'https://www.googleapis.com/customsearch/v1';
        const params = {
            key: process.env.GOOGLE_SEARCH_API_KEY,
            cx: process.env.GOOGLE_SEARCH_ENGINE_ID,
            q: claim,
            num: 5
        };

        const { data } = await axios.get(url, { params });
        const items = data.items || [];

        console.log(`[2.1] Found ${items.length} results for claim.`);
        return items.map(item => ({
            title: item.title,
            link: item.link,
            snippet: item.snippet
        }));
    } catch (err) {
        console.error('[2-ERROR] Google search failed:', err.message);
        if (err.response) console.error(err.response.data);
        throw new Error('Google Search API failed');
    }
}

// STEP 3: Validate claim against search results
async function validateClaimWithGemini(claim, snippets) {
    const prompt = `
You are an AI fact-checking assistant.

A claim has been made, and here are 3-5 web snippets found via search engines.
Decide whether the sources support the claim.

Respond with ONLY "true" or "false".

Claim: "${claim}"

Sources:
${snippets.map((s, i) => `${i + 1}. ${s.snippet}`).join('\n')}

Answer:
    `;

    // Try NVIDIA Llama model first (primary)
    try {
        console.log(`[3] Validating claim with NVIDIA model: ${NVIDIA_MODEL}`);
        const response = await callNvidiaModel(prompt);
        console.log(`[3] NVIDIA Llama decision:`, response);
        return response.toLowerCase().includes("true");
    } catch (err) {
        console.error('[3-ERROR] NVIDIA Llama validation failed:', err.message);
    }

    // Fallback to Gemini primary model
    try {
        console.log('[3-FALLBACK] Retrying validation with Gemini primary model...');
        const model = await getGeminiModel(true);
        const result = await model.generateContent(prompt);
        const answer = await result.response.text();
        console.log(`[3] Gemini primary decision:`, answer);
        return answer.toLowerCase().includes("true");
    } catch (err) {
        console.error('[3-ERROR] Gemini primary validation failed:', err.message);
    }

    // Final fallback to Gemini fallback model
    try {
        console.log('[3-FALLBACK] Retrying validation with Gemini fallback model...');
        const model = await getGeminiModel(false);
        const result = await model.generateContent(prompt);
        const answer = await result.response.text();
        console.log(`[3] Gemini fallback decision:`, answer);
        return answer.toLowerCase().includes("true");
    } catch (fallbackErr) {
        console.error('[3-FALLBACK-ERROR] All validation models failed:', fallbackErr.message);
        return null; // fallback to unknown
    }
}

// STEP 4: Final API endpoint
exports.factCheck = async (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Text is required' });

    try {
        console.log('[0] Starting full fact-checking process...');
        const claims = await extractClaims(text);
        const results = [];

        for (const claim of claims) {
            const sources = await searchWeb(claim);
            const usedSnippets = sources.slice(0, 5);

            const isLikelyTrue = await validateClaimWithGemini(claim, usedSnippets);

            results.push({
                claim,
                isLikelyTrue,
                supportingSources: usedSnippets.map(s => ({
                    title: s.title,
                    link: s.link
                }))
            });
        }

        console.log('[4] Fact-check complete.');
        res.json({ claims: results });
    } catch (err) {
        console.error('[FATAL]', err.message);
        res.status(500).json({
            error: 'Fact-checking failed',
            details: err.message
        });
    }
};
