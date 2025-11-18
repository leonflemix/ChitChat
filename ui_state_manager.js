// Filename: ui_state_manager.js (State Management and View Rendering)

import { fetchRecentDiscussions, saveNote, deleteDiscussion, uiConfig } from "./firebase_service.js"; 
import { startDiscussion, sendChatMessage, generateSuggestions } from "./ai_service.js";

// --- Application State ---
export const appState = {
    db: null,
    auth: null,
    userId: null,
    isAuthReady: false,
    currentView: 'login', // Default starting view is now 'login'
    currentGenre: '',
    currentArea: '',
    chatHistory: [],
    currentNotes: '',
    discussionId: null,
    recentDiscussions: [],
    hasSuggestions: false,
    unsubscribeNotes: null,
    GEMINI_API_KEY: localStorage.getItem('geminiApiKey') || "",
};

// --- DOM Manipulation Helpers ---
const appContainer = document.getElementById('app-container');
const loadingIndicator = document.getElementById('loading-indicator');

/**
 * Renders a generic error or info message to the user.
 */
export function alertUser(message) {
    console.error(message);
    const alertHtml = `
        <div id="temp-alert" class="fixed top-4 right-4 bg-red-500 text-white p-4 rounded-lg shadow-lg z-50">
            ${message}
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', alertHtml);
    setTimeout(() => {
        const alertEl = document.getElementById('temp-alert');
        if (alertEl) alertEl.remove();
    }, 5000);
}

/**
 * Renders a custom confirmation modal. Returns true/false via a Promise.
 */
export function confirmAction(message) {
    return new Promise(resolve => {
        const modalHtml = `
            <div id="confirm-modal" class="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50 p-4">
                <div class="bg-white p-6 rounded-lg shadow-2xl max-w-sm w-full">
                    <p class="text-lg font-semibold text-gray-800 mb-4">${message}</p>
                    <div class="flex justify-end space-x-3">
                        <button id="cancel-btn" class="px-4 py-2 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400 transition">Cancel</button>
                        <button id="confirm-btn" class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition">Confirm Delete</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = document.getElementById('confirm-modal');

        document.getElementById('confirm-btn').onclick = () => {
            modal.remove();
            resolve(true);
        };

        document.getElementById('cancel-btn').onclick = () => {
            modal.remove();
            resolve(false);
        };
    });
}


// Function to handle basic Markdown to HTML conversion for display
function markdownToHtml(text, role) {
    let html = text;
    
    // Add AI prefix if it's a model response
    if (role === 'model') {
        html = `<span class="font-bold">AI:</span> ${html}`;
    }

    // Simple bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Simple italic
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    // Line breaks
    html = html.replace(/\n/g, '<br>');
    return html;
}

// --- View Renderers ---

/**
 * Renders the Login / Welcome view and starts the FirebaseUI widget.
 */
export function renderLoginView() {
    // Check if FirebaseUI is ready (the global window.firebaseui should exist)
    if (typeof firebaseui === 'undefined' || typeof firebaseui.auth === 'undefined' || !appState.auth) {
        console.warn("Firebase or FirebaseUI not fully loaded. Rendering temporary message.");
        appContainer.innerHTML = `<div class="p-6 text-center text-lg text-gray-600">Loading sign-in components...</div>`;
        return;
    }
    
    // Initialize FirebaseUI instance only once
    let ui = firebaseui.auth.AuthUI.getInstance() || new firebaseui.auth.AuthUI(appState.auth);
    
    appContainer.innerHTML = `
        <div class="p-6 text-center">
            <h2 class="text-2xl font-semibold mb-4 text-gray-700">Sign In to Continue</h2>
            <p class="mb-6 text-gray-500">Your discussions and notes are securely tied to your user account.</p>
            <div id="firebaseui-auth-container" class="max-w-md mx-auto"></div>
        </div>
    `;
    
    // Start the Firebase UI Widget
    ui.start('#firebaseui-auth-container', uiConfig);
    
    // Hide the API key setup area if user is asked to sign in
    document.getElementById('api-key-setup').classList.add('hidden');
}

/**
 * Renders the Genre Input view, including recent discussions.
 */
