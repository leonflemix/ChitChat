// Filename: ui_state_manager.js (State Management and View Rendering)

// FIX: Removed 'uiConfig' from the import list as it is no longer exported or used
import { fetchRecentDiscussions, saveNote, deleteDiscussion } from "./firebase_service.js"; 
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
                        <button id="confirm-btn" class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition">Confirm</button>
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
 * Renders the Custom Login View
 */
export function renderLoginView() {
    appContainer.innerHTML = `
        <div class="flex flex-col items-center justify-center h-full max-w-md mx-auto">
            <h2 class="text-3xl font-bold text-gray-800 mb-2">Welcome</h2>
            <p class="text-gray-500 mb-8 text-center">Sign in to save your discussions and notes securely.</p>
            
            <form id="auth-form" class="w-full space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                    <input type="email" id="auth-email" class="w-full p-3 border border-gray-300 rounded-lg focus:ring-primary-color focus:border-primary-color" placeholder="you@example.com" required>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
                    <input type="password" id="auth-password" class="w-full p-3 border border-gray-300 rounded-lg focus:ring-primary-color focus:border-primary-color" placeholder="••••••••" required>
                </div>
                
                <div class="flex flex-col gap-3 mt-6">
                    <button type="submit" id="login-btn" class="w-full bg-indigo-600 text-white font-semibold py-3 rounded-lg hover:bg-indigo-700 transition shadow-md">
                        Sign In
                    </button>
                    <button type="button" id="register-btn" class="w-full bg-white text-indigo-600 font-semibold py-3 rounded-lg border border-indigo-600 hover:bg-indigo-50 transition">
                        Create Account
                    </button>
                </div>
            </form>
            <p class="mt-4 text-xs text-gray-400 text-center">Ensure "Email/Password" is enabled in Firebase Console.</p>
        </div>
    `;
    
    // Hide API key setup on login screen to reduce clutter
    const apiKeySetup = document.getElementById('api-key-setup');
    if (apiKeySetup) apiKeySetup.classList.add('hidden');

    const emailInput = document.getElementById('auth-email');
    const passwordInput = document.getElementById('auth-password');

    // Handle Sign In
    document.getElementById('auth-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const email = emailInput.value;
        const pass = passwordInput.value;
        if(email && pass) window.handleLogin(email, pass);
    });

    // Handle Register
    document.getElementById('register-btn').addEventListener('click', (e) => {
        e.preventDefault();
        const email = emailInput.value;
        const pass = passwordInput.value;
        if(email && pass) {
            window.handleRegister(email, pass);
        } else {
            alertUser("Please enter an email and password to create an account.");
        }
    });
}

export function renderGenreInputView() {
    // Show/Hide API setup based on key presence
    const apiKeySetupElement = document.getElementById('api-key-setup');
    if (apiKeySetupElement) {
        if (appState.GEMINI_API_KEY) {
            apiKeySetupElement.classList.add('hidden');
        } else {
            apiKeySetupElement.classList.remove('hidden');
        }
    }

    appContainer.innerHTML = `
        <div class="p-4 sm:p-6 text-center">
            <h2 class="text-2xl font-semibold mb-4 text-gray-700">What would you like to discuss?</h2>
            <p class="mb-6 text-gray-500">Enter a topic or genre (e.g., 'Space Exploration', '1990s Music', 'Greek Mythology').</p>
            <div class="flex flex-col sm:flex-row gap-4 max-w-lg mx-auto">
                <input type="text" id="genre-input" placeholder="Enter genre here..." class="flex-grow p-3 border border-gray-300 rounded-lg focus:ring-primary-color focus:border-primary-color" required>
                <button id="submit-genre" class="btn-primary text-white p-3 rounded-lg font-semibold shadow-md hover:shadow-lg transition">
                    Start Chat
                </button>
            </div>
        </div>

        <section id="recent-discussions-section" class="mt-8 pt-6 border-t border-gray-200">
            <h3 class="text-xl font-semibold mb-4 text-gray-700">Your Past Discussions (${appState.recentDiscussions.length} recent)</h3>
            <div id="recent-list" class="space-y-3">
            ${appState.recentDiscussions.length > 0 ? 
                appState.recentDiscussions.map(disc => `
                    <div class="recent-discussion-item flex flex-col sm:flex-row justify-between items-start sm:items-center bg-gray-50 p-3 rounded-lg hover:bg-indigo-50 transition border border-gray-100">
                        <span class="font-medium text-gray-800 truncate mb-2 sm:mb-0 w-full sm:w-auto text-left">
                            ${disc.genre}
                            <span class="text-xs text-gray-500 ml-2 block sm:inline">(${disc.lastUpdated ? disc.lastUpdated.toDate().toLocaleDateString() : 'N/A'})</span>
                        </span>
                        <button data-id="${disc.id}" data-area="${disc.area}" data-genre="${disc.genre}" class="continue-discussion bg-indigo-200 text-indigo-700 text-xs font-semibold px-3 py-1 rounded-full hover:bg-indigo-300 transition w-full sm:w-auto mt-2 sm:mt-0">
                            Continue
                        </button>
                    </div>
                `).join('')
                : 
                '<p class="text-gray-500 italic text-center">No past discussions found. Start a new one!</p>'
            }
            </div>
        </section>
    `;

    document.getElementById('submit-genre')?.addEventListener('click', () => {
        const genre = document.getElementById('genre-input').value.trim();
        if (genre) startDiscussion(genre);
    });

    document.querySelectorAll('.continue-discussion').forEach(button => {
        button.addEventListener('click', (e) => {
            const discussionId = e.target.dataset.id;
            const genre = e.target.dataset.genre;
            if (discussionId) startDiscussion(genre, discussionId); 
        });
    });
}

