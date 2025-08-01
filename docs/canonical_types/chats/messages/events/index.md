# Document: `chats/{chatId}/messages/{messageId}/events/{eventId}`

This document represents a single event within the execution trace of an assistant's turn. Storing each event as a separate document in a subcollection keeps the parent `message` document small and fast to load, while avoiding Firestore's 1 MiB document size limit for complex, multi-tool agent runs.

## Fields

| Field        | Type      | Description                                                                                                                            | Set By                           | Read By                         |  
| ------------ | --------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------- |  
| `author`     | String    | The originator of the event (e.g., `user`, `model`, `tool`).                                                                           | `_run_agent_task_logic` (Backend) | Client/UI (`AgentReasoningLogDialog`) |  
| `type`       | String    | The ADK event type (e.g., `model_request`, `model_response`, `tool_code`, `tool_result`).                                               | `_run_agent_task_logic` (Backend) | Client/UI (`AgentReasoningLogDialog`) |  
| `content`    | Map       | The event's content, typically a `parts` array following the `google.genai.types.Part` schema.                                         | `_run_agent_task_logic` (Backend) | Client/UI (`AgentReasoningLogDialog`) |  
| `actions`    | Map       | Any actions associated with the event, such as `state_delta` or `artifact_delta`.                                                      | `_run_agent_task_logic` (Backend) | Client/UI (`AgentReasoningLogDialog`) |  
| `timestamp`  | Timestamp | A server timestamp indicating when the event was logged.                                                                               | `_run_agent_task_logic` (Backend) | Client/UI (`AgentReasoningLogDialog`) |  
| `eventIndex` | Number    | A sequential number (0, 1, 2...) to preserve the strict order of events, which is more reliable than sorting by `timestamp` alone.       | `_run_agent_task_logic` (Backend) | `getEventsForMessage` (Backend)   |  

## Prototypical Example (A `tool_code` event)

**Path:** `chats/chat123/messages/msg-xyz789/events/evt-001`

```json  
{  
"author": "model",  
"type": "tool_code",  
"content": {  
"parts": [  
{  
"function_call": {  
"name": "search_web",  
"args": { "query": "financial performance 2023" }  
}  
}  
]  
},  
"actions": null,  
"timestamp": "2024-05-22T12:00:02Z",  
"eventIndex": 1  
}  
```

## Inconsistencies and Notes

*   **Purpose:** The primary reason for this subcollection is to prevent the parent `message` document from exceeding Firestore's 1 MiB size limit, which is a risk for agents that use many tools or loops. It also improves the performance of the main chat UI by allowing these detailed logs to be loaded on-demand.
*   **Ordering:** The `eventIndex` field is critical and should always be used to order events when they are fetched and displayed. Timestamps may not be sufficiently granular or unique to guarantee the correct sequence of operations.
*   **Data Structure:** The structure of the `content` map within an event adheres to the same `google.genai.types.Content` and `Part` schemas used in the parent message document, providing a consistent data format throughout the system.  