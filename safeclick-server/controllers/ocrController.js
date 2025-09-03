const fs = require('fs');
const path = require('path');
const decompress = require('decompress');
const axios = require('axios');

const NVAI_URL = "https://ai.api.nvidia.com/v1/cv/nvidia/nemoretriever-ocr-v1";

// AI Model configuration - using only NVIDIA Llama model
const NVIDIA_MODEL = 'meta/llama-4-maverick-17b-128e-instruct';
const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

// Helper function to process OCR with NVIDIA NemoRetriever OCR v1
async function processOCR(imageBuffer) {
    // Check image size limit (180KB for base64)
    const imageB64 = Buffer.from(imageBuffer).toString('base64');
    if (imageB64.length > 180000) {
        throw new Error("Image too large. Maximum size is 180KB for base64 encoding.");
    }

    const headers = {
        "Authorization": `Bearer ${process.env.NVIDIA_IMG_API_KEY}`,
        "Accept": "application/json",
        "Content-Type": "application/json"
    };

    const payload = {
        "input": [
            {
                "type": "image_url",
                "url": `data:image/jpeg;base64,${imageB64}`
            }
        ]
    };

    try {
        console.log('[OCR] Making OCR request to NVIDIA NemoRetriever...');
        console.log('[OCR] Request headers:', JSON.stringify(headers, null, 2));
        console.log('[OCR] Image size (base64):', imageB64.length, 'characters');
        
        const response = await axios.post(NVAI_URL, payload, { 
            headers,
            responseType: 'json'
        });

        console.log('[OCR] OCR request successful, response status:', response.status);
        console.log('[OCR] Full OCR API response:', JSON.stringify(response.data, null, 2));
        return response.data;
    } catch (error) {
        console.error('[OCR] OCR request failed:', error.message);
        if (error.response) {
            console.error('[OCR] Response status:', error.response.status);
            console.error('[OCR] Response data:', error.response.data);
        }
        throw new Error(`NVIDIA OCR API error: ${error.message}`);
    }
}

// Helper function to extract text from NemoRetriever OCR response
function extractTextFromNemoResponse(ocrResponse) {
    try {
        // Extract text from the new API response structure
        if (ocrResponse && ocrResponse.data && Array.isArray(ocrResponse.data)) {
            let extractedText = '';
            
            for (const item of ocrResponse.data) {
                if (item.text_detections && Array.isArray(item.text_detections)) {
                    for (const detection of item.text_detections) {
                        if (detection.text_prediction && detection.text_prediction.text) {
                            extractedText += detection.text_prediction.text + ' ';
                        }
                    }
                }
            }
            
            const finalText = extractedText.trim();
            console.log('[OCR] Extracted text from response:', finalText);
            return finalText;
        }
        
        // Fallback: check old response format
        if (ocrResponse && ocrResponse.choices && ocrResponse.choices[0]) {
            const content = ocrResponse.choices[0].message.content;
            console.log('[OCR] Extracted text from legacy format:', content);
            return content;
        }
        
        // If no text found, return empty string
        console.log('[OCR] No text found in OCR response');
        return '';
    } catch (error) {
        console.error('[OCR] Error extracting text from response:', error.message);
        return '';
    }
}

// Legacy function - kept for compatibility (not used with new API)
async function extractTextFromResults(zipBuffer) {
    const tempDir = path.join(__dirname, '../temp');
    const zipPath = path.join(tempDir, `ocr_${Date.now()}.zip`);
    const extractDir = path.join(tempDir, `extract_${Date.now()}`);

    try {
        // Ensure temp directory exists
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        // Write zip file
        fs.writeFileSync(zipPath, zipBuffer);

        // Extract zip
        await decompress(zipPath, extractDir);

        // Look for text files in extracted content
        const files = fs.readdirSync(extractDir);
        let extractedText = '';
        let detectionResults = null;

        for (const file of files) {
            const filePath = path.join(extractDir, file);
            const stat = fs.statSync(filePath);

            if (stat.isFile()) {
                if (file.endsWith('.txt')) {
                    // Read text file
                    extractedText += fs.readFileSync(filePath, 'utf8') + '\n';
                } else if (file.endsWith('.json')) {
                    // Read detection results
                    const jsonContent = fs.readFileSync(filePath, 'utf8');
                    try {
                        detectionResults = JSON.parse(jsonContent);
                    } catch (e) {
                        console.log('Could not parse JSON file:', file);
                    }
                }
            }
        }

        return {
            extractedText: extractedText.trim(),
            detectionResults,
            files
        };

    } finally {
        // Cleanup temp files
        try {
            if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
            if (fs.existsSync(extractDir)) {
                const files = fs.readdirSync(extractDir);
                for (const file of files) {
                    fs.unlinkSync(path.join(extractDir, file));
                }
                fs.rmdirSync(extractDir);
            }
        } catch (e) {
            console.log('Cleanup error:', e.message);
        }
    }
}

