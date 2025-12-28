import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize Gemini with the key provided by the user
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

class GeminiService {
    constructor() {
        try {
            this.genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
            this.model = this.genAI.getGenerativeModel({ model: "gemini-pro" });
            console.log("GeminiService: Initialized");
        } catch (error) {
            console.error("GeminiService: Initialization failed", error);
            this.model = null;
        }
    }

    /**
     * Analyzes a message to determine priority and summary.
     * @param {string} messageText 
     * @returns {Promise<{priority: 'critical'|'high'|'medium'|'low', summary: string}>}
     */
    async analyzeMessage(messageText) {
        if (!this.model) return { priority: 'normal', summary: messageText };

        try {
            const prompt = `
            You are an emergency response AI. Analyze this message: "${messageText}".
            
            Return ONLY a JSON object with:
            1. "priority": One of ["critical", "high", "medium", "low"].
               - critical: Life-threatening (heart attack, fire, trapped, bleeding).
               - high: Serious but stable (broken bone, lost, dehydration).
               - medium: Minor injury or resource request (need water, food).
               - low: Chat, testing, or non-emergency.
            2. "summary": A very short 3-5 word summary of the situation.

            JSON:
            `;

            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            // Clean up markdown code blocks if present
            const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(jsonStr);
        } catch (error) {
            console.error("Gemini Analysis Failed:", error);
            return { priority: 'normal', summary: messageText };
        }
    }
}

export default new GeminiService();
