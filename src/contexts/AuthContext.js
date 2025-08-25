import React, { createContext, useState, useEffect, useContext } from 'react';
import { auth, db } from '../firebaseConfig';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { googleProvider } from '../firebaseConfig';
import { ensureUserProfile } from '../services/userService'; // Import new function
import { doc, onSnapshot } from 'firebase/firestore';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const loginWithGoogle = () => signInWithPopup(auth, googleProvider);
    const logout = () => signOut(auth);

    useEffect(() => {
        let unsubscribeUserDoc = null;

        const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
            if (user) {
                // Ensure user profile exists in Firestore
                await ensureUserProfile(user);

                // Subscribe to Firestore user document for real-time updates
                const userDocRef = doc(db, 'users', user.uid);
                unsubscribeUserDoc = onSnapshot(userDocRef, (docSnapshot) => {
                    if (docSnapshot.exists()) {
                        const userProfile = docSnapshot.data();
                        setCurrentUser({
                            ...user,
                            ...userProfile,
                        });
                    } else {
                        // If user doc does not exist, fallback to just auth user
                        setCurrentUser({ ...user });
                    }
                    setLoading(false);
                });
            } else {
                // User is signed out
                setCurrentUser(null);
                setLoading(false);
                if (unsubscribeUserDoc) {
                    unsubscribeUserDoc();
                    unsubscribeUserDoc = null;
                }
            }
        });

        return () => {
            unsubscribeAuth();
            if (unsubscribeUserDoc) unsubscribeUserDoc();
        };
    }, []);

    const value = { currentUser, loginWithGoogle, logout, loading };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);