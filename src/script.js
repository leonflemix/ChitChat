import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
    getAuth, 
    onAuthStateChanged, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    getDoc, 
    setDoc, 
    addDoc, 
    updateDoc, 
    collection, 
    query, 
    onSnapshot, 
    arrayUnion, 
    serverTimestamp, 
    writeBatch 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- Firebase Configuration ---
// Paste your Firebase config object here from your project's settings.
const firebaseConfig = {
  apiKey: "AIzaSyBIHrZMw4fQP7ghC6VyTCq--61UlWlWEZQ",
  authDomain: "chitchat-1b6d3.firebaseapp.com",
  projectId: "chitchat-1b6d3",
  storageBucket: "chitchat-1b6d3.firebasestorage.app",
  messagingSenderId: "1075848033593",
  appId: "1:1075848033593:web:555b1a8eb9ac39efeb24e8",
  measurementId: "G-KTWCYDN0YF"
};

const appId = 'default-chit-chat-app';

// --- Default Data ---
const defaultCategories = [
  "Deep Questions", "Fun & Silly", "Travel Dreams",
  "Relationship Check-in", "Future Plans", "Past Memories"
];
const defaultUserTopics = {
  "Deep Questions": ["What's a dream you've never said out loud?"],
  "Fun & Silly": ["If you were a type of cheese, what type would you be and why?"],
  "Travel Dreams": ["What's the most beautiful place you've ever been?"],
  "Relationship Check-in": ["What's one small thing I can do this week to make you feel more loved?"],
  "Future Plans": ["What's a skill you'd like to learn together?"],
  "Past Memories": ["What's your happiest childhood memory?"],
};

// --- Global State ---
let auth, db;
let userId = null;
let settings = { categories: defaultCategories };
let currentTopic = null;
let selectedChat = null;
let unsubscribers = [];

// --- UI Element Selectors ---
const ui = {
    // Screens
    missingConfigScreen: document.getElementById('missing-config-screen'),
    authScreen: document.getElementById('auth-screen'),
    mainApp: document.getElementById('main-app'),
    // Auth
    authForm: document.getElementById('auth-form'),
    authTitle: document.getElementById('auth-title'),
    authEmail: document.getElementById('auth-email'),
    authPassword: document.getElementById('auth-password'),
    authError: document.getElementById('auth-error'),
    authSubmitButton: document.getElementById('auth-submit-button'),
    authPrompt: document.getElementById('auth-prompt'),
    authToggle: document.getElementById('auth-toggle'),
    // Header & Nav
    header: document.getElementById('header'),
    headerTitle: document.getElementById('header-title'),
    headerBackButton: document.getElementById('header-back-button'),
    navigation: document.getElementById('navigation'),
    navButtons: document.querySelectorAll('.nav-button'),
    // Views
    viewContainer: document.getElementById('view-container'),
    homeScreen: document.getElementById('home-screen'),
    historyScreen: document.getElementById('history-screen'),
    settingsScreen: document.getElementById('settings-screen'),
    detailScreen: document.getElementById('detail-screen'),
    // Home
    getTopicView: document.getElementById('get-topic-view'),
    currentTopicView: document.getElementById('current-topic-view'),
    getNewTopicBtn: document.getElementById('get-new-topic-btn'),
    refreshTopicBtn: document.getElementById('refresh-topic-btn'),
    topicCategory: document.getElementById('topic-category'),
    topicText: document.getElementById('topic-text'),
    topicNote: document.getElementById('topic-note'),
    saveChatBtn: document.getElementById('save-chat-btn'),
    // History
    historyList: document.getElementById('history-list'),
    historyEmpty: document.getElementById('history-empty'),
    // Settings
    settingsCategoriesList: document.getElementById('settings-categories-list'),
    addTopicForm: document.getElementById('add-topic-form'),
    signOutBtn: document.getElementById('sign-out-btn'),
    // Detail
    detailCategory: document.getElementById('detail-category'),
    detailTopic: document.getElementById('detail-topic'),
    expandTopicBtn: document.getElementById('expand-topic-btn'),
    detailNotesList: document.getElementById('detail-notes-list'),
    detailNewNote: document.getElementById('detail-new-note'),
    addNoteBtn: document.getElementById('add-note-btn'),
    // Global Error
    globalError: document.getElementById('global-error'),
    globalErrorText: document.getElementById('global-error-text'),
    globalErrorClose: document.getElementById('global-error-close'),
};

