// src/services/modelService.js
import { db } from '../firebaseConfig';
import {
    collection,
    addDoc,
    getDocs,
    doc,
    getDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    serverTimestamp,
    orderBy,
} from 'firebase/firestore';

// --- Models ---
export const createModel = async (userId, modelData) => {
    const docRef = await addDoc(collection(db, "models"), {
        ...modelData,
        ownerId: userId,
        isPublic: modelData.isPublic || false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });
    return docRef.id;
};

export const getMyModels = async (userId) => {
    const q = query(collection(db, "models"), where("ownerId", "==", userId), orderBy("name", "asc"));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const getPublicModels = async (currentUserId) => {
    const q = query(collection(db, "models"), where("isPublic", "==", true), orderBy("name", "asc"));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(model => model.ownerId !== currentUserId);
};

export const getModelsForProjects = async (projectIds) => {
    if (!projectIds || projectIds.length === 0) return [];
    const q = query(collection(db, "models"), where("projectIds", "array-contains-any", projectIds));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};


export const getModelDetails = async (modelId) => {
    const docRef = doc(db, "models", modelId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() };
    } else {
        throw new Error("Model not found");
    }
};

export const updateModel = async (modelId, updatedData) => {
    const modelRef = doc(db, "models", modelId);
    await updateDoc(modelRef, {
        ...updatedData,
        updatedAt: serverTimestamp()
    });
};

export const deleteModel = async (modelId) => {
    await deleteDoc(doc(db, "models", modelId));
};