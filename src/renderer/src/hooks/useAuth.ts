import { useState, useEffect } from 'react'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  deleteUser
} from 'firebase/auth'
import { doc, setDoc, getDoc } from 'firebase/firestore'
import { auth, db } from '../firebase/config'
import { purgeUserData } from '../utils/accountDelete'
import type { User } from '../types'

function authProfileUser(firebaseUser: {
  uid: string
  email: string | null
  displayName: string | null
}): User {
  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email ?? '',
    displayName: firebaseUser.displayName ?? '',
    friendIds: []
  }
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null)
        setLoading(false)
        return
      }

      try {
        // Firestore isteğinden önce token'ın hazır olmasını bekle (hesap değişiminde race önlenir)
        await firebaseUser.getIdToken()
        const snap = await getDoc(doc(db, 'users', firebaseUser.uid))
        if (snap.exists()) {
          const data = snap.data()
          setUser({
            uid: firebaseUser.uid,
            ...data,
            email: (data.email as string | undefined) ?? firebaseUser.email ?? '',
            displayName: (data.displayName as string | undefined) ?? firebaseUser.displayName ?? '',
            friendIds: (data.friendIds as string[] | undefined) ?? []
          } as User)
        } else {
          const profile = authProfileUser(firebaseUser)
          await setDoc(doc(db, 'users', firebaseUser.uid), {
            email: profile.email,
            displayName: profile.displayName,
            friendIds: [],
            uid: firebaseUser.uid
          }, { merge: true })
          setUser(profile)
        }
      } catch {
        // İzin/geçici ağ hatasında Auth profiliyle devam et — uygulama kilitlenmesin
        setUser(authProfileUser(firebaseUser))
      } finally {
        setLoading(false)
      }
    })
    return unsub
  }, [])

  async function register(email: string, password: string, displayName: string) {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    await updateProfile(cred.user, { displayName })
    const userData = { email, displayName, friendIds: [], uid: cred.user.uid }
    await setDoc(doc(db, 'users', cred.user.uid), userData)
    setUser({ uid: cred.user.uid, ...userData })
  }

  async function login(email: string, password: string) {
    await signInWithEmailAndPassword(auth, email, password)
  }

  async function logout() {
    await signOut(auth)
    setUser(null)
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    const firebaseUser = auth.currentUser
    if (!firebaseUser?.email) throw new Error('auth_required')
    if (newPassword.length < 6) throw new Error('weak_password')
    const cred = EmailAuthProvider.credential(firebaseUser.email, currentPassword)
    await reauthenticateWithCredential(firebaseUser, cred)
    await updatePassword(firebaseUser, newPassword)
  }

  async function deleteAccount(password: string, friendIds: string[]) {
    const firebaseUser = auth.currentUser
    if (!firebaseUser?.email) throw new Error('auth_required')
    const cred = EmailAuthProvider.credential(firebaseUser.email, password)
    await reauthenticateWithCredential(firebaseUser, cred)
    setUser(null)
    await purgeUserData(firebaseUser.uid, friendIds)
    await deleteUser(firebaseUser)
  }

  return { user, loading, register, login, logout, changePassword, deleteAccount }
}
