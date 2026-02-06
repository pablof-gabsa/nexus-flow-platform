// Firebase Configuration
// Production Environment: Nexus Flow
const firebaseConfig = {
    apiKey: "AIzaSyARAw2TuXoIvc1ayki_3zTpS1k0c0SYBWM",
    authDomain: "nexus-flow-6dac7.firebaseapp.com",
    databaseURL: "https://nexus-flow-6dac7-default-rtdb.firebaseio.com",
    projectId: "nexus-flow-6dac7",
    storageBucket: "nexus-flow-6dac7.firebasestorage.app",
    messagingSenderId: "149849146336",
    appId: "1:149849146336:web:403b16005ad059b4b46185"
};

// Initialize Firebase
try {
    firebase.initializeApp(firebaseConfig);
    console.log("Firebase Initialized Successfully");
} catch (error) {
    console.error("Firebase Initialization Error:", error);
}

const db = firebase.database();
const auth = firebase.auth();
const storage = firebase.storage();
