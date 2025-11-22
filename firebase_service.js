// Filename: firebase_service.js (Firebase Initialization, Auth, and Data Layer)

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, 
    signInAnonymously, 
    signInWithCustomToken, 
    onAuthStateChanged, 
    signOut, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, onSnapshot, collection, query, setDoc, getDoc, getDocs, limit, deleteDoc, serverTimestamp, setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { alertUser, renderApp, renderLoginView } from "./ui_state_manager.js";

// Set Firebase Log Level
setLogLevel('debug');

// --- Firebase Configuration ---

export const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

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


/**
 * Initializes Firebase, sets up authentication, and updates the application state.
 */
export async function initializeFirebase(appState) {
    const authStatusElement = document.getElementById('auth-status');
    try {
        const app = initializeApp(firebaseConfig);
        appState.db = getFirestore(app);
        appState.auth = getAuth(app);

        // Legacy/Canvas auth support
        if (initialAuthToken) {
            try { 
                await signInWithCustomToken(appState.auth, initialAuthToken);
            } catch (e) {
                console.warn("Custom token sign-in failed. Proceeding with Auth Listener.");
            }
        }
        
        // Auth Listener
        onAuthStateChanged(appState.auth, (user) => {
            document.getElementById('loading-indicator').classList.add('hidden');
            
            if (user) {
                appState.userId = user.uid;
                appState.isAuthReady = true;
                
                // Only change view if we were on the login screen (avoids resetting view on page refresh)
                if (appState.currentView === 'login') {
                    appState.currentView = 'genreInput';
                }
                
                authStatusElement.innerHTML = `
                    <span class="font-semibold text-gray-700">${user.email || 'Anonymous User'}</span> 
                    <button onclick="window.handleLogout()" class="text-xs bg-gray-200 hover:bg-gray-300 px-2 py-1 rounded text-gray-700 ml-2 transition">Sign Out</button>
                `;
                
                fetchRecentDiscussions(appState); 
                renderApp(); 
            } else {
                appState.userId = null; 
                appState.isAuthReady = true;
                appState.currentView = 'login';
                authStatusElement.innerHTML = `<span class="text-xs text-gray-400">Not Signed In</span>`;
                renderApp(); 
            }
        });

    } catch (error) {
        console.error("Firebase Initialization Error:", error);
        alertUser("Error initializing Firebase.");
        document.getElementById('loading-indicator').classList.add('hidden');
    }
}

// --- Custom Auth Handlers ---

export async function handleLogin(email, password) {
    try {
        const appState = window.appState; // Access state
        if(!appState.auth) return;
        
        document.getElementById('loading-indicator').classList.remove('hidden');
        document.getElementById('loading-text').textContent = "Signing in...";
        
        await signInWithEmailAndPassword(appState.auth, email, password);
        // onAuthStateChanged will handle the redirect
        
    } catch (error) {
        document.getElementById('loading-indicator').classList.add('hidden');
        console.error("Login Error:", error);
        
        let msg = "Failed to sign in.";
        if (error.code === 'auth/invalid-credential') msg = "Invalid email or password.";
        if (error.code === 'auth/user-not-found') msg = "No account found with this email.";
        if (error.code === 'auth/wrong-password') msg = "Incorrect password.";
        if (error.code === 'auth/too-many-requests') msg = "Too many attempts. Try again later.";
        if (error.code === 'auth/operation-not-allowed') msg = "Email/Password sign-in is not enabled in Firebase Console.";
        
        alertUser(msg);
    }
}

export async function handleRegister(email, password) {
    try {
        const appState = window.appState;
        if(!appState.auth) return;

        document.getElementById('loading-indicator').classList.remove('hidden');
        document.getElementById('loading-text').textContent = "Creating account...";

        await createUserWithEmailAndPassword(appState.auth, email, password);
        // onAuthStateChanged will handle the redirect

    } catch (error) {
        document.getElementById('loading-indicator').classList.add('hidden');
        console.error("Register Error:", error);

        let msg = "Failed to create account.";
        if (error.code === 'auth/email-already-in-use') msg = "This email is already registered. Try signing in.";
        if (error.code === 'auth/weak-password') msg = "Password should be at least 6 characters.";
        if (error.code === 'auth/invalid-email') msg = "Please enter a valid email address.";
        if (error.code === 'auth/operation-not-allowed') msg = "Email/Password sign-in is not enabled in Firebase Console.";

        alertUser(msg);
    }
}