export function renderDiscussionView() {
    appContainer.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[600px]">
            <!-- Discussion Panel (2/3 width) -->
            <div class="lg:col-span-2 flex flex-col border border-gray-200 rounded-lg overflow-hidden h-full">
                <div class="p-4 bg-gray-50 border-b border-gray-200 flex-none">
                    <div class="flex justify-between items-center mb-2">
                        <button id="back-to-genre" class="text-sm text-primary-color hover:underline flex items-center">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                            Back
                        </button>
                        <button id="delete-discussion" class="text-xs px-3 py-1 bg-red-100 text-red-600 rounded-full hover:bg-red-200 transition font-semibold">
                            Delete
                        </button>
                    </div>

                    <div class="flex justify-between items-center">
                        <h3 class="text-lg font-bold text-gray-800 truncate mr-2">${appState.currentArea}</h3>
                        <div class="flex-none">
                             ${!appState.hasSuggestions ? `
                                <button id="get-suggestions" class="bg-green-600 text-white px-2 py-1 text-xs rounded hover:bg-green-700 transition shadow">
                                    Get Ideas
                                </button>
                            ` : `
                                <button id="get-new-suggestions" class="bg-yellow-500 text-white px-2 py-1 text-xs rounded hover:bg-yellow-600 transition shadow">
                                    New Ideas
                                </button>
                            `}
                        </div>
                    </div>
                </div>

                <!-- Chat Box -->
                <div id="chat-box" class="flex-grow p-4 space-y-4 overflow-y-auto bg-white">
                    ${appState.chatHistory.map(msg => `
                        <div class="flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}">
                            <div class="${msg.role === 'user' ? 'chat-message-user' : 'chat-message-ai'} max-w-[85%] p-3 shadow">
                                <p class="text-sm leading-relaxed">${markdownToHtml(msg.parts[0].text, msg.role)}</p>
                            </div>
                        </div>
                    `).join('')}
                </div>

                <!-- Chat Input -->
                <div class="p-4 border-t border-gray-200 bg-white flex-none">
                    <div class="flex gap-2">
                        <input type="text" id="chat-input" placeholder="Type your message..." class="flex-grow p-3 border border-gray-300 rounded-lg focus:ring-primary-color focus:border-primary-color" autofocus>
                        <button id="send-chat" class="btn-primary text-white p-3 rounded-lg font-semibold shadow-md hover:shadow-lg transition">
                            Send
                        </button>
                    </div>
                </div>
            </div>

            <!-- Notes Panel (1/3 width) -->
            <div class="lg:col-span-1 flex flex-col h-full">
                <div class="bg-card-background p-4 border border-gray-200 rounded-lg flex flex-col flex-grow h-full">
                    <h3 class="text-lg font-bold mb-2 text-gray-700">Notes</h3>
                    <textarea id="notes-textarea" class="flex-grow p-3 border border-gray-300 rounded-lg resize-none focus:ring-primary-color focus:border-primary-color text-sm mb-2" placeholder="Write your thoughts...">${appState.currentNotes}</textarea>
                    <div class="flex justify-between items-center">
                        <button id="save-notes" class="btn-primary text-white px-4 py-2 rounded-lg font-semibold shadow-md hover:shadow-lg transition text-sm">
                            Save Notes
                        </button>
                        <span id="save-status" class="text-xs text-green-600 font-medium"></span>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('back-to-genre').addEventListener('click', () => {
        appState.currentView = 'genreInput';
        if (appState.unsubscribeNotes) appState.unsubscribeNotes(); 
        renderApp();
    });
    
    // FIX: Pass appState to deleteDiscussion, otherwise it receives the click Event object
    document.getElementById('delete-discussion')?.addEventListener('click', () => {
        deleteDiscussion(appState);
    });

    document.getElementById('get-suggestions')?.addEventListener('click', () => generateSuggestions(false));
    document.getElementById('get-new-suggestions')?.addEventListener('click', () => generateSuggestions(true));

    const chatInput = document.getElementById('chat-input');
    const handleSend = () => {
        const message = chatInput.value.trim();
        if (message) sendChatMessage(message);
    };

    document.getElementById('send-chat').addEventListener('click', handleSend);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });

    document.getElementById('save-notes').addEventListener('click', () => {
        saveNote(document.getElementById('notes-textarea').value, appState);
    });
    
    const chatBox = document.getElementById('chat-box');
    if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;
}

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