
// GEMINI_API_KEY is now loaded from config.js
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

// Queue to manage AI requests sequentially
const requestQueue = [];
let isProcessingQueue = false;

/**
 * Adds an SOS analysis request to the queue.
 * @param {Object} sosData - The SOS message object.
 * @returns {Promise<Object>} - The AI analysis result.
 */
function analyzeSOSWithGemini(sosData) {
    return new Promise((resolve, reject) => {
        requestQueue.push({ sosData, resolve, reject });
        processQueue();
    });
}

/**
 * Processes the queue one by one with a delay to respect rate limits.
 */
async function processQueue() {
    if (isProcessingQueue || requestQueue.length === 0) return;

    isProcessingQueue = true;
    const { sosData, resolve, reject } = requestQueue.shift();

    try {
        const result = await performGeminiRequest(sosData);
        resolve(result);
    } catch (error) {
        console.error("Queue processing error:", error);
        // If it failed, we might want to reject or resolve with null
        // For now, resolve null so app.js can handle it (or retry logic inside performGeminiRequest handles it)
        resolve(null);
    } finally {
        // Wait 4 seconds before processing the next item to stay under ~15 RPM
        setTimeout(() => {
            isProcessingQueue = false;
            processQueue();
        }, 4000);
    }
}

/**
 * Performs the actual API call with retries.
 */
async function performGeminiRequest(sosData) {
    // Construct the prompt
    const prompt = `
    You are an emergency response AI. Analyze this SOS distress signal and provide a JSON response.
    
    Signal Data:
    - User: ${sosData.userName || 'Unknown'}
    - Message: "${sosData.message || 'No text message provided'}"
    - Time: ${new Date(sosData.time).toLocaleString()}
    - Location: ${sosData.lat}, ${sosData.lon}
    
    Task:
    1. Determine Priority (Critical, High, Medium, Low).
    2. Assign a Severity Score (1-10).
    3. Write a 1-sentence Summary of the situation.
    4. Recommend immediate Action.

    IMPORTANT: Return ONLY the raw JSON object. Do not include markdown formatting like \`\`\`json or \`\`\`.

    Example Output:
    {
        "priority": "Critical",
        "score": 10,
        "summary": "User reporting severe injury...",
        "action": "Dispatch medical team immediately."
    }
    `;

    let retries = 3;
    let delay = 2000;

    while (retries > 0) {
        try {
            console.log(`Sending prompt to Gemini (Attempts left: ${retries})...`);
            const response = await fetch(GEMINI_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: prompt }]
                    }]
                })
            });

            const data = await response.json();

            if (data.error) {
                if (data.error.code === 429) {
                    console.warn(`Gemini Rate Limit Hit. Retrying in ${delay / 1000}s...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    retries--;
                    delay *= 2;
                    continue;
                }
                console.error("Gemini API Error:", data.error);
                return null;
            }

            const textResponse = data.candidates[0].content.parts[0].text;
            console.log("Gemini Text Response:", textResponse);

            const jsonString = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
            const result = JSON.parse(jsonString);
            console.log("Parsed AI Result:", result);
            return result;

        } catch (error) {
            console.error("Failed to analyze SOS:", error);
            return null;
        }
    }

    console.error("Gemini Analysis Failed after retries.");
    return null;
}