export function renderGenreInputView() {
    const apiKeySetupElement = document.getElementById('api-key-setup');

    // Hide/Show API setup based on key presence
    if (appState.GEMINI_API_KEY) {
        apiKeySetupElement.classList.add('hidden');
    } else {
        apiKeySetupElement.classList.remove('hidden');
    }

    appContainer.innerHTML = `
        <div class="p-4 sm:p-6 text-center">
            <h2 class="text-2xl font-semibold mb-4 text-gray-700">What would you like to discuss?</h2>
            <p class="mb-6 text-gray-500">Enter a topic or genre (e.g., 'Space Exploration', '1990s Music', 'Greek Mythology').</p>
            <div class="flex flex-col sm:flex-row gap-4 max-w-lg mx-auto">
                <input type="text" id="genre-input" placeholder="Enter genre here..." class="flex-grow p-3 border border-gray-300 rounded-lg focus:ring-primary-color focus:border-primary-color" required>
                <button id="submit-genre" class="btn-primary text-white p-3 rounded-lg font-semibold shadow-md hover:shadow-lg transition" ${!appState.GEMINI_API_KEY ? 'disabled' : ''}>
                    Start Chat
                </button>
            </div>
            ${!appState.GEMINI_API_KEY ? '<p class="text-sm text-red-500 mt-3">Please save a Gemini API Key above to enable generation.</p>' : ''}
        </div>

        <section id="recent-discussions-section" class="mt-8 pt-6 border-t border-gray-200">
            <h3 class="text-xl font-semibold mb-4 text-gray-700">Your Past Discussions (${appState.recentDiscussions.length} recent)</h3>
            <div id="recent-list" class="space-y-3">
            ${appState.recentDiscussions.length > 0 ? 
                appState.recentDiscussions.map(disc => `
                    <div class="recent-discussion-item flex flex-col sm:flex-row justify-between items-start sm:items-center bg-gray-50 p-3 rounded-lg hover:bg-indigo-50 transition border border-gray-100">
                        <span class="font-medium text-gray-800 truncate mb-2 sm:mb-0">
                            ${disc.genre}
                            <span class="text-xs text-gray-500 ml-2">(${disc.lastUpdated ? disc.lastUpdated.toDate().toLocaleDateString() : 'N/A'})</span>
                        </span>
                        <button data-id="${disc.id}" data-area="${disc.area}" data-genre="${disc.genre}" class="continue-discussion bg-indigo-200 text-indigo-700 text-xs font-semibold px-3 py-1 rounded-full hover:bg-indigo-300 transition w-full sm:w-auto">
                            Continue
                        </button>
                    </div>
                `).join('')
                : 
                '<p class="text-gray-500 italic">No past discussions found. Sign in and start a new one!</p>'
            }
            </div>
        </section>
    `;

    // Event listener for starting a new chat
    document.getElementById('submit-genre')?.addEventListener('click', () => {
        const genre = document.getElementById('genre-input').value.trim();
        if (genre) {
            startDiscussion(genre);
        }
    });

    // Event listener for resuming past discussions
    document.querySelectorAll('.continue-discussion').forEach(button => {
        button.addEventListener('click', (e) => {
            const discussionId = e.target.dataset.id;
            const genre = e.target.dataset.genre;
            
            if (discussionId) {
                startDiscussion(genre, discussionId); 
            }
        });
    });
}

/**
 * Renders the main Discussion and Notes view.
 */