// --- UI Helper Functions ---
function showError(message) {
    ui.globalErrorText.textContent = message;
    ui.globalError.classList.remove('hidden');
}

function clearError() {
    ui.globalError.classList.add('hidden');
}

function showSpinner(button, text = '') {
    button.disabled = true;
    button.innerHTML = `<div class="spinner"></div><span class="ml-2">${text}</span>`;
}

function hideSpinner(button, text) {
    button.disabled = false;
    button.innerHTML = text;
}

function switchView(viewName) {
    ['home', 'history', 'settings', 'detail'].forEach(v => {
        ui[`${v}Screen`].classList.add('hidden');
    });
    ui[`${viewName}Screen`].classList.remove('hidden');

    ui.headerTitle.textContent = viewName.charAt(0).toUpperCase() + viewName.slice(1);
    ui.headerBackButton.classList.toggle('hidden', viewName !== 'detail');
    ui.navigation.classList.toggle('hidden', viewName === 'detail');

    ui.navButtons.forEach(btn => {
        if (btn.dataset.view === viewName) {
            btn.classList.add('text-pink-500');
            btn.classList.remove('text-gray-500');
        } else {
            btn.classList.remove('text-pink-500');
            btn.classList.add('text-gray-500');
        }
    });
}


// --- Firebase Logic ---
function initializeFirebase() {
    try {
        const app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        setupAuthListener();
    } catch (error) {
        console.error("Firebase Init Error:", error);
        showError("Could not connect to the service.");
    }
}

function setupAuthListener() {
    onAuthStateChanged(auth, user => {
        if (user) {
            userId = user.uid;
            ui.authScreen.classList.add('hidden');
            ui.mainApp.classList.remove('hidden');
            attachDataListeners();
        } else {
            userId = null;
            ui.authScreen.classList.remove('hidden');
            ui.mainApp.classList.add('hidden');
            detachDataListeners();
        }
    });
}

