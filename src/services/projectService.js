// src/services/projectService.js
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
    serverTimestamp,
    orderBy,
} from 'firebase/firestore';

// --- Projects ---
export const createProject = async (userId, projectData) => {
    const docRef = await addDoc(collection(db, "projects"), {
        ...projectData,
        ownerId: userId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
    return docRef.id;
};

export const getProjects = async () => {
    // For now, gets all projects. Later could be filtered by membership.
    const q = query(collection(db, "projects"), orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const getProjectDetails = async (projectId) => {
    const docRef = doc(db, "projects", projectId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() };
    } else {
        throw new Error("Project not found");
    }
};

export const updateProject = async (projectId, projectData) => {
    const projectRef = doc(db, "projects", projectId);
    await updateDoc(projectRef, {
        ...projectData,
        updatedAt: serverTimestamp(),
    });
};

export const deleteProject = async (projectId) => {
    // Note: This only deletes the project document itself. It does not cascade
    // and remove associated agents, models, or chats. Their `projectIds`
    // field will contain a reference to a now-deleted project.
    const projectRef = doc(db, "projects", projectId);
    await deleteDoc(projectRef);
};