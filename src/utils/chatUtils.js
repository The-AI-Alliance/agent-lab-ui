// src/utils/chatUtils.js

// --- Tree Traversal Helpers ---
export function getPathToLeaf(messagesMap, leafMessageId) {
    const path = [];
    let currId = leafMessageId;
    while (currId) {
        const msg = messagesMap[currId];
        if (!msg) break;
        path.unshift(msg);
        currId = msg.parentMessageId;
    }
    return path;
}

export function getChildrenForMessage(messagesMap, parentId) {
    return Object.values(messagesMap)
        .filter(msg => msg.parentMessageId === parentId)
        .sort((a, b) => (a.timestamp?.seconds ?? 0) - (b.timestamp?.seconds ?? 0));
}

export function findLeafOfBranch(messagesMap, branchRootId) {
    let current = messagesMap[branchRootId];
    if (!current) return branchRootId;
    while (true) {
        const children = getChildrenForMessage(messagesMap, current.id);
        if (children.length > 0) {
            current = children[children.length - 1]; // Get the last child
        } else {
            return current.id;
        }
    }
}


// --- Message Content Helpers ---
const convertPartToContextItem = (part) => {
    if (!part) return null;
    if (part.file_data) {
        const uri = part.file_data?.file_uri || '';
        const mime = part.file_data?.mime_type || '';
        const name = uri.split('/').pop() || 'Attachment';
        let type = 'file';
        if (mime.startsWith('image/')) type = 'image';
        else if (mime.includes('pdf')) type = 'pdf';
        return {
            name,
            type,
            bytes: null,
            content: null,
            signedUrl: uri,
            mimeType: mime,
            preview: part.preview || null
        };
    }
    if (part.text) {
        return {
            name: 'Text Context',
            type: 'text',
            content: part.text,
            bytes: null,
            signedUrl: null,
            mimeType: 'text/plain',
            preview: part.preview || null
        };
    }
    return null;
};

export const extractContextItemsFromMessage = (msg) => {
    if (msg?.participant === 'context_stuffed') {
        if (Array.isArray(msg.parts) && msg.parts.length > 0) {
            return msg.parts
                .map(convertPartToContextItem)
                .filter(Boolean);
        }
    }
    return msg.items || msg.contextItems || msg.stuffedContextItems || [];
};