function attachDataListeners() {
    if (!userId) return;
    
    const settingsRef = doc(db, `artifacts/${appId}/users/${userId}/preferences`, 'userSettings');
    const settingsUnsub = onSnapshot(settingsRef, docSnap => {
        if (docSnap.exists() && docSnap.data().categories?.length > 0) {
            settings = docSnap.data();
        } else {
            setDoc(settingsRef, { categories: defaultCategories });
        }
        renderSettings();
    });

    const historyQuery = query(collection(db, `artifacts/${appId}/users/${userId}/chats`));
    const historyUnsub = onSnapshot(historyQuery, querySnapshot => {
        const historyData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        historyData.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        renderHistory(historyData);
    });

    const topicsCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/userTopics`);
    const topicsUnsub = onSnapshot(topicsCollectionRef, async (querySnapshot) => {
        if (querySnapshot.empty) {
            const batch = writeBatch(db);
            Object.entries(defaultUserTopics).forEach(([category, topics]) => {
                const docRef = doc(db, `artifacts/${appId}/users/${userId}/userTopics`, category);
                batch.set(docRef, { topics });
            });
            await batch.commit();
        } else {
            const topicsData = {};
            querySnapshot.forEach((doc) => {
                topicsData[doc.id] = doc.data().topics;
            });
            // This is just for settings rendering, not stored in global state
            renderSettings(topicsData);
        }
    });

    unsubscribers = [settingsUnsub, historyUnsub, topicsUnsub];
}

function detachDataListeners() {
    unsubscribers.forEach(unsub => unsub());
    unsubscribers = [];
}

// --- App Logic ---

async function getNewTopic() {
    if (settings.categories.length === 0) {
        showError("Please select at least one category in Settings.");
        return;
    }
    showSpinner(ui.getNewTopicBtn, 'Generating...');
    showSpinner(ui.refreshTopicBtn);
    clearError();

    const systemPrompt = "You are a creative assistant who generates conversation starters for couples. Your response MUST be a single, thought-provoking question or topic. Do not add any extra text, quotation marks, or labels like 'Topic:'. Just provide the sentence itself.";
    const userQuery = `Generate a conversation starter for a couple interested in these themes: ${settings.categories.join(', ')}.`;

    try {
        const apiKey = "";
        const apiUrl = `https://generativelace.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;
        const payload = { contents: [{ parts: [{ text: userQuery }] }], systemInstruction: { parts: [{ text: systemPrompt }] } };
        const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

        if (!response.ok) throw new Error(`API call failed with status: ${response.status}`);
        
        const result = await response.json();
        const generatedText = result.candidates?.[0]?.content?.parts?.[0]?.text;

        if (generatedText) {
            const randomCategory = settings.categories[Math.floor(Math.random() * settings.categories.length)];
            currentTopic = { topic: generatedText.trim(), category: randomCategory };
            renderCurrentTopic();
        } else {
            throw new Error("No content received from the AI.");
        }
    } catch (err) {
        console.error("Error generating topic:", err);
        showError("Sorry, we couldn't generate a topic right now.");
    } finally {
        hideSpinner(ui.getNewTopicBtn, 'Start a new chat');
        hideSpinner(ui.refreshTopicBtn, `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M3 21v-5h5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/></svg>`);
    }
}

async function saveCurrentChat() {
    if (!db || !userId || !currentTopic || ui.topicNote.value.trim() === '') {
        showError("Please add a note before saving.");
        return;
    }
    showSpinner(ui.saveChatBtn, 'Saving...');

    try {
        const newChatData = {
            ...currentTopic,
            notes: [{ text: ui.topicNote.value, timestamp: serverTimestamp() }],
            createdAt: serverTimestamp()
        };
        const docRef = await addDoc(collection(db, `artifacts/${appId}/users/${userId}/chats`), newChatData);
        
        selectedChat = { id: docRef.id, ...newChatData };
        renderDetailView();
        switchView('detail');

        // Reset home screen
        currentTopic = null;
        ui.topicNote.value = '';
        ui.getTopicView.classList.remove('hidden');
        ui.currentTopicView.classList.add('hidden');
    } catch (err) {
        console.error("Error saving chat:", err);
        showError("Could not save your chat.");
    } finally {
        hideSpinner(ui.saveChatBtn, 'Save Chat');
    }
}

// --- Rendering ---
function renderCurrentTopic() {
    if (currentTopic) {
        ui.topicCategory.textContent = currentTopic.category;
        ui.topicText.textContent = currentTopic.topic;
        ui.topicNote.value = '';
        ui.getTopicView.classList.add('hidden');
        ui.currentTopicView.classList.remove('hidden');
    }
}

function renderHistory(historyData) {
    ui.historyList.innerHTML = '';
    if (historyData.length === 0) {
        ui.historyEmpty.classList.remove('hidden');
        return;
    }
    ui.historyEmpty.classList.add('hidden');

    historyData.forEach(chat => {
        const chatEl = document.createElement('div');
        chatEl.className = 'bg-white p-4 rounded-lg shadow-sm cursor-pointer hover:shadow-md transition';
        chatEl.innerHTML = `
            <p class="font-bold text-gray-800">${chat.topic}</p>
            <p class="text-sm text-gray-500 truncate mt-1">${chat.notes?.[0]?.text || ''}</p>
            <span class="text-xs font-medium text-pink-500 bg-pink-100 px-2 py-0.5 rounded-full mt-2 inline-block">${chat.category}</span>
        `;
        chatEl.addEventListener('click', () => {
            selectedChat = chat;
            renderDetailView();
            switchView('detail');
        });
        ui.historyList.appendChild(chatEl);
    });
}

