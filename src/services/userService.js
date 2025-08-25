// src/services/userService.js
import { db } from '../firebaseConfig';
import {
    collection,
    getDocs,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    serverTimestamp,
} from 'firebase/firestore';

// --- User Profile and Permissions ---
export const ensureUserProfile = async (authUser) => {
    if (!authUser) return null;
    const userRef = doc(db, "users", authUser.uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
        await updateDoc(userRef, {
            lastLoginAt: serverTimestamp(),
            email: authUser.email,
            displayName: authUser.displayName || null,
            photoURL: authUser.photoURL || null,
        });
        return { uid: userSnap.id, ...userSnap.data() };
    } else {
        const newUserProfile = {
            uid: authUser.uid,
            email: authUser.email,
            displayName: authUser.displayName || null,
            photoURL: authUser.photoURL || null,
            createdAt: serverTimestamp(),
            lastLoginAt: serverTimestamp(),
        };
        await setDoc(userRef, newUserProfile);
        return newUserProfile;
    }
};

export const getUsersForAdminReview = async () => {
    const usersCol = collection(db, "users");
    const userSnapshot = await getDocs(usersCol);
    const allUsers = userSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return allUsers.filter(user => user.permissions === undefined);
};

export const updateUserPermissions = async (targetUserId, permissionsData) => {
    const userRef = doc(db, "users", targetUserId);
    try {
        await updateDoc(userRef, {
            permissions: permissionsData,
            permissionsLastUpdatedAt: serverTimestamp(),
        });
    } catch (error)
    {
        console.error(`Error updating permissions for user ${targetUserId}:`, error);
        throw error;
    }
};