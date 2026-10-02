import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCeiJdQKTUyfBhF_vr9WOMC8AWcmW8Dmu0",
  authDomain: "student-hub-2f91d.firebaseapp.com",
  projectId: "student-hub-2f91d",
  storageBucket: "student-hub-2f91d.firebasestorage.app",
  messagingSenderId: "23867295448",
  appId: "1:23867295448:web:064b2eba5857d05278f9ad",
  measurementId: "G-P70EPZ6MWK"
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);