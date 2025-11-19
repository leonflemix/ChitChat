// Filename: firebase_service.js (Firebase Initialization and Data Layer)

// NOTE: Core Firebase SDK is loaded via <script> tags in index.html to support FirebaseUI.
// We must import modular SDKs for Firestore/modular functions here.
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, signOut, GoogleAuthProvider, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, onSnapshot, collection, query, setDoc, getDoc, getDocs, limit, deleteDoc, serverTimestamp, setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { alertUser, confirmAction, renderApp, renderLoginView } from "./ui_state_manager.js"; // Import UI functions

// Set Firebase Log Level
setLogLevel('debug');

// --- Firebase Configuration ---

export const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// The user's provided configuration is used as a fallback if the environment variable is not present.
export const defaultFirebaseConfig = {
    apiKey: "AIzaSyA4ynU2vU6pflZ5wRhD-FxDTh3_cQGiePM",
    authDomain: "chitchat-9264b.firebaseapp.com",
    projectId: "chitchat-9264b",
    storageBucket: "chitchat-9264b.firebasestorage.app",
    messagingSenderId: "233484387798",
    appId: "1:233484387798:web:eb47053333c2e719359077",
    measurementId: "G-31QHY1SD1F"
};
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : defaultFirebaseConfig;
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// --- Firebase UI Configuration (Exported for ui_state_manager.js) ---
export const uiConfig = {
    // NOTE: These use constants exposed by the global Firebase SDK loaded in index.html
    signInFlow: 'popup', 
    signInOptions: [
        // FIX: Reverting to string IDs here since the global SDK (V8) is loaded via <script> tags
        'google.com', 
        'password',
    ],
    // Do not redirect after sign-in, manage state change locally
    callbacks: {
        signInSuccessWithAuthResult: () => false, 
    },
};

/**
 * Initializes Firebase, sets up authentication, and updates the application state.
 */
export async function initializeFirebase(appState) {
    const authStatusElement = document.getElementById('auth-status');
    try {
        // Initialize modular app, but auth/firestore globals rely on the V8 script tags
        const app = initializeApp(firebaseConfig);
        appState.db = getFirestore(app);
        appState.auth = getAuth(app);

        // Attempt anonymous or custom token sign-in if available (Legacy/Canvas requirement)
        if (initialAuthToken) {
            try { 
                await signInWithCustomToken(appState.auth, initialAuthToken);
            } catch (e) {
                console.warn("Custom token sign-in failed. Proceeding with Auth Listener.");
            }
        }
        
        // Listener must be set up AFTER initialization
        onAuthStateChanged(appState.auth, (user) => {
            if (user && !user.isAnonymous) { // Check for authenticated, non-anonymous user
                appState.userId = user.uid;
                appState.isAuthReady = true;
                appState.currentView = 'genreInput'; // Change view after successful login
                authStatusElement.innerHTML = `<span class="font-semibold">User:</span> ${user.email || user.displayName || user.uid} <button id="signout-btn" class="text-indigo-400 hover:text-indigo-600 ml-2">Sign Out</button>`;
                
                fetchRecentDiscussions(appState); 
                renderApp(); 
                
                document.getElementById('signout-btn')?.addEventListener('click', async () => {
                    await signOut(appState.auth);
                });
            } else {
                // Not signed in or is anonymous, show the login view
                appState.userId = null; 
                appState.isAuthReady = true;
                appState.currentView = 'login'; // Ensure view is 'login'
                authStatusElement.innerHTML = `<span class="font-semibold text-red-500">Not Signed In</span>`;
                renderApp(); // Render the dedicated login view
            }
        });

    } catch (error) {
        console.error("Firebase Initialization Error:", error);
        authStatusElement.innerHTML = `<span class="font-bold text-red-500">Error:</span> Firebase failed to initialize. Check console.`;
    }
}

// --- Firestore Helpers ---

/**
 * Helper to get the Firestore discussion collection reference.
 */
function getNotesCollectionRef(appState) {
    if (!appState.db || !appState.userId) return null;
    // Private path: /artifacts/{appId}/users/{userId}/notes_collection
    const path = `artifacts/${appId}/users/${appState.userId}/notes_collection`;
    return collection(appState.db, path);
}

/**
 * Helper to get the Firestore discussion document reference.
 */
export function getNotesDocRef(discussionId, appState) {
    if (!discussionId) discussionId = appState.discussionId;
    const colRef = getNotesCollectionRef(appState);
    return colRef ? doc(colRef, discussionId) : null;
}

