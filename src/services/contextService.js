// src/services/contextService.js
import { createCallable } from '../firebaseConfig';

const fetchWebPageContentCallable = createCallable('fetch_web_page_content');
const uploadImageForContextCallable = createCallable('uploadImageForContext');
const fetchGitRepoContentsCallable = createCallable('fetch_git_repo_contents');
const processPdfContentCallable = createCallable('process_pdf_content');

export const fetchWebPageContent = async (url) => {
    try {
        const result = await fetchWebPageContentCallable({ url });
        return result.data; // Expected: { success: true, name: string, content: string, type: 'webpage' } or { success: false, message: string }
    } catch (error) {
        console.error("Error calling fetchWebPageContent callable:", error);
        throw error; // Re-throw to be caught by UI
    }
};

export const fetchGitRepoContents = async ({ orgUser, repoName, gitToken, includeExt, excludeExt, directory }) => {
    try {
        const result = await fetchGitRepoContentsCallable({ orgUser, repoName, gitToken, includeExt, excludeExt, directory });
        return result.data; // Expected: { success: true, items: [{ name, content, type: 'gitfile' }] } or { success: false, message: string }
    } catch (error) {
        console.error("Error calling fetchGitRepoContents callable:", error);
        throw error;
    }
};

export const processPdfContent = async ({ url, fileData, fileName }) => { // fileData is base64 string
    try {
        const result = await processPdfContentCallable({ url, fileData, fileName });
        return result.data; // Expected: { success: true, name: string, content: string, type: 'pdf' } or { success: false, message: string }
    } catch (error) {
        console.error("Error calling processPdfContent callable:", error);
        throw error;
    }
};

export const uploadImageForContext = (file) => {
    return new Promise((resolve, reject) => {
            if (!file) {
                    return reject(new Error("File is required."));
                }
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = async () => {
                    try {
                            // result is "data:image/jpeg;base64,..."
                                // We only need the part after the comma
                                    const base64Data = reader.result.split(',')[1];
                            const result = await uploadImageForContextCallable({
                                    fileData: base64Data,
                                    fileName: file.name,
                                    mimeType: file.type,
                                });
                            resolve(result.data); // Expected: { success, name, storageUrl, signedUrl }
                        } catch (error) {
                            reject(error);
                        }
                };
            reader.onerror = error => reject(error);
        });
};