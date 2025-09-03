const axios = require('axios');

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY
const invokeUrl = "https://ai.api.nvidia.com/v1/cv/hive/ai-generated-image-detection";

exports.detectAIFromImageUrl = async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'Image URL is required' });
    
    try {
        console.log('[1] Downloading image from URL:', url);
        const imageType = (await import('image-type')).default;
        const imageRes = await axios.get(url, {
            responseType: 'arraybuffer',
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        const buffer = Buffer.from(imageRes.data);
        console.log('[DEBUG] Buffer length:', buffer.length);
        console.log('[DEBUG] imageType function:', typeof imageType);
        
        let type = await imageType(buffer);
        console.log('[DEBUG] Detected type:', type);
        
        // Handle SVG files explicitly since image-type doesn't detect them
        if (!type) {
            const bufferString = buffer.toString('utf8', 0, Math.min(buffer.length, 100));
            if (bufferString.includes('<svg') || bufferString.includes('<?xml') && bufferString.includes('svg')) {
                console.log('[DEBUG] Detected SVG file manually');
                type = { ext: 'svg', mime: 'image/svg+xml' };
            } else {
                console.log('[DEBUG] No type detected and not SVG');
                return res.status(400).json({ error: 'Unable to detect image type from buffer.' });
            }
        }
        
        if (!type.mime) {
            console.log('[DEBUG] Type detected but no mime property:', type);
            return res.status(400).json({ error: 'Image type detected but no MIME type available.' });
        }
        
        console.log('[DEBUG] MIME type:', type.mime);
        
        if (!type.mime.startsWith('image/')) {
            return res.status(400).json({ error: 'Invalid image format - not an image MIME type.' });
        }
        
        // Check if the image format is supported by NVIDIA API (only PNG, JPG, JPEG)
        const supportedFormats = ['image/png', 'image/jpeg', 'image/jpg'];
        if (!supportedFormats.includes(type.mime.toLowerCase())) {
            console.log('[DEBUG] Unsupported image format for NVIDIA API:', type.mime);
            return res.status(400).json({ 
                error: 'Unsupported image format', 
                details: `NVIDIA API only supports PNG, JPG, JPEG formats. Got: ${type.mime}`,
                skipAnalysis: true
            });
        }

        const imageBase64 = buffer.toString('base64');
        if (imageBase64.length > 180000) {
            return res.status(400).json({ error: 'Image too large for direct upload. Use NVIDIA assets API.' });
        }

        console.log('[2] Preparing request to NVIDIA AI-Generated Image Detection...');

        const payload = {
            input: [`data:${type.mime};base64,${imageBase64}`]
        };

        const headers = {
            Authorization: `Bearer ${NVIDIA_API_KEY}`,
            Accept: "application/json",
            "Content-Type": "application/json"
        };

        const response = await axios.post(invokeUrl, payload, {
            headers: headers
        });

        const data = response.data.data?.[0];
        if (!data) {
            throw new Error('Invalid response format from NVIDIA API');
        }

        const aiLikelihood = Math.round(data.is_ai_generated * 100);
        const possibleSources = data.possible_sources || {};
        
        // Get top 3 possible sources
        const sortedSources = Object.entries(possibleSources)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 3)
            .map(([source, confidence]) => ({
                source,
                confidence: Math.round(confidence * 100 * 100) / 100 // Round to 2 decimal places
            }));

        console.log('[3] NVIDIA Response - AI Likelihood:', aiLikelihood + '%');
        console.log('[3] Top 3 Sources:', sortedSources);

        res.json({
            aiLikelihoodPercent: aiLikelihood,
            topSources: sortedSources,
            rawModelReply: `AI Generated: ${aiLikelihood}% | Top Sources: ${sortedSources.map(s => `${s.source} (${s.confidence}%)`).join(', ')}`
        });

    } catch (err) {
        console.error('[ERROR] Image analysis via NVIDIA failed:', err.message);
        if (err.response?.data) {
            console.error(err.response.data);
        }
        res.status(500).json({ error: 'Image detection failed', details: err.message });
    }
};
