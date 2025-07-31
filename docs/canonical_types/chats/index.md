# Document: `chats/{chatId}`

This document serves as the top-level container for a single conversation. It holds minimal metadata about the chat itself, with the actual conversation content stored in the `messages` subcollection.

## Fields

| Field               | Type      | Description                                                    | Set By                                | Read By                 |  
| ------------------- | --------- | -------------------------------------------------------------- | ------------------------------------- | ----------------------- |  
| `lastInteractedAt`  | Timestamp | A server timestamp that is updated every time a new message is | `query_deployed_agent_orchestrator_logic` | _(For client display)_ |  
|                     |           | added. Used for sorting chat lists.                            |                                       |                         |  
| `name`              | String    | (Implied) A user-given name for the chat.                      | Client/UI                             | _(For client display)_ |  
| `userId`            | String    | (Implied) The UID of the user who owns this chat.              | Client/UI                             | _(For client display)_ |  

## Prototypical Example

```json  
{  
"name": "Order Inquiry #12345",  
"userId": "user-uid-abc-123",  
"lastInteractedAt": "2024-05-21T10:05:00Z"  
}  
```

## Inconsistencies and Notes
*   The backend logic only ever writes the `lastInteractedAt` field. All other fields, such as `name` or `userId`, are assumed to be set and managed by the client-side application.
*   The `chatId` is used as the `session_id` for ADK Artifacts, effectively scoping all context files (PDFs, images, etc.) to a specific chat. This is a critical design choice for data isolation.  