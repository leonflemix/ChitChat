import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, addDoc, updateDoc, collection, query, onSnapshot, arrayUnion, serverTimestamp, writeBatch } from 'firebase/firestore';
import { ArrowLeft, Settings, MessageSquare, History, Save, Plus, BrainCircuit, RefreshCw, LogOut, UserCheck, UserPlus, Sparkles, AlertTriangle } from 'lucide-react';

// --- Firebase Configuration ---
// Paste your Firebase config object here from your project's settings.
const firebaseConfig = {
  apiKey: "AIzaSyBIHrZMw4fQP7ghC6VyTCq--61UlWlWEZQ",
  authDomain: "chitchat-1b6d3.firebaseapp.com",
  projectId: "chitchat-1b6d3",
  storageBucket: "chitchat-1b6d3.appspot.com",
  messagingSenderId: "1075848033593",
  appId: "1:1075848033593:web:555b1a8eb9ac39efeb24e8",
  measurementId: "G-KTWCYDN0YF"
};
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-chit-chat-app';

// --- Default Categories (for first-time users) ---
const defaultCategories = [
  "Deep Questions",
  "Fun & Silly",
  "Travel Dreams",
  "Relationship Check-in",
  "Future Plans",
  "Past Memories"
];

// --- Default Custom Topics (as examples) ---
const defaultUserTopics = {
  "Deep Questions": ["What's a dream you've never said out loud?"],
  "Fun & Silly": ["If you were a type of cheese, what type would you be and why?"],
  "Travel Dreams": ["What's the most beautiful place you've ever been?"],
  "Relationship Check-in": ["What's one small thing I can do this week to make you feel more loved?"],
  "Future Plans": ["What's a skill you'd like to learn together?"],
  "Past Memories": ["What's your happiest childhood memory?"],
};

const MissingConfigScreen = () => (
    <div className="flex items-center justify-center min-h-screen bg-amber-50 text-amber-900">
        <div className="w-full max-w-2xl p-8 space-y-6 bg-white rounded-2xl shadow-lg border-2 border-amber-200">
            <div className="text-center">
                 <AlertTriangle className="mx-auto h-12 w-12 text-amber-500" />
                <h1 className="text-3xl font-bold mt-4">Configuration Needed</h1>
                <p className="text-gray-600 mt-2">To run the app, you must add your Firebase project configuration.</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg text-left">
                <p className="font-semibold mb-2">1. Open the file <code>chit-chat-app.jsx</code>.</p>
                <p className="font-semibold mb-2">2. Find the <code>firebaseConfig</code> object (around line 9).</p>
                <p className="font-semibold">3. Replace the placeholder values with your actual credentials from the Firebase console.</p>
            </div>
            <pre className="bg-gray-800 text-white p-4 rounded-lg overflow-x-auto text-sm text-left">
{`const firebaseConfig = {
  apiKey: "YOUR_KEY_HERE",
  authDomain: "your-project-id.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:a1b2c3d4e5f6g7h8"
};`}
            </pre>
             <p className="text-center text-xs text-gray-500">After pasting your config, the app will load automatically.</p>
        </div>
    </div>
);


