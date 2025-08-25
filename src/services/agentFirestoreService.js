// src/services/agentFirestoreService.js
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

// --- Agents ---
export const createAgentInFirestore = async (currentUserId, agentData, isImportOrCopy = false) => {
    // Start with a copy of the incoming data to avoid mutating the original object.
    const sanitizedData = { ...agentData };

    if (isImportOrCopy) {
        // When copying or importing, strip all metadata that should be regenerated.
        // This is crucial for security and data integrity.
        delete sanitizedData.id; // Firestore will generate a new ID.
        delete sanitizedData.userId; // The new owner will be the current user.
        delete sanitizedData.createdAt;
        delete sanitizedData.updatedAt;
        delete sanitizedData.deploymentStatus;
        delete sanitizedData.vertexAiResourceName;
        delete sanitizedData.lastDeployedAt;
        delete sanitizedData.lastDeploymentAttemptAt;
        delete sanitizedData.deploymentError;
        // API keys should never be carried over in a copy or import.
        delete sanitizedData.litellm_api_key;
        if (sanitizedData.childAgents && Array.isArray(sanitizedData.childAgents)) {
            sanitizedData.childAgents = sanitizedData.childAgents.map(ca => {
                const cleanChild = { ...ca };
                delete cleanChild.litellm_api_key;
                return cleanChild;
            });
        }
    }

    // Construct the final object for Firestore with correct ownership and fresh metadata.
    const finalDataForFirestore = {
        ...sanitizedData,
        userId: currentUserId, // Explicitly set the owner to the current user.
        isPublic: false,      // Copies/imports are private by default.
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    };

    // Reset deployment status for the new agent.
    if (finalDataForFirestore.platform === 'a2a') {
        finalDataForFirestore.deploymentStatus = 'n/a';
    } else { // Default to google_vertex or keep the existing platform.
        finalDataForFirestore.platform = finalDataForFirestore.platform || 'google_vertex';
        finalDataForFirestore.deploymentStatus = "not_deployed";
        finalDataForFirestore.vertexAiResourceName = null;
        finalDataForFirestore.lastDeployedAt = null;
        finalDataForFirestore.deploymentError = null;
    }

    const docRef = await addDoc(collection(db, "agents"), finalDataForFirestore);
    return docRef.id;
};

export const getMyAgents = async (userId) => {
    const q = query(collection(db, "agents"), where("userId", "==", userId), orderBy("name", "asc"));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const getPublicAgents = async (currentUserId) => {
    const q = query(collection(db, "agents"), where("isPublic", "==", true), orderBy("name", "asc"));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(agent => agent.userId !== currentUserId);
};

export const getAgentsForProjects = async (projectIds) => {
    if (!projectIds || projectIds.length === 0) return [];
    const q = query(collection(db, "agents"), where("projectIds", "array-contains-any", projectIds));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export const getAgentDetails = async (agentId) => {
    const docRef = doc(db, "agents", agentId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() };
    } else {
        throw new Error("Agent not found");
    }
};

export const updateAgentInFirestore = async (agentId, updatedData) => {
    const agentRef = doc(db, "agents", agentId);
    await updateDoc(agentRef, {
        ...updatedData,
        updatedAt: serverTimestamp()
    });
};

export const deleteAgentFromFirestore = async (agentId) => {
    await deleteDoc(doc(db, "agents", agentId));
};