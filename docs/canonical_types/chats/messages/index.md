# Document: `chats/{chatId}/messages/{messageId}`

This document represents a single turn in a conversation's tree. It has been refactored to use a unified `parts` structure for all participants, eliminating the `run` object and the `context_stuffed` message type for a cleaner, more efficient schema.

## Fields

| Field                 | Type             | Description                                                                                                                                                                             | Set By                                            | Read By                                                                 |  
| --------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------- |  
| `participant`         | String           | Identifies the sender. Format: `user:{uid}`, `agent:{agentId}`, or `model:{modelId}`.                                                                                                    | `addChatMessage` (UI), `query..._logic` (Backend) | Client/UI (`ChatPage`), `_build_adk_content_from_history`                 |  
| `parentMessageId`     | String           | The ID of the preceding message in the conversational tree. `null` for the root message.                                                                                                | `addChatMessage` (UI), `query..._logic` (Backend) | `get_full_message_history`, Client/UI (`ChatPage`)                        |  
| `childMessageIds`     | Array of Strings | A list of IDs for messages that directly follow this one, enabling branching/forking.                                                                                                   | `addChatMessage` (UI), `query..._logic` (Backend) | Client/UI (`MessageActions`)                                            |  
| `timestamp`           | Timestamp        | Server timestamp of when the message document was created.                                                                                                                              | `addChatMessage` (UI), `query..._logic` (Backend) | Client/UI (`ChatPage`)                                                    |  
| `parts`               | Array of Maps    | The structured content of the message, following the `google.genai.types.Part` schema. This is the single source of truth for all message content, including text and file references. | `addChatMessage` (UI), `_run_agent_task_logic` (Backend) | `_build_adk_content_from_history`, Client/UI (`ChatPage`)                 |  
| `status`              | String           | (Assistant Messages Only) The execution state of the turn: `pending`, `running`, `completed`, `error`.                                                                                  | `query..._logic` (Backend), `_run_agent_task_logic` (Backend) | Client/UI (`ChatPage`)                                                    |  
| `errorDetails`        | Array of Strings | (Assistant Messages Only) If `status` is `error`, this contains one or more error messages detailing the failure.                                                                       | `_run_agent_task_logic` (Backend)                 | Client/UI (`ChatPage`)                                                    |  
| `inputCharacterCount` | Number           | (Assistant Messages Only) The total character count of the prompt content sent to the model for this turn, used for usage tracking.                                                         | `_execute_agent_run` (Backend)                    | N/A (For analytics/billing purposes)                                    |  

## Prototypical Example (User Message with Text and a GCS Artifact)

```json  
{  
"participant": "user:firebase-uid-123",  
"parentMessageId": "msg-abc123",  
"childMessageIds": ["msg-xyz789"],  
"timestamp": "2024-05-22T12:00:00Z",  
"parts": [  
{  
"text": "Please summarize the attached document."  
},  
{  
"file_data": {  
"file_uri": "gs://my-project-context-uploads/users/uid/annual_report.pdf",  
"mime_type": "application/pdf"  
}  
}  
],  
"status": null,  
"errorDetails": null  
}  
```

## Prototypical Example (Completed Assistant Message)

```json  
{  
"participant": "agent:agent-def456",  
"parentMessageId": "msg-xyz789",  
"childMessageIds": [],  
"timestamp": "2024-05-22T12:00:05Z",  
"status": "completed",  
"errorDetails": null,  
"parts": [  
{  
"text": "The document is an annual report detailing the company's financial performance..."  
}  
]  
}  
```

## Inconsistencies and Notes

*   **Separation of Concerns:** The main `message` document represents the **final state** of a conversational turn (the "what"). The detailed process log of *how* an assistant arrived at its response is stored in the `events` subcollection (the "how"). This separation keeps the main document small and performant for the UI.
*   **Unified Content:** All message types (user, agent, model) now use the `parts` array as the single source of truth for their content. This simplifies rendering logic in the client application.
*   **Deprecated Types:** The `context_stuffed` participant type is deprecated and no longer used. Contextual files are now attached directly to user messages within the `parts` array as `file_data` objects.
*   **Legacy Data:** The `agents/{agentId}/runs/{runId}` collection is fully deprecated and is no longer written to or read from.  