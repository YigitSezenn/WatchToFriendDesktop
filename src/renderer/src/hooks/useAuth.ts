import { useState, useEffect } from 'react'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  updateProfile,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  deleteUser,
  sendPasswordResetEmail,
  type User as FirebaseUser
} from 'firebase/auth'
import { doc, setDoc, getDoc } from 'firebase/firestore'
import { auth, db } from '../firebase/config'
import { purgeUserData } from '../utils/accountDelete'
import { mapAuthError, normalizeEmail } from '../utils/authErrors'
import type { User } from '../types'

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function newFriendCode(): string {
  return Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('')
}

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

async function ensureUserDocument(firebaseUser: FirebaseUser): Promise<User> {
  const ref = doc(db, 'users', firebaseUser.uid)
  const snap = await getDoc(ref)
  if (snap.exists()) {
    const data = snap.data()
    return {
      uid: firebaseUser.uid,
      ...data,
      email: (data.email as string | undefined) ?? firebaseUser.email ?? '',
      displayName: (data.displayName as string | undefined) ?? firebaseUser.displayName ?? '',
      friendIds: (data.friendIds as string[] | undefined) ?? []
    } as User
  }

  const profile: User = {
    uid: firebaseUser.uid,
    email: firebaseUser.email ?? '',
    displayName: firebaseUser.displayName ?? firebaseUser.email?.split('@')[0] ?? 'Kullanıcı',
    friendIds: [],
    friendCode: newFriendCode()
  }
  await setDoc(ref, profile, { merge: true })
  return profile
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
        await firebaseUser.getIdToken()
        setUser(await ensureUserDocument(firebaseUser))
      } catch {
        setUser(authProfileUser(firebaseUser))
      } finally {
        setLoading(false)
      }
    })
    return unsub
  }, [])

  async function register(email: string, password: string, displayName: string) {
    const e = normalizeEmail(email)
    const name = displayName.trim()
    if (!name) throw mapAuthError({ code: 'auth/name-required' })
    if (!e || !e.includes('@')) throw mapAuthError({ code: 'auth/invalid-email' })
    if (!password || password.length < 6) throw mapAuthError({ code: 'auth/weak-password' })

    try {
      const cred = await createUserWithEmailAndPassword(auth, e, password)
      await updateProfile(cred.user, { displayName: name })
      const userData: User = {
        uid: cred.user.uid,
        email: e,
        displayName: name,
        friendIds: [],
        friendCode: newFriendCode()
      }
      await setDoc(doc(db, 'users', cred.user.uid), userData)
      setUser(userData)
    } catch (err) {
      throw mapAuthError(err)
    }
  }

  async function login(email: string, password: string) {
    const e = normalizeEmail(email)
    if (!e || !password.trim()) {
      throw mapAuthError({ code: 'auth/credentials-required' })
    }
    if (!e.includes('@')) {
      throw mapAuthError({ code: 'auth/invalid-email' })
    }

    try {
      const cred = await signInWithEmailAndPassword(auth, e, password)
      setUser(await ensureUserDocument(cred.user))
    } catch (err) {
      throw mapAuthError(err)
    }
  }

  async function loginWithGoogle() {
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ prompt: 'select_account' })
    try {
      const cred = await signInWithPopup(auth, provider)
      setUser(await ensureUserDocument(cred.user))
    } catch (err) {
      throw mapAuthError(err)
    }
  }

  async function resetPassword(email: string) {
    const e = normalizeEmail(email)
    if (!e || !e.includes('@')) {
      throw mapAuthError({ code: 'auth/invalid-email' })
    }
    try {
      await sendPasswordResetEmail(auth, e)
    } catch (err) {
      throw mapAuthError(err)
    }
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

  return {
    user,
    loading,
    register,
    login,
    loginWithGoogle,
    resetPassword,
    logout,
    changePassword,
    deleteAccount
  }
}