export async function handleLogout() {
    const appState = window.appState;
    if(appState.auth) {
        await signOut(appState.auth);
        appState.chatHistory = [];
        appState.currentNotes = '';
        appState.recentDiscussions = [];
        // onAuthStateChanged will handle the view update
    }
}


// --- Firestore Helpers ---

function getNotesCollectionRef(appState) {
    if (!appState.db || !appState.userId) return null;
    const path = `artifacts/${appId}/users/${appState.userId}/notes_collection`;
    return collection(appState.db, path);
}

export function getNotesDocRef(discussionId, appState) {
    if (!discussionId) discussionId = appState.discussionId;
    const colRef = getNotesCollectionRef(appState);
    return colRef ? doc(colRef, discussionId) : null;
}

export async function fetchRecentDiscussions(appState) {
    if (!appState.isAuthReady || !appState.userId || appState.db === null) return;

    const colRef = getNotesCollectionRef(appState);
    if (!colRef) return;

    try {
        // Using client-side sorting to avoid index requirements
        const q = query(colRef, limit(10)); // Fetch a few more to ensure we get top 5 sorted
        const snapshot = await getDocs(q);

        const discussions = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        discussions.sort((a, b) => {
            const dateA = a.lastUpdated ? a.lastUpdated.toDate().getTime() : 0;
            const dateB = b.lastUpdated ? b.lastUpdated.toDate().getTime() : 0;
            return dateB - dateA; 
        });

        appState.recentDiscussions = discussions.slice(0, 5);

        if (appState.currentView === 'genreInput') {
            renderApp(); 
        }
    } catch (e) {
        console.error("Error fetching recent discussions:", e);
    }
}

export async function saveNote(noteText, appState) {
    const notesRef = getNotesDocRef(null, appState);
    if (!notesRef) {
        console.error("Cannot save note: Missing IDs.");
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
        
        console.log("Saved.");
        
        if (saveStatusEl) {
            saveStatusEl.textContent = 'Saved!';
            setTimeout(() => saveStatusEl.textContent = '', 2000);
        }

        if (appState.currentView !== 'login') {
            fetchRecentDiscussions(appState); 
        }
    } catch (e) {
        console.error("Error adding/updating document: ", e);
        alertUser("Error saving. Check console.");
        if (saveStatusEl) saveStatusEl.textContent = 'Error saving.';
    }
}

export async function deleteDiscussion(appState) {
    const notesRef = getNotesDocRef(null, appState);
    if (!notesRef) {
        alertUser("No active discussion to delete.");
        return;
    }
    
    const confirmed = await confirmAction(`Delete discussion on "${appState.currentArea}"? This cannot be undone.`);

    if (!confirmed) return;

    try {
        if (appState.unsubscribeNotes) {
            appState.unsubscribeNotes();
            appState.unsubscribeNotes = null;
        }
        
        await deleteDoc(notesRef);
        
        alertUser("Discussion deleted.");

        appState.currentView = 'genreInput';
        appState.currentArea = '';
        appState.discussionId = null;
        appState.chatHistory = [];
        appState.currentNotes = '';
        appState.hasSuggestions = false;

        fetchRecentDiscussions(appState);
        renderApp();
    } catch (e) {
        console.error("Error deleting:", e);
        alertUser("Error deleting discussion.");
    }
}

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
            // Only update if user isn't actively typing (basic check) to prevent overwriting
            if (document.activeElement !== notesTextarea) {
                notesTextarea.value = appState.currentNotes;
            }
        } else if (notesTextarea) {
            appState.currentNotes = '';
        }
    });
}