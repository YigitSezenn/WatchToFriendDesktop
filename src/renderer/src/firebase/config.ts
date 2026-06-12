import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getDatabase } from 'firebase/database'

// Firebase Console → Proje Ayarları → Web uygulaması ekle → config buraya
// appId: Firebase Console'dan web uygulaması ekleyince alınır
const firebaseConfig = {
  apiKey: 'AIzaSyDrs98KthyNXl7IL0Uf2P3dZIvNFlyCXFk',
  authDomain: 'watchtofriend.firebaseapp.com',
  databaseURL: 'https://watchtofriend-default-rtdb.firebaseio.com',
  projectId: 'watchtofriend',
  storageBucket: 'watchtofriend.firebasestorage.app',
  messagingSenderId: '23845201969',
  appId: '1:23845201969:web:0ebbaee524f1b3e367cd10',
  measurementId: 'G-RRLZQ15RDW'
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
// Realtime Database — ekran paylaşımı frame relay (mobil ile aynı mekanizma)
export const rtdb = getDatabase(app)
