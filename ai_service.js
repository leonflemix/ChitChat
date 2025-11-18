// Filename: ai_service.js (AI/Gemini API Communication)

import { alertUser, renderApp } from "./ui_state_manager.js"; // setupNotesListener removed
import { saveNote, getNotesDocRef, setupNotesListener } from "./firebase_service.js"; // setupNotesListener added here
import { getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// The Gemini API Key is retrieved from the global window scope (set in index.html)
const GEMINI_API_KEY = window.GEMINI_API_KEY;

/**
 * Generic function to call the Gemini API with exponential backoff.
 */
export async function callGeminiAPI(prompt, systemInstruction, generationConfig = {}, history = []) {
    if (!GEMINI_API_KEY) {
        throw new Error("API Key missing.");
    }

    const loadingIndicator = document.getElementById('loading-indicator');
    const loadingText = document.getElementById('loading-text');

    loadingIndicator.classList.remove('hidden');
    loadingText.textContent = `Thinking about your request...`;

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`;

    const contents = [
        ...history,
        { role: "user", parts: [{ text: prompt }] }
    ];

    const payload = {
        contents: contents,
        generationConfig: generationConfig,
        systemInstruction: { parts: [{ text: systemInstruction }] },
    };

    // Conditionally include tools (no grounding for structured JSON)
    if (!generationConfig.responseMimeType) {
        payload.tools = [{ "google_search": {} }];
    }

    let response = null;
    let maxRetries = 5;
    let delay = 1000;

    for (let i = 0; i < maxRetries; i++) {
        try {
            const fetchResponse = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (fetchResponse.status === 429) { 
                if (i < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay *= 2;
                    continue;
                }
            }

            if (!fetchResponse.ok) {
                const errorMsg = await fetchResponse.text();
                console.error("API Detailed Error:", errorMsg);
                throw new Error(`API call failed with status: ${fetchResponse.status}`);
            }

            response = await fetchResponse.json();
            break; 
        } catch (error) {
            console.error("Fetch attempt failed:", error);
            if (i < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2;
                continue;
            }
            throw new Error(error.message || "Failed to connect to the Gemini API after multiple retries.");
        }
    }
    loadingIndicator.classList.add('hidden');

    const candidate = response.candidates?.[0];
    if (!candidate || !candidate.content?.parts?.[0]?.text) {
        throw new Error("Received empty or malformed response from the AI.");
    }

    return candidate.content.parts[0].text;
}

/**
 * Starts a new chat or loads a saved discussion based on the genre.
 */
export async function startDiscussion(genre, predefinedDiscussionId = null) {
    const appState = window.appState; // Access global state
    appState.currentGenre = genre;
    appState.currentArea = genre; 
    
    appState.discussionId = predefinedDiscussionId || appState.currentGenre.replace(/\W/g, '_').toLowerCase().slice(0, 50); 
    appState.hasSuggestions = false;

    const notesRef = getNotesDocRef(null, appState);

    try {
        document.getElementById('loading-text').textContent = `Loading discussion for "${genre}"...`;
        
        const docSnap = await getDoc(notesRef);
        
        if (docSnap.exists() && docSnap.data().chatHistory) {
            const data = docSnap.data();
            appState.chatHistory = data.chatHistory || [];
            appState.hasSuggestions = data.hasSuggestions || false; 
            appState.currentNotes = data.noteContent || '';
            console.log("Loaded existing discussion state.");

        } else {
            // New discussion: start with a simple greeting
            document.getElementById('loading-text').textContent = `Starting a new chat on "${genre}"...`;
            const systemPrompt = "You are a friendly, concise, and helpful AI chat assistant. Welcome the user to the chat based on their chosen genre. Keep your greeting very short.";
            const userPrompt = `I want to chat about the genre: "${genre}". Give me a short welcome message.`;
            
            const responseText = await callGeminiAPI(userPrompt, systemPrompt);
            
            appState.chatHistory = [
                { role: 'model', parts: [{ text: responseText }] }
            ];
            appState.currentNotes = '';
            appState.hasSuggestions = false;
            
            await saveNote('', appState); 
        }
        
        appState.currentView = 'discussion';
        setupNotesListener(appState);
    } catch (e) {
        alertUser(`Error starting discussion: ${e.message}`);
        appState.currentView = 'genreInput'; 
    }
    renderApp();
}

/**
 * Sends a user message and gets an AI response.
 */
export async function sendChatMessage(userMessage) {
    const appState = window.appState;
    appState.chatHistory.push({ role: 'user', parts: [{ text: userMessage }] });
    
    const chatInput = document.getElementById('chat-input');
    if (chatInput) chatInput.value = '';
    renderApp(); // Render immediately to show user message

    try {
        document.getElementById('loading-text').textContent = `AI is typing a response...`;
        
        const systemPrompt = `You are an excellent discussion facilitator and AI participant for the area: "${appState.currentArea}". Keep your responses concise, insightful, and friendly. Do not repeat previous points.`;
        const responseText = await callGeminiAPI(userMessage, systemPrompt, {}, appState.chatHistory);

        appState.chatHistory.push({ role: 'model', parts: [{ text: responseText }] });

        const notesContent = document.getElementById('notes-textarea').value;
        await saveNote(notesContent, appState);

    } catch (e) {
        alertUser(`Error during chat: ${e.message}`);
        appState.chatHistory.pop(); // Remove the last user message if AI failed
    }
    renderApp(); // Final render after response
    // Scroll to the bottom of the chat box
    const chatBox = document.getElementById('chat-box');
    if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;
}

/**
 * Generates 10 discussion questions/facts and appends them to the chat history.
 */
export async function generateSuggestions(isNewSet = false) {
    const appState = window.appState;
    if (!GEMINI_API_KEY) {
        alertUser("Please provide a Gemini API Key to use AI features.");
        return;
    }

    try {
        document.getElementById('loading-text').textContent = isNewSet ? `Generating a fresh set of discussion points...` : `Preparing 10 discussion topics...`;
        
        const systemPrompt = "You are a discussion facilitator. Generate exactly 10 unique, thought-provoking questions or interesting facts related to the discussion area. Present them as a numbered list. Be insightful.";
        
        let userPrompt;
        if (isNewSet) {
            userPrompt = `The current topic is: "${appState.currentArea}". Generate a completely new and distinct set of 10 discussion questions or facts.`;
        } else {
            userPrompt = `The current topic is: "${appState.currentArea}". Generate 10 discussion questions or facts now.`;
        }
        
        const responseText = await callGeminiAPI(userPrompt, systemPrompt);
        
        appState.chatHistory.push({ 
            role: 'model', 
            parts: [{ text: `--- **Discussion Suggestions for ${appState.currentArea}** ---\n\n${responseText}` }] 
        });
        
        appState.hasSuggestions = true; 

        const notesContent = document.getElementById('notes-textarea') ? document.getElementById('notes-textarea').value : appState.currentNotes;
        await saveNote(notesContent, appState);
        
    } catch (e) {
        alertUser(`Error generating suggestions: ${e.message}`);
    }
    renderApp();
    const chatBox = document.getElementById('chat-box');
    if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;
}