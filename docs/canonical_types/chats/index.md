# Document: `chats/{chatId}`

This document serves as the top-level container for a single conversation. It holds metadata about the chat itself, such as its title and project association. The actual conversation content is stored in the `messages` subcollection.

## Fields

| Field               | Type             | Description                                                                              | Set By                                                              | Read By                                                     |    
| ------------------- | ---------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------- |    
| `title`             | String           | A user-given name for the chat.                                                          | Client/UI (`ProjectDetailsPage` via `createChat`, `updateChat`)       | Client/UI (`ProjectDetailsPage`, `ChatPage`)                  |    
| `ownerId`           | String           | The UID of the user who created and owns this chat.                                      | `createChat`                                                        | _(For future permissions checks)_                          |    
| `projectIds`        | Array of Strings | An array containing the ID of the project this chat belongs to.                          | `createChat`                                                        | `getChatsForProjects`, `ChatPage` (to fetch agents/models)  |    
| `lastInteractedAt`  | Timestamp        | A server timestamp updated every time a new message is added. Used for sorting chat lists. | `createChat`, `addChatMessage`, `query...orchestrator_logic`        | Client/UI (`ProjectDetailsPage`)                              |    
| `createdAt`         | Timestamp        | Server timestamp of when the chat was created.                                           | `createChat`                                                        | _(For client display)_                                        |    
| `updatedAt`         | Timestamp        | Server timestamp of when the chat metadata (e.g., title) was last updated.               | `updateChat`                                                        | _(For client display)_                                        |    

## Prototypical Example

```json  
{  
"title": "Order Inquiry #12345",  
"ownerId": "user-uid-abc-123",  
"projectIds": ["proj_xyz"],  
"createdAt": "2024-05-21T10:05:00Z",  
"lastInteractedAt": "2024-05-21T10:05:00Z"  
}  
```

## Inconsistencies and Notes
*   **Client-Driven Schema:** The backend logic only ever writes/updates the `lastInteractedAt` field during a conversation. All other fields (`title`, `ownerId`, `projectIds`) are set and managed by the client-side application (`ProjectDetailsPage`) via the `createChat` and `updateChat` service functions.
*   **ADK Session Scoping:** The `chatId` is used as the `session_id` for ADK Artifacts, effectively scoping all context files (PDFs, images, etc.) to a specific chat. This is a critical design choice for data isolation.
*   **Deletion Cascade:** The `deleteChat` service function implemented in the frontend performs a batch delete, removing both the chat document and all documents in its `messages` subcollection. This is a client-side implementation of a cascade delete.  