// src/services/chatService.js
import { db } from '../firebaseConfig';
import {
    collection,
    addDoc,
    arrayUnion,
    getDocs,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    query,
    where,
    serverTimestamp,
    orderBy,
    onSnapshot,
    writeBatch
} from 'firebase/firestore';

// --- Chats ---
export const createChat = async (userId, chatData) => {
    const docRef = await addDoc(collection(db, "chats"), {
        ...chatData,
        ownerId: userId,
        createdAt: serverTimestamp(),
        lastInteractedAt: serverTimestamp(),
    });
    return docRef.id;
};

export const getChatsForProjects = async (projectIds) => {
    if (!projectIds || projectIds.length === 0) return [];
    const q = query(collection(db, "chats"), where("projectIds", "array-contains-any", projectIds), orderBy("lastInteractedAt", "desc"));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const getChatDetails = async (chatId) => {
    const docRef = doc(db, "chats", chatId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() };
    } else {
        throw new Error("Chat not found");
    }
};

export const getSharedChatDetails = async (sharedChatId) => {
    const docRef = doc(db, "share", sharedChatId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() };
    } else {
        throw new Error("Shared chat not found");
    }
};

export const updateChat = async (chatId, chatData) => {
    const chatRef = doc(db, "chats", chatId);
    await updateDoc(chatRef, {
        ...chatData,
        updatedAt: serverTimestamp(),
    });
};

export const deleteChat = async (chatId) => {
    const chatRef = doc(db, "chats", chatId);
    const messagesRef = collection(db, "chats", chatId, "messages");

    const batch = writeBatch(db);

    // Get all messages and add delete operations to the batch
    const messagesSnapshot = await getDocs(messagesRef);
    messagesSnapshot.forEach((messageDoc) => {
        batch.delete(messageDoc.ref);
    });

    // Add the chat document delete operation to the batch
    batch.delete(chatRef);

    // Commit the batch
    await batch.commit();
};

export const addChatMessage = async (chatId, messageData) => {
    const chatRef = doc(db, "chats", chatId);
    const messagesColRef = collection(chatRef, "messages");

    const batch = writeBatch(db);

    // Add new message
    const newMessageRef = doc(messagesColRef);
    batch.set(newMessageRef, {
        ...messageData,
        childMessageIds: [], // Always initialize with empty children
        timestamp: serverTimestamp(),
    });

    // Update parent message's children array, if applicable
    if (messageData.parentMessageId) {
        const parentMessageRef = doc(messagesColRef, messageData.parentMessageId);
        batch.update(parentMessageRef, {
            childMessageIds: arrayUnion(newMessageRef.id)
        });
    }

    // Update chat's lastInteractedAt timestamp
    batch.update(chatRef, { lastInteractedAt: serverTimestamp() });

    await batch.commit();
    return newMessageRef.id;
};

export const getChatMessages = async (chatId) => {
    const q = query(collection(db, "chats", chatId, "messages"), orderBy("timestamp", "asc"));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

 export const getSharedChatMessages = async (sharedChatId) => {
     const messagesColRef = collection(db, "share", sharedChatId, "messages");
     const querySnapshot = await getDocs(messagesColRef);
     const messages = [];
     querySnapshot.forEach(docSnap => {
         messages.push({ id: docSnap.id, ...docSnap.data() });
     });
     // Sort by timestamp ascending if timestamp field exists
     messages.sort((a, b) => {
         const aSeconds = a.timestamp?.seconds ?? 0;
         const bSeconds = b.timestamp?.seconds ?? 0;
         return aSeconds - bSeconds;
     });
     return messages;
 };

export const listenToChatMessages = (chatId, onUpdate) => {
    const q = query(collection(db, "chats", chatId, "messages"), orderBy("timestamp", "asc"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const messages = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        onUpdate(messages);
    }, (error) => {
        console.error(`Error listening to chat messages for chat ${chatId}:`, error);
        onUpdate([], error);
    });
    return unsubscribe;
};

export const updateChatMessage = async (chatId, messageId, dataToUpdate) => {
    const messageRef = doc(db, "chats", chatId, "messages", messageId);
    await updateDoc(messageRef, dataToUpdate);
}


// --- Events Subcollection ---
export const getEventsForMessage = async (chatId, messageId) => {
    const q = query(collection(db, "chats", chatId, "messages", messageId, "events"), orderBy("eventIndex", "asc"));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// --- Sharing ---
export const shareChat = async (originalChatId) => {
    const originalRef = doc(db, "chats", originalChatId);
    const originalSnap = await getDoc(originalRef);
    if (!originalSnap.exists()) throw new Error("Original chat not found");

    // 1. Create new share doc with same ID
    const shareRef = doc(db, "share", originalChatId);
    await setDoc(shareRef, {
        ...originalSnap.data(),
        id: originalChatId,
        originalChatId,
        sharedAt: serverTimestamp(),
    });

    // 2. Copy messages subcollection
    const msgsSnap = await getDocs(collection(originalRef, "messages"));
    const batch = writeBatch(db);
    msgsSnap.forEach(docSnap => {
        const targetRef = doc(db, "share", originalChatId, "messages", docSnap.id);
        batch.set(targetRef, docSnap.data());
    });
    await batch.commit();
    return originalChatId;
};

/**
 * Returns the sharedChatId if this chat was already shared.
 */
export const getSharedChatIdForOriginal = async (originalChatId) => {
    const shareDoc = await getDoc(doc(db, "share", originalChatId));
    return shareDoc.exists() ? shareDoc.id : null;
};

// Deletes the shared chat document and all its messages
export const unshareChat = async (sharedChatId) => {
    const shareRef = doc(db, "share", sharedChatId);

    // Get all messages in the shared chat
    const messagesSnapshot = await getDocs(collection(shareRef, "messages"));

    const batch = writeBatch(db);
    messagesSnapshot.forEach(docSnap => {
        batch.delete(docSnap.ref);
    });

    batch.delete(shareRef);

    await batch.commit();
};