// --- Main App Component ---
export default function App() {
  const isConfigMissing = !firebaseConfig.apiKey || firebaseConfig.apiKey.includes("PASTE_YOUR");
  
  const [view, setView] = useState('home'); // 'home', 'settings', 'history', 'detail'
  const [currentTopic, setCurrentTopic] = useState(null);
  const [currentNote, setCurrentNote] = useState('');
  const [selectedChat, setSelectedChat] = useState(null);
  const [isLoading, setIsLoading] = useState(true); // Now used for auth check
  const [isGeneratingTopic, setIsGeneratingTopic] = useState(false);
  const [isExpanding, setIsExpanding] = useState(false);
  const [error, setError] = useState(null);

  // Firebase state
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [authUser, setAuthUser] = useState(null); // Tracks the logged-in user object
  const [userId, setUserId] = useState(null);
  const [settings, setSettings] = useState({ categories: defaultCategories });
  const [history, setHistory] = useState([]);
  const [userTopics, setUserTopics] = useState({});

  // --- Firebase Initialization ---
  useEffect(() => {
    if (isConfigMissing) {
        setIsLoading(false);
        return;
    }
    try {
      const app = initializeApp(firebaseConfig);
      const appAuth = getAuth(app);
      const firestore = getFirestore(app);
      setDb(firestore);
      setAuth(appAuth);

      const unsubscribe = onAuthStateChanged(appAuth, (user) => {
        if (user) {
          setAuthUser(user);
          setUserId(user.uid);
        } else {
          setAuthUser(null);
          setUserId(null);
          // Clear user-specific data on logout
          setHistory([]);
          setUserTopics({});
          setCurrentTopic(null);
          setSettings({ categories: defaultCategories });
        }
        setIsLoading(false);
      });
      return () => unsubscribe();

    } catch (e) {
      console.error("Firebase initialization error:", e);
      setError("There was a problem starting the app.");
      setIsLoading(false);
    }
  }, [isConfigMissing]);

  // --- Data Fetching Hooks (now depends on userId) ---
  useEffect(() => {
    if (!db || !userId) {
      if (!userId) setIsLoading(false);
      return;
    }

    setIsLoading(true);
    let unsubscribers = [];

    const settingsRef = doc(db, `artifacts/${appId}/users/${userId}/preferences`, 'userSettings');
    const unsubscribeSettings = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists() && docSnap.data().categories && docSnap.data().categories.length > 0) {
        setSettings(docSnap.data());
      } else {
        setDoc(settingsRef, { categories: defaultCategories });
      }
    }, (err) => console.error("Error fetching settings:", err));
    unsubscribers.push(unsubscribeSettings);
    
    const historyQuery = query(collection(db, `artifacts/${appId}/users/${userId}/chats`));
    const unsubscribeHistory = onSnapshot(historyQuery, (querySnapshot) => {
      const historyData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      historyData.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setHistory(historyData);
    }, (err) => console.error("Error fetching history:", err));
    unsubscribers.push(unsubscribeHistory);

    const topicsCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/userTopics`);
    const unsubscribeTopics = onSnapshot(topicsCollectionRef, async (querySnapshot) => {
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
            setUserTopics(topicsData);
        }
    }, (err) => console.error("Error fetching topics:", err));
    unsubscribers.push(unsubscribeTopics);
    
    setIsLoading(false);

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [db, userId]);


  // --- Core Logic Functions (AI Integration) ---
  const getNewTopic = useCallback(async () => {
    if (settings.categories.length === 0) {
      setError("Please select at least one category in Settings.");
      return;
    }
    setIsGeneratingTopic(true);
    setError(null);

    const systemPrompt = "You are a creative assistant who generates conversation starters for couples. Your response MUST be a single, thought-provoking question or topic. Do not add any extra text, quotation marks, or labels like 'Topic:'. Just provide the sentence itself.";
    const userQuery = `Generate a conversation starter for a couple interested in these themes: ${settings.categories.join(', ')}.`;

    try {
      const apiKey = "";
      const apiUrl = `https://generativelace.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;
      
      const payload = {
        contents: [{ parts: [{ text: userQuery }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error(`API call failed with status: ${response.status}`);
      
      const result = await response.json();
      const generatedText = result.candidates?.[0]?.content?.parts?.[0]?.text;

      if (generatedText) {
        const randomCategory = settings.categories[Math.floor(Math.random() * settings.categories.length)];
        setCurrentTopic({ topic: generatedText.trim(), category: randomCategory });
        setCurrentNote('');
      } else {
        throw new Error("No content received from the AI.");
      }

    } catch (err) {
      console.error("Error generating topic:", err);
      setError("Sorry, we couldn't generate a topic right now. Please try again.");
    } finally {
      setIsGeneratingTopic(false);
    }
  }, [settings]);

  const saveChat = async () => {
    if (!db || !userId || !currentTopic || currentNote.trim() === '') {
        setError("Please add a note before saving.");
        return;
    }
    
    try {
      const newChatData = {
        ...currentTopic,
        notes: [{ text: currentNote, timestamp: serverTimestamp() }],
        createdAt: serverTimestamp()
      };
      const docRef = await addDoc(collection(db, `artifacts/${appId}/users/${userId}/chats`), newChatData);
      setSelectedChat({ id: docRef.id, ...newChatData });
      setView('detail');
      setCurrentTopic(null);
      setCurrentNote('');
    } catch (err) {
      console.error("Error saving chat:", err);
      setError("Could not save your chat.");
    }
  };

  const addTopic = async (topicText, category) => {
    if (!db || !userId || !topicText.trim() || !category.trim()) return;
    const categoryRef = doc(db, `artifacts/${appId}/users/${userId}/userTopics`, category.trim());
    try {
        const docSnap = await getDoc(categoryRef);
        if (docSnap.exists()) {
            await updateDoc(categoryRef, { topics: arrayUnion(topicText.trim()) });
        } else {
            await setDoc(categoryRef, { topics: [topicText.trim()] });
        }
        // Also add to settings if it's a new category
        if (!settings.categories.includes(category.trim())) {
            const settingsRef = doc(db, `artifacts/${appId}/users/${userId}/preferences`, 'userSettings');
            await updateDoc(settingsRef, { categories: arrayUnion(category.trim()) });
        }
    } catch (err) {
        console.error("Error adding topic:", err);
        setError("Could not add your new topic.");
    }
  };
  
  const handleSignOut = async () => {
    if (!auth) return;
    try {
        await signOut(auth);
        setView('home');
    } catch (err) {
        setError("Failed to sign out.");
    }
  };

  const expandOnTopic = async (chat) => {
      if (!chat) return;
      setIsExpanding(true);
      setError(null);
      
      const systemPrompt = "You are a helpful assistant for couples. Given a conversation topic, provide 3-5 thought-provoking follow-up questions or related ideas to help deepen the discussion. Present them as a simple, un-numbered list, with each item on a new line.";
      const userQuery = `Expand on this topic: "${chat.topic}"`;

      try {
          const apiKey = "";
          const apiUrl = `https://generativelace.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;
          const payload = { contents: [{ parts: [{ text: userQuery }] }], systemInstruction: { parts: [{ text: systemPrompt }] }, };
          const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          if (!response.ok) throw new Error(`API call failed with status: ${response.status}`);
          const result = await response.json();
          const expandedText = result.candidates?.[0]?.content?.parts?.[0]?.text;

          if (expandedText) {
              const newNote = `✨ Expanded Ideas:\n${expandedText}`;
              const chatRef = doc(db, `artifacts/${appId}/users/${userId}/chats`, chat.id);
              await updateDoc(chatRef, { notes: arrayUnion({ text: newNote, timestamp: serverTimestamp() }) });
              const updatedDoc = await getDoc(chatRef);
              if(updatedDoc.exists()) { setSelectedChat({id: updatedDoc.id, ...updatedDoc.data()}); }
          } else { throw new Error("No content received from the API."); }
      } catch (err)
 {
          console.error("Error expanding topic:", err);
          setError("Sorry, we couldn't expand on that topic right now.");
      } finally {
          setIsExpanding(false);
      }
  };

  const openDetail = (chat) => {
    setSelectedChat(chat);
    setView('detail');
  };

  // --- UI Components ---
  const Header = ({ title, onBack }) => (
    <div className="p-4 bg-white/80 backdrop-blur-sm sticky top-0 z-10 flex items-center shadow-sm">
      {onBack && (<button onClick={onBack} className="p-2 rounded-full hover:bg-gray-200 mr-2"><ArrowLeft size={20} /></button>)}
      <h1 className="text-xl font-bold text-gray-800">{title}</h1>
    </div>
  );

  const Navigation = () => (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-sm border-t border-gray-200 flex justify-around p-2">
      <button onClick={() => setView('home')} className={`flex flex-col items-center p-2 rounded-lg transition-colors ${view === 'home' ? 'text-pink-500' : 'text-gray-500 hover:text-pink-400'}`}><MessageSquare size={24} /><span className="text-xs mt-1">Chat</span></button>
      <button onClick={() => setView('history')} className={`flex flex-col items-center p-2 rounded-lg transition-colors ${view === 'history' ? 'text-pink-500' : 'text-gray-500 hover:text-pink-400'}`}><History size={24} /><span className="text-xs mt-1">History</span></button>
      <button onClick={() => setView('settings')} className={`flex flex-col items-center p-2 rounded-lg transition-colors ${view === 'settings' ? 'text-pink-500' : 'text-gray-500 hover:text-pink-400'}`}><Settings size={24} /><span className="text-xs mt-1">Settings</span></button>
    </nav>
  );

  const HomeScreen = () => (
    <div>
      <Header title="Chit Chat" />
      <div className="p-6 flex flex-col items-center justify-center text-center min-h-[calc(100vh-140px)]">
        {currentTopic ? (
          <div className="w-full max-w-md bg-white p-6 rounded-xl shadow-lg animate-fade-in">
            <span className="text-sm font-medium text-pink-500 bg-pink-100 px-3 py-1 rounded-full">{currentTopic.category}</span>
            <p className="text-2xl font-semibold text-gray-700 my-4">{currentTopic.topic}</p>
            <textarea value={currentNote} onChange={(e) => setCurrentNote(e.target.value)} placeholder="Jot down your thoughts..." className="w-full h-32 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-400 focus:border-transparent transition" />
            <div className="mt-4 flex items-center space-x-2">
              <button onClick={saveChat} className="flex-grow bg-green-500 text-white font-bold py-3 px-4 rounded-lg hover:bg-green-600 transition-transform transform hover:scale-105 flex items-center justify-center"><Save size={20} className="mr-2" />Save Chat</button>
              <button onClick={getNewTopic} disabled={isGeneratingTopic} title="Get a new topic" className="flex-shrink-0 bg-pink-500 text-white p-3 rounded-lg hover:bg-pink-600 transition-transform transform hover:scale-105 flex items-center justify-center disabled:bg-pink-300">
                 {isGeneratingTopic ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : <RefreshCw size={20} />}
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center animate-fade-in">
            <h2 className="text-3xl font-bold text-gray-800 mb-2">Ready to connect?</h2>
            <p className="text-gray-500 mb-8">Click the button to get a new conversation starter.</p>
            <button onClick={getNewTopic} disabled={isGeneratingTopic} className="bg-pink-500 text-white font-bold py-4 px-8 rounded-full shadow-lg hover:bg-pink-600 transition-transform transform hover:scale-105 flex items-center justify-center disabled:bg-pink-300">
               {isGeneratingTopic ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                  Generating...
                </>
               ) : (
                <>
                  <Sparkles size={20} className="mr-2" />
                  Start a new chat
                </>
               )}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  const SettingsScreen = () => {
      const [newTopic, setNewTopic] = useState('');
      const [newCategory, setNewCategory] = useState('');

      const handleToggle = async (category) => {
          if (!db || !userId) return;
          const newCategories = settings.categories.includes(category)
              ? settings.categories.filter(c => c !== category)
              : [...settings.categories, category];
          const settingsRef = doc(db, `artifacts/${appId}/users/${userId}/preferences`, 'userSettings');
          try { await setDoc(settingsRef, { categories: newCategories }, { merge: true }); } catch (err) { setError("Could not save your settings."); }
      };
      
      const handleAddTopic = (e) => {
        e.preventDefault();
        addTopic(newTopic, newCategory);
        setNewTopic(''); setNewCategory('');
      };
      
      const allCategories = useMemo(() => {
        const categories = new Set(settings.categories);
        Object.keys(userTopics).forEach(cat => categories.add(cat));
        return Array.from(categories).sort();
      }, [userTopics, settings.categories]);

      return (
        <div>
            <Header title="Settings" />
            <div className="p-6 pb-24">
                <div className="mb-8">
                    <h3 className="text-lg font-semibold text-gray-700 mb-4">Choose AI Topic Categories</h3>
                    <div className="space-y-3">
                        {allCategories.map(category => (
                            <label key={category} className="flex items-center p-4 bg-white rounded-lg shadow-sm cursor-pointer hover:bg-pink-50 transition">
                                <input type="checkbox" checked={settings.categories.includes(category)} onChange={() => handleToggle(category)} className="h-5 w-5 rounded border-gray-300 text-pink-500 focus:ring-pink-500" />
                                <span className="ml-4 text-gray-700 font-medium">{category}</span>
                            </label>
                        ))}
                    </div>
                </div>
                <div className="mb-8">
                    <h3 className="text-lg font-semibold text-gray-700 mb-4">Add a Custom Topic</h3>
                     <p className="text-sm text-gray-500 mb-4">Your custom topics can be found in history after you save a chat about them. Adding a new category here will also make it available for the AI.</p>
                    <form onSubmit={handleAddTopic} className="p-4 bg-white rounded-lg shadow-sm space-y-4">
                        <input type="text" value={newTopic} onChange={(e) => setNewTopic(e.target.value)} placeholder="Your new conversation topic" className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-400" required />
                        <input type="text" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="Enter a new or existing category" className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-400" required />
                        <button type="submit" className="w-full bg-pink-500 text-white font-bold py-3 px-4 rounded-lg hover:bg-pink-600 transition flex items-center justify-center"><Plus size={20} className="mr-2" /> Add Topic</button>
                    </form>
                </div>
                 <div>
                    <button onClick={handleSignOut} className="w-full bg-red-500 text-white font-bold py-3 px-4 rounded-lg hover:bg-red-600 transition flex items-center justify-center">
                        <LogOut size={20} className="mr-2" /> Sign Out
                    </button>
                </div>
            </div>
        </div>
      );
  };
  
  const HistoryScreen = () => (
    <div>
        <Header title="Chat History" />
        <div className="p-4">
            {history.length === 0 && !isLoading && (
                <div className="text-center mt-20 text-gray-500">
                    <p>You haven't saved any chats yet.</p>
                </div>
            )}
            <div className="space-y-3">
                {history.map(chat => (
                    <div key={chat.id} onClick={() => openDetail(chat)} className="bg-white p-4 rounded-lg shadow-sm cursor-pointer hover:shadow-md transition animate-fade-in">
                        <p className="font-bold text-gray-800">{chat.topic}</p>
                        <p className="text-sm text-gray-500 truncate mt-1">{chat.notes?.[0]?.text}</p>
                        <span className="text-xs font-medium text-pink-500 bg-pink-100 px-2 py-0.5 rounded-full mt-2 inline-block">{chat.category}</span>
                    </div>
                ))}
            </div>
        </div>
    </div>
  );

  const DetailScreen = () => {
    const [newNote, setNewNote] = useState('');
    const addNewNote = async () => {
        if (!db || !userId || !selectedChat || newNote.trim() === '') return;
        const chatRef = doc(db, `artifacts/${appId}/users/${userId}/chats`, selectedChat.id);
        try {
            await updateDoc(chatRef, { notes: arrayUnion({ text: newNote, timestamp: serverTimestamp() }) });
            const updatedDoc = await getDoc(chatRef);
            if(updatedDoc.exists()) { setSelectedChat({id: updatedDoc.id, ...updatedDoc.data()}); }
            setNewNote('');
        } catch (err) { setError("Could not add your note."); }
    };
    if(!selectedChat) return null;
    const sortedNotes = useMemo(() => [...(selectedChat.notes || [])].sort((a,b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0)), [selectedChat]);
    return (
        <div>
            <Header title="Chat Details" onBack={() => setView('history')} />
            <div className="p-6">
                <div className="bg-white p-6 rounded-xl shadow-lg mb-6">
                    <span className="text-sm font-medium text-pink-500 bg-pink-100 px-3 py-1 rounded-full">{selectedChat.category}</span>
                    <p className="text-2xl font-semibold text-gray-700 my-4">{selectedChat.topic}</p>
                    <button onClick={() => expandOnTopic(selectedChat)} disabled={isExpanding} className="w-full bg-indigo-500 text-white font-bold py-3 px-4 rounded-lg hover:bg-indigo-600 transition flex items-center justify-center disabled:bg-indigo-300 disabled:cursor-not-allowed">
                        {isExpanding ? (<div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>) : (<><BrainCircuit size={20} className="mr-2" /> Expand on this</>)}
                    </button>
                </div>
                <h3 className="text-lg font-semibold text-gray-700 mb-4">Notes</h3>
                <div className="space-y-3 mb-6">
                    {sortedNotes.map((note, index) => (
                        <div key={index} className="bg-white p-4 rounded-lg shadow-sm whitespace-pre-wrap">
                            <p className="text-gray-700">{note.text}</p>
                            <p className="text-xs text-gray-400 mt-2 text-right">{note.timestamp ? new Date(note.timestamp.seconds * 1000).toLocaleString() : 'Just now'}</p>
                        </div>
                    ))}
                </div>
                <div className="mt-4">
                     <textarea value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Add a new thought..." className="w-full h-24 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-400 focus:border-transparent transition" />
                    <button onClick={addNewNote} className="mt-2 w-full bg-pink-500 text-white font-bold py-3 px-4 rounded-lg hover:bg-pink-600 transition flex items-center justify-center"><Plus size={20} className="mr-2" />Add Note</button>
                </div>
            </div>
        </div>
    );
  };

  const AuthScreen = () => {
    const [isLoginView, setIsLoginView] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [authError, setAuthError] = useState('');

    const handleAuthAction = async (e) => {
        e.preventDefault();
        setAuthError('');
        if (!auth) { setAuthError("Auth service not ready."); return; }
        try {
            if (isLoginView) { await signInWithEmailAndPassword(auth, email, password); } 
            else { await createUserWithEmailAndPassword(auth, email, password); }
        } catch (error) { setAuthError(error.message.replace('Firebase: ', '')); }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-pink-50">
            <div className="w-full max-w-sm p-8 space-y-6 bg-white rounded-2xl shadow-lg">
                <div className="text-center">
                    <h1 className="text-3xl font-bold text-gray-800">Chit Chat</h1>
                    <p className="text-gray-500 mt-2">{isLoginView ? "Welcome back!" : "Create your account"}</p>
                </div>
                <form onSubmit={handleAuthAction} className="space-y-4">
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email Address" className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-400" required />
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-400" required />
                    {authError && <p className="text-sm text-red-500">{authError}</p>}
                    <button type="submit" className="w-full bg-pink-500 text-white font-bold py-3 px-4 rounded-lg hover:bg-pink-600 transition flex items-center justify-center">
                        {isLoginView ? <><UserCheck size={20} className="mr-2" /> Log In</> : <><UserPlus size={20} className="mr-2" /> Register</>}
                    </button>
                </form>
                <p className="text-sm text-center text-gray-600">
                    {isLoginView ? "Don't have an account?" : "Already have an account?"}
                    <button onClick={() => setIsLoginView(!isLoginView)} className="font-semibold text-pink-500 hover:underline ml-1">
                        {isLoginView ? "Register" : "Log In"}
                    </button>
                </p>
            </div>
        </div>
    );
  };
  
  const renderView = () => {
    switch (view) {
      case 'settings': return <SettingsScreen />;
      case 'history': return <HistoryScreen />;
      case 'detail': return <DetailScreen />;
      case 'home':
      default: return <HomeScreen />;
    }
  };

  if (isConfigMissing) {
      return <MissingConfigScreen />;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-pink-50">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-pink-500"></div>
      </div>
    );
  }

  if (!authUser) {
    return <AuthScreen />;
  }

  return (
    <div className="font-sans bg-gray-50 min-h-screen pb-20">
      {error && (
        <div className="bg-red-10 binge-l-4 border-red-500 text-red-700 p-4 m-4 rounded-md" role="alert">
          <p>{error}</p>
          <button onClick={() => setError(null)} className="font-bold ml-4">Close</button>
        </div>
      )}
      {renderView()}
      {view !== 'detail' && <Navigation />}
    </div>
  );
}