/**
 * Retrieves the last 5 saved discussions.
 */
export async function fetchRecentDiscussions(appState) {
    if (!appState.isAuthReady || !appState.userId || appState.db === null || appState.currentView !== 'genreInput') return;

    const colRef = getNotesCollectionRef(appState);
    if (!colRef) return;

    try {
        // Query the collection, limit results
        const q = query(colRef, limit(5)); 
        const snapshot = await getDocs(q);

        // Sort client-side by lastUpdated (descending)
        const discussions = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        discussions.sort((a, b) => {
            const dateA = a.lastUpdated ? a.lastUpdated.toDate().getTime() : 0;
            const dateB = b.lastUpdated ? b.lastUpdated.toDate().getTime() : 0;
            return dateB - dateA; 
        });

        appState.recentDiscussions = discussions;

        if (appState.currentView === 'genreInput') {
            renderApp(); 
        }
    } catch (e) {
        console.error("Error fetching recent discussions:", e);
    }
}

/**
 * Saves the current notes content AND the entire chat history to Firestore.
 */
export async function saveNote(noteText, appState) {
    const notesRef = getNotesDocRef(null, appState);
    if (!notesRef) {
        console.error("Cannot save note: Missing DB/User/Discussion ID or User ID.");
        return;
    }
    
    const saveStatusEl = document.getElementById('save-status');

    try {
        await setDoc(notesRef, {
            noteContent: noteText,
            chatHistory: appState.chatHistory, 
            lastUpdated: serverTimestamp(),
            area: appState.currentArea,
            genre: appState.currentGenre,
            hasSuggestions: appState.hasSuggestions, 
        }, { merge: true });
        
        console.log("Discussion state and notes saved successfully.");
        
        if (saveStatusEl) {
            saveStatusEl.textContent = 'Notes & Chat saved!';
            setTimeout(() => saveStatusEl.textContent = '', 2000);
        }

        // Only fetch and render updates if the user is not currently deleting something or navigating
        if (appState.currentView !== 'login') {
            fetchRecentDiscussions(appState); 
        }
    } catch (e) {
        console.error("Error adding/updating document: ", e);
        alertUser("Error saving notes. Please check your Firestore Security Rules and ensure writes are allowed on your path.");
        
        if (saveStatusEl) {
             saveStatusEl.textContent = 'Error saving notes.';
        }
    }
}

/**
 * Deletes the current discussion document from Firestore.
 */
export async function deleteDiscussion(appState) {
    const notesRef = getNotesDocRef(null, appState);
    if (!notesRef) {
        alertUser("Cannot delete: No active discussion selected.");
        return;
    }
    
    const confirmed = await confirmAction(`Are you sure you want to permanently delete the discussion on "${appState.currentArea}"? This cannot be undone.`);

    if (!confirmed) {
        return;
    }

    try {
        if (appState.unsubscribeNotes) {
            appState.unsubscribeNotes();
            appState.unsubscribeNotes = null;
        }
        
        await deleteDoc(notesRef);
        
        console.log("Discussion deleted successfully.");
        alertUser(`Discussion on "${appState.currentArea}" has been deleted.`);

        // Reset state and return to main screen
        appState.currentView = 'genreInput';
        appState.currentArea = '';
        appState.discussionId = null;
        appState.chatHistory = [];
        appState.currentNotes = '';
        appState.hasSuggestions = false;

        fetchRecentDiscussions(appState);
    } catch (e) {
        console.error("Error deleting document:", e);
        alertUser("Error deleting discussion. Check permissions.");
    }
}


/**
 * Sets up a real-time listener for the current discussion's notes.
 */
export function setupNotesListener(appState) {
    const notesRef = getNotesDocRef(null, appState);
    if (!notesRef) return;

    if (appState.unsubscribeNotes) {
        appState.unsubscribeNotes();
    }

    appState.unsubscribeNotes = onSnapshot(notesRef, (docSnap) => {
        const notesTextarea = document.getElementById('notes-textarea');
        if (docSnap.exists() && notesTextarea) {
            appState.currentNotes = docSnap.data().noteContent || '';
            notesTextarea.value = appState.currentNotes;
            console.log("Notes updated from Firestore.");
        } else if (notesTextarea) {
            appState.currentNotes = '';
            notesTextarea.value = '';
            console.log("Notes document not found, resetting notes.");
        }
    }, (error) => {
        console.error("Error listening to notes:", error);
    });
}