exports.performOCR = async (req, res) => {
    try {
        // Check if image is provided
        if (!req.file && !req.body.imageUrl && !req.body.imageBase64) {
            return res.status(400).json({ 
                error: "Image is required. Provide as file upload, imageUrl, or imageBase64" 
            });
        }

        let imageBuffer;

        if (req.file) {
            // Handle file upload
            imageBuffer = req.file.buffer;
        } else if (req.body.imageUrl) {
            // Handle image URL
            const imageResponse = await axios.get(req.body.imageUrl, { 
                responseType: 'arraybuffer' 
            });
            imageBuffer = Buffer.from(imageResponse.data);
        } else if (req.body.imageBase64) {
            // Handle base64 image
            const base64Data = req.body.imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
            imageBuffer = Buffer.from(base64Data, 'base64');
        }

        console.log('[OCR] Starting OCR processing with NVIDIA NemoRetriever...');

        // Process OCR directly with base64 image
        console.log('[OCR] Processing OCR...');
        const ocrResponse = await processOCR(imageBuffer);
        console.log('[OCR] OCR processing complete, extracting results...');

        // Extract text from response
        const extractedText = extractTextFromNemoResponse(ocrResponse);
        console.log(`[OCR] Text extraction complete. Found ${extractedText.length} characters.`);

        const results = {
            extractedText: extractedText,
            detectionResults: ocrResponse
        };

        // Analyze extracted text for sensitive content
        let sensitivityAnalysis = null;
        if (results.extractedText && results.extractedText.trim().length > 0) {
            console.log('[OCR] Analyzing extracted text for sensitive content...');
            sensitivityAnalysis = await analyzeSensitiveContent(results.extractedText);
            console.log(`[OCR] Sensitivity analysis complete. Has sensitive content: ${sensitivityAnalysis.hasSensitiveContent}`);
        }

        res.json({
            success: true,
            extractedText: results.extractedText,
            detectionResults: results.detectionResults,
            sensitivityAnalysis: sensitivityAnalysis,
            metadata: {
                textLength: results.extractedText.length,
                sensitivityChecked: sensitivityAnalysis !== null,
                model: 'nemoretriever-ocr-v1'
            }
        });

    } catch (error) {
        console.error('[OCR-ERROR] OCR processing failed:', error.message);
        
        // Provide more specific error messages
        if (error.response) {
            const status = error.response.status;
            const message = error.response.data?.message || error.message;
            
            if (status === 401) {
                return res.status(500).json({ 
                    error: "NVIDIA API authentication failed. Check API key." 
                });
            } else if (status === 429) {
                return res.status(429).json({ 
                    error: "Rate limit exceeded. Please try again later." 
                });
            } else {
                return res.status(500).json({ 
                    error: `NVIDIA API error: ${message}` 
                });
            }
        }
        
        res.status(500).json({ 
            error: "OCR processing failed. Please try again later.",
            details: error.message 
        });
    }
};

// Helper function to call NVIDIA Llama model (copied from detectController.js)
async function callNvidiaModel(prompt) {
    const headers = {
        "Authorization": `Bearer ${process.env.NVIDIA_API_KEY}`,
        "Accept": "application/json",
        "Content-Type": "application/json"
    };

    const payload = {
        "model": NVIDIA_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 1024,
        "temperature": 0.3,
        "top_p": 1.00,
        "frequency_penalty": 0.00,
        "presence_penalty": 0.00,
        "stream": false
    };

    const response = await axios.post(NVIDIA_API_URL, payload, { headers });
    return response.data;
}

// Helper function to analyze OCR text for sensitive information
async function analyzeSensitiveContent(text) {
    if (!text || text.trim().length === 0) {
        return {
            hasSensitiveContent: false,
            sensitiveItems: [],
            confidenceScore: 0
        };
    }

    const prompt = `Analyze the following text for sensitive information. Look for:
    - Personal Identifiable Information (PII): names, addresses, phone numbers, email addresses, SSN, etc.
    - Financial information: credit card numbers, bank account numbers, routing numbers
    - Medical information: patient data, medical record numbers, health conditions
    - Government IDs: passport numbers, driver's license numbers, tax IDs
    - Passwords, API keys, or authentication tokens
    - Any other confidential or sensitive data

    Text to analyze:
    "${text}"

    Respond with a JSON object containing:
    - hasSensitiveContent: boolean
    - sensitiveItems: array of strings describing what sensitive items were found
    - confidenceScore: number from 0-100 indicating confidence in the analysis

    Example response:
    {
        "hasSensitiveContent": true,
        "sensitiveItems": ["Email address", "Phone number"],
        "confidenceScore": 85
    }`;

    try {
        // Use only NVIDIA Llama model
        console.log('[OCR] Analyzing sensitivity with NVIDIA Llama model...');
        const nvidiaResponse = await callNvidiaModel(prompt);
        
        if (nvidiaResponse && nvidiaResponse.choices && nvidiaResponse.choices[0]) {
            const content = nvidiaResponse.choices[0].message.content;
            console.log('[OCR] NVIDIA model response:', content);
            
            try {
                const parsed = JSON.parse(content);
                if (parsed.hasSensitiveContent !== undefined) {
                    console.log('[OCR] Successfully parsed NVIDIA response');
                    return {
                        hasSensitiveContent: parsed.hasSensitiveContent || false,
                        sensitiveItems: parsed.sensitiveItems || [],
                        confidenceScore: parsed.confidenceScore || 0
                    };
                }
            } catch (parseError) {
                console.log('[OCR] Failed to parse NVIDIA JSON response:', parseError.message);
                // Try to extract basic info from unparsed response
                const hasKeywords = /sensitive|confidential|personal|private|pii|ssn|credit|password|email|phone/i.test(content);
                return {
                    hasSensitiveContent: hasKeywords,
                    sensitiveItems: hasKeywords ? ["Potentially sensitive content detected"] : [],
                    confidenceScore: hasKeywords ? 50 : 0
                };
            }
        }
        
    } catch (error) {
        console.error('[OCR] Error in NVIDIA sensitivity analysis:', error.message);
    }
    
    // Default fallback
    return {
        hasSensitiveContent: false,
        sensitiveItems: [],
        confidenceScore: 0
    };
}

