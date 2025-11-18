// Filename: firebase_service.js (Firebase Initialization and Data Layer)

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, onSnapshot, collection, query, setDoc, getDoc, getDocs, limit, deleteDoc, serverTimestamp, setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { alertUser, confirmAction, renderApp } from "./ui_state_manager.js"; // Import UI functions

// Set Firebase Log Level
setLogLevel('debug');

// --- Firebase Configuration ---

const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// The user's provided configuration is used as a fallback if the environment variable is not present.
const defaultFirebaseConfig = {
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


/**
 * Initializes Firebase, sets up authentication, and updates the application state.
 */
export async function initializeFirebase(appState) {
    const authStatusElement = document.getElementById('auth-status');
    try {
        const app = initializeApp(firebaseConfig);
        appState.db = getFirestore(app);
        appState.auth = getAuth(app);

        // Sign in using the custom token or anonymously
        if (initialAuthToken) {
            try { 
                await signInWithCustomToken(appState.auth, initialAuthToken);
            } catch (e) {
                if (e.code === 'auth/admin-restricted-operation' || e.code === 'auth/custom-token-mismatch') {
                    console.warn("Custom token sign-in failed. Falling back to anonymous sign-in. Ensure Anonymous Auth is enabled in Firebase Console.");
                    await signInAnonymously(appState.auth);
                } else {
                    throw e; // Re-throw other critical errors
                }
            }
        } else {
            await signInAnonymously(appState.auth);
        }
        

        // Listen for Auth State Change
        onAuthStateChanged(appState.auth, (user) => {
            if (user) {
                appState.userId = user.uid;
                authStatusElement.innerHTML = `<span class="font-semibold">User ID:</span> ${user.uid} (App: ${appId})`;
                appState.isAuthReady = true;
                console.log("Firebase Auth Ready. User ID:", appState.userId);
                
                fetchRecentDiscussions(appState); 
                renderApp();
            } else {
                appState.userId = crypto.randomUUID(); 
                appState.isAuthReady = true;
                authStatusElement.innerHTML = `<span class="font-semibold text-red-500">Anonymous ID:</span> ${appState.userId} (App: ${appId})`;
                console.log("Firebase Auth Ready (Anonymous Fallback). User ID:", appState.userId);
                
                fetchRecentDiscussions(appState);
                renderApp();
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
    if (!appState.isAuthReady || !appState.userId || appState.db === null) return;

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
        console.error("Cannot save note: Missing DB/User/Discussion ID.");
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

        fetchRecentDiscussions(appState); 
    } catch (e) {
        console.error("Error adding/updating document: ", e);
        alertUser("Error saving notes. Please check your Firestore Security Rules and ensure Anonymous/Authenticated writes are allowed on your path.");
        
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