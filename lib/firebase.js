import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
    apiKey: "AIzaSyC5HJICufztoqzOibmmPEPX_DGqtVyH4C4",
    authDomain: "cricscorer-cc89c.firebaseapp.com",
    databaseURL: "https://cricscorer-cc89c-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "cricscorer-cc89c",
    storageBucket: "cricscorer-cc89c.firebasestorage.app",
    messagingSenderId: "965312830042",
    appId: "1:965312830042:web:12fd9e5811c1c21de31663"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export { db };
