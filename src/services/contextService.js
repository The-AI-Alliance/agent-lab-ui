// src/services/contextService.js
import { createCallable } from '../firebaseConfig';

const fetchWebPageContentCallable = createCallable('fetch_web_page_content');
const uploadImageForContextCallable = createCallable('uploadImageForContext');
const fetchGitRepoContentsCallable = createCallable('fetch_git_repo_contents');
const processPdfContentCallable = createCallable('process_pdf_content');

// Each callable now creates the context message in Firestore directly.
// Therefore, chatId and parentMessageId must be provided.

export const fetchWebPageContent = async ({ url, chatId, parentMessageId }) => {
    try {
        const result = await fetchWebPageContentCallable({ url, chatId, parentMessageId });
        return result.data; // { success, name, storageUrl, type, mimeType, messageId, preview }
    } catch (error) {
        console.error("Error calling fetchWebPageContent callable:", error);
        throw error;
    }
};

export const fetchGitRepoContents = async ({ orgUser, repoName, gitToken, includeExt, excludeExt, directory, branch, chatId, parentMessageId }) => {
    try {
        const result = await fetchGitRepoContentsCallable({ orgUser, repoName, gitToken, includeExt, excludeExt, directory, branch, chatId, parentMessageId });
        return result.data; // { success, name, storageUrl, type, mimeType, messageId, preview }
    } catch (error) {
        console.error("Error calling fetchGitRepoContents callable:", error);
        throw error;
    }
};

export const processPdfContent = async ({ url, fileData, fileName, chatId, parentMessageId }) => { // fileData is base64 string
    try {
        const result = await processPdfContentCallable({ url, fileData, fileName, chatId, parentMessageId });
        return result.data; // { success, name, storageUrl, type, mimeType, messageId, preview }
    } catch (error) {
        console.error("Error calling processPdfContent callable:", error);
        throw error;
    }
};

export const uploadImageForContext = (params) => {
    // params: { file: File, chatId, parentMessageId }
    const { file, chatId, parentMessageId } = params || {};
    return new Promise((resolve, reject) => {
        if (!file) {
            return reject(new Error("File is required."));
        }
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async () => {
            try {
                const base64Data = reader.result.split(',')[1];
                const result = await uploadImageForContextCallable({
                    fileData: base64Data,
                    fileName: file.name,
                    mimeType: file.type,
                    chatId,
                    parentMessageId
                });
                resolve(result.data); // { success, name, storageUrl, signedUrl?, type, mimeType, messageId, preview }
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = error => reject(error);
    });
};