// Filename: api/chat.js (Vercel Serverless Function to Proxy Gemini API)

/**
 * This function acts as a secure proxy.
 * It takes a request from the client and forwards it to the Gemini API,
 * using the secret GEMINI_API_KEY stored only on the server (Vercel environment).
 */
export default async function handler(req, res) {
    // 1. Get API Key securely from Vercel environment variables
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (!GEMINI_API_KEY) {
        return res.status(500).json({ error: "Server configuration error: Gemini API Key not found." });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const payload = req.body;
        
        // 2. Forward the request to the official Google Gemini API endpoint
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`;
        
        const geminiResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await geminiResponse.json();

        // 3. Return the response directly to the client
        if (geminiResponse.ok) {
            res.status(200).json(data);
        } else {
            // Forward API errors (like invalid prompt, etc.)
            res.status(geminiResponse.status).json(data);
        }
    } catch (error) {
        console.error("Proxy Error:", error);
        res.status(500).json({ error: 'Internal server error during API proxy' });
    }
}