function renderSettings(userTopics = {}) {
    ui.settingsCategoriesList.innerHTML = '';
    const allCategories = Array.from(new Set([...settings.categories, ...Object.keys(userTopics)])).sort();

    allCategories.forEach(category => {
        const isChecked = settings.categories.includes(category);
        const label = document.createElement('label');
        label.className = 'flex items-center p-4 bg-white rounded-lg shadow-sm cursor-pointer hover:bg-pink-50 transition';
        label.innerHTML = `
            <input type="checkbox" ${isChecked ? 'checked' : ''} class="h-5 w-5 rounded border-gray-300 text-pink-500 focus:ring-pink-500">
            <span class="ml-4 text-gray-700 font-medium">${category}</span>
        `;
        label.querySelector('input').addEventListener('change', async () => {
            const newCategories = settings.categories.includes(category)
                ? settings.categories.filter(c => c !== category)
                : [...settings.categories, category];
            
            const settingsRef = doc(db, `artifacts/${appId}/users/${userId}/preferences`, 'userSettings');
            await setDoc(settingsRef, { categories: newCategories }, { merge: true });
        });
        ui.settingsCategoriesList.appendChild(label);
    });
}

function renderDetailView() {
    if (!selectedChat) return;

    ui.detailCategory.textContent = selectedChat.category;
    ui.detailTopic.textContent = selectedChat.topic;
    ui.detailNotesList.innerHTML = '';

    const sortedNotes = [...(selectedChat.notes || [])].sort((a,b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));
    
    sortedNotes.forEach(note => {
        const noteEl = document.createElement('div');
        noteEl.className = 'bg-white p-4 rounded-lg shadow-sm whitespace-pre-wrap';
        noteEl.innerHTML = `
            <p class="text-gray-700">${note.text.replace(/\n/g, '<br>')}</p>
            <p class="text-xs text-gray-400 mt-2 text-right">
                ${note.timestamp ? new Date(note.timestamp.seconds * 1000).toLocaleString() : 'Just now'}
            </p>
        `;
        ui.detailNotesList.appendChild(noteEl);
    });
}

// --- Event Listeners ---
function setupEventListeners() {
    let isLoginView = true;
    
    ui.authToggle.addEventListener('click', () => {
        isLoginView = !isLoginView;
        ui.authTitle.textContent = isLoginView ? "Welcome back!" : "Create your account";
        ui.authSubmitButton.textContent = isLoginView ? "Log In" : "Register";
        ui.authPrompt.textContent = isLoginView ? "Don't have an account?" : "Already have an account?";
        ui.authToggle.textContent = isLoginView ? "Register" : "Log In";
        ui.authError.textContent = '';
    });

    ui.authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = ui.authEmail.value;
        const password = ui.authPassword.value;
        ui.authError.textContent = '';
        
        try {
            if (isLoginView) {
                await signInWithEmailAndPassword(auth, email, password);
            } else {
                await createUserWithEmailAndPassword(auth, email, password);
            }
        } catch (error) {
            ui.authError.textContent = error.message.replace('Firebase: ', '');
        }
    });

    ui.signOutBtn.addEventListener('click', () => signOut(auth));
    
    ui.navButtons.forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    ui.headerBackButton.addEventListener('click', () => switchView('history'));
    ui.globalErrorClose.addEventListener('click', clearError);

    ui.getNewTopicBtn.addEventListener('click', getNewTopic);
    ui.refreshTopicBtn.addEventListener('click', getNewTopic);
    ui.saveChatBtn.addEventListener('click', saveCurrentChat);
}

// --- App Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    const isConfigMissing = !firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith("PASTE_");
    
    if (isConfigMissing) {
        ui.missingConfigScreen.classList.remove('hidden');
        ui.authScreen.classList.add('hidden');
        ui.mainApp.classList.add('hidden');
        return;
    }
    initializeFirebase();
    setupEventListeners();
    switchView('home');
});