export function renderDiscussionView() {
    appContainer.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Discussion Panel (2/3 width) -->
            <div class="lg:col-span-2 flex flex-col h-[600px] border border-gray-200 rounded-lg overflow-hidden">
                <div class="p-4 bg-gray-50 border-b border-gray-200">
                    <div class="flex justify-between items-start mb-4">
                        <button id="back-to-genre" class="text-sm text-primary-color hover:underline flex items-center">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                            Back to Topics
                        </button>
                        <button id="delete-discussion" class="text-xs px-3 py-1 bg-red-100 text-red-600 rounded-full hover:bg-red-200 transition font-semibold">
                            Delete Discussion
                        </button>
                    </div>

                    <h3 class="text-xl font-bold text-gray-800 truncate mt-1">Topic: ${appState.currentArea}</h3>
                    
                    <!-- Suggestions Button -->
                    <div class="mt-3">
                        ${!appState.hasSuggestions ? `
                            <button id="get-suggestions" class="bg-green-600 text-white px-3 py-1 text-sm rounded-lg hover:bg-green-700 transition font-semibold shadow">
                                Get 10 Discussion Suggestions
                            </button>
                        ` : `
                            <button id="get-new-suggestions" class="bg-yellow-500 text-white px-3 py-1 text-sm rounded-lg hover:bg-yellow-600 transition font-semibold shadow">
                                Generate New 10 Suggestions
                            </button>
                        `}
                    </div>
                </div>

                <!-- Chat Box -->
                <div id="chat-box" class="flex-grow p-4 space-y-4 overflow-y-auto">
                    ${appState.chatHistory.map(msg => `
                        <div class="flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}">
                            <div class="${msg.role === 'user' ? 'chat-message-user' : 'chat-message-ai'} max-w-xl p-3 shadow">
                                <p class="text-sm">${markdownToHtml(msg.parts[0].text, msg.role)}</p>
                            </div>
                        </div>
                    `).join('')}
                </div>

                <!-- Chat Input -->
                <div class="p-4 border-t border-gray-200 bg-white">
                    <div class="flex gap-2">
                        <input type="text" id="chat-input" placeholder="Type your message..." class="flex-grow p-3 border border-gray-300 rounded-lg focus:ring-primary-color focus:border-primary-color" autofocus>
                        <button id="send-chat" class="btn-primary text-white p-3 rounded-lg font-semibold shadow-md hover:shadow-lg transition">
                            Send
                        </button>
                    </div>
                </div>
            </div>

            <!-- Notes Panel (1/3 width) -->
            <div class="lg:col-span-1 flex flex-col h-[600px]">
                <div class="bg-card-background p-4 border border-gray-200 rounded-lg flex flex-col flex-grow">
                    <h3 class="text-xl font-bold mb-3 text-gray-700">My Notes & Comments</h3>
                    <textarea id="notes-textarea" class="flex-grow p-3 border border-gray-300 rounded-lg resize-none focus:ring-primary-color focus:border-primary-color text-sm" placeholder="Write your thoughts, summaries, or points of interest here...">${appState.currentNotes}</textarea>
                    <div class="flex justify-between items-center mt-3">
                        <button id="save-notes" class="btn-primary text-white px-4 py-2 rounded-lg font-semibold shadow-md hover:shadow-lg transition text-sm">
                            Save Notes
                        </button>
                        <span id="save-status" class="text-xs text-green-600 font-medium"></span>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Event Listeners
    document.getElementById('back-to-genre').addEventListener('click', () => {
        appState.currentView = 'genreInput';
        if (appState.unsubscribeNotes) appState.unsubscribeNotes(); // Clean up listener
        renderApp();
    });
    
    document.getElementById('delete-discussion')?.addEventListener('click', deleteDiscussion);

    document.getElementById('get-suggestions')?.addEventListener('click', () => {
        generateSuggestions(false);
    });
    document.getElementById('get-new-suggestions')?.addEventListener('click', () => {
        generateSuggestions(true);
    });

    const sendChatButton = document.getElementById('send-chat');
    const chatInput = document.getElementById('chat-input');
    const saveNotesButton = document.getElementById('save-notes');
    const notesTextarea = document.getElementById('notes-textarea');

    const handleSend = () => {
        const message = chatInput.value.trim();
        if (message) {
            sendChatMessage(message);
        }
    };

    sendChatButton.addEventListener('click', handleSend);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });

    saveNotesButton.addEventListener('click', () => {
        saveNote(notesTextarea.value);
    });
    
    // Scroll to bottom when view is rendered
    const chatBox = document.getElementById('chat-box');
    if (chatBox) {
        chatBox.scrollTop = chatBox.scrollHeight;
    }
}

/**
 * Main function to render the correct view based on application state.
 */
export function renderApp() {
    if (!appState.isAuthReady) {
        appContainer.innerHTML = '<div class="p-6 text-center text-lg text-gray-600">Initializing Authentication...</div>';
        return;
    }

    switch (appState.currentView) {
        case 'login':
            renderLoginView();
            break; 
        case 'genreInput':
            renderGenreInputView();
            break;
        case 'discussion':
            renderDiscussionView();
            break;
        default:
            renderLoginView(); 
    }
}