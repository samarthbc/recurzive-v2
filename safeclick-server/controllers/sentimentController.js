const axios = require('axios');

exports.analyzeSentiment = async (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Text is required' });

    try {
        console.log('[1] Sending text to Groq for sentiment analysis...');

        const response = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            {
                model: "openai/gpt-oss-20b", // or ""
                messages: [
                    {
                        role: "system",
                        content: "You are an expert sentiment and content analyzer."
                    },
                    {
                        role: "user",
                        content: `
Here is a piece of text. Tell me:
What is the sentiment? No preamble.

Text:
"""${text}"""
`
                    }
                ],
                temperature: 0.3
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const reply = response.data.choices[0].message.content.trim();
        console.log('[2] Groq reply:', reply);

        res.json({
            summary: reply
        });
    } catch (err) {
        console.error('[ERROR] Groq sentiment analysis failed:', err.message);
        if (err.response) console.error(err.response.data);
        res.status(500).json({
            error: 'Failed to analyze sentiment',
            details: err.message
        });
    }
};
