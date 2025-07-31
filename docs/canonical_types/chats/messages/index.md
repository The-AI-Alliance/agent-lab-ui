# Document: `chats/{chatId}/messages/{messageId}`

This document represents a single turn or message within a conversation. It can be from a user or an assistant (model/agent). Assistant messages are special, containing a `run` object that tracks the execution of the query.

## Fields

| Field                     | Type                  | Description                                                                                                                                  | Set By                                                              | Read By                                                   |  
| ------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------- |  
| `id`                      | String                | The unique ID of the message, which is a copy of its Firestore document ID.                                                                  | `query_..._logic`                                                   | _(For client use)_                                        |  
| `participant`             | String                | Identifies the sender. Format: `user:{uid}`, `agent:{agentId}`, or `model:{modelId}`.                                                        | `query_..._logic`                                                   | `get_full_message_history` (to determine role)            |  
| `parentMessageId`         | String                | The ID of the preceding message in the conversational tree. `null` for the first message.                                                      | `query_..._logic`                                                   | `get_full_message_history` (to traverse history)          |  
| `childMessageIds`         | Array of Strings      | A list of IDs for messages that directly follow this one.                                                                                    | `query_..._logic`                                                   | _(For client use)_                                        |  
| `timestamp`               | Timestamp             | Server timestamp of when the message document was created.                                                                                   | `query_..._logic`                                                   | _(For client display)_                                        |  
| `parts`                   | Array of Maps         | (Primarily for User Messages) The structured content of the user's message, including text and stubs for context items.                        | `query_..._logic`                                                   | `get_full_message_history` (to build prompt history)      |  
| `content`                 | String                | (Primarily for Assistant Messages) The final, accumulated text response from the model/agent.                                                | `_run_agent_task_logic` (in `task/__init__.py`)                     | _(For client display)_                                        |  
| `run`                     | Map                   | (Only on Assistant Messages) An object containing all data related to the execution of the query that generated this message.                  | `query_..._logic` (initial), `_run_agent_task_logic` (updates)      | `_run_agent_task_logic` (reads context)                   |  
| `run.status`              | String                | The state of the query: `pending`, `running`, `completed`, `error`.                                                                          | `query_..._logic`, `_run_agent_task_logic`                          | _(For client display)_                                        |  
| `run.inputMessage`        | String                | The raw text input from the user's turn.                                                                                                     | `query_..._logic`                                                   | _(Not read by backend)_                                   |  
| `run.rawStuffedContextItems`| Array of Maps         | The raw context content (text, image data) passed from the client for this specific turn. This is processed into artifacts by the task.       | `query_..._logic`                                                   | `_create_artifacts_from_context` (in `task/__init__.py`)  |  
| `run.processedArtifacts`  | Array of Maps         | A list of artifact reference objects (`{filename, version, type}`) created by the task from the raw context items.                             | `_create_artifacts_from_context`                                    | `_build_adk_content_from_history_and_artifacts`           |  
| `run.inputCharacterCount` | Number                | A count of the total characters in the context and history passed to the model.                                                              | `_build_adk_content_from_history_and_artifacts`                     | _(For client display)_                                        |  
| `run.outputEvents`        | Array of Maps         | A log of all event objects streamed back from the ADK Runner or model's `generate_content` call.                                             | `_run_model_direct`, `_run_vertex_agent` etc.                       | _(For debugging/client display)_                           |  
| `run.finalResponseText`   | String                | The final, complete response text. This is a duplicate of the top-level `content` field.                                                     | `_run_agent_task_logic`                                             | _(For client display)_                                        |  
| `run.queryErrorDetails`   | Array of Strings      | If `status` is `error`, this contains one or more error messages.                                                                            | `_run_agent_task_logic`                                             | _(For client display)_                                        |  
| `run.completedTimestamp`  | Timestamp             | Server timestamp of when the run finished (either `completed` or `error`).                                                                   | `_run_agent_task_logic`                                             | _(For client display)_                                        |  

## Prototypical Example (Assistant Message in Progress)

```json  
{  
"id": "msg-xyz789",  
"participant": "agent:agent-abc123",  
"parentMessageId": "msg-def456",  
"childMessageIds": [],  
"timestamp": "2024-05-21T10:05:00Z",  
"content": "",  
"run": {  
"status": "running",  
"inputMessage": "Can you summarize this document for me?",  
"rawStuffedContextItems": [  
{  
"name": "annual_report.pdf",  
"type": "pdf",  
"content": "..."  
}  
],  
"processedArtifacts": [  
{  
"filename": "pdf-a1b2c3-annual_report.pdf",  
"version": 0,  
"type": "pdf"  
}  
],  
"outputEvents": [  
{ "content": { "parts": [{ "text": "Sure, I can" }] } },  
{ "content": { "parts": [{ "text": " help with that." }] } }  
]  
}  
}  
```

## Inconsistencies and Notes

*   **Redundant Fields:** `run.finalResponseText` is a duplicate of the top-level `content` field. This is likely for convenience, to keep all "run" information self-contained while providing an easy-to-access top-level field for simple message display.
*   **Content vs. Parts:** User messages store their content in the `parts` array, while assistant messages store their final text in the `content` field. This asymmetry is intentional, as user input can be multi-part from the start, whereas the assistant's final text content is aggregated from many `outputEvents`.
*   **Large Data in Firestore:** The `run.rawStuffedContextItems` field temporarily stores the full, raw content of context files in Firestore. While this is cleared once processed into GCS artifacts, it means large documents (up to the 1 MiB Firestore document limit) are briefly held in Firestore, which could have performance and cost implications if used heavily. The `run.outputEvents` array could also grow very large for long, complex tool-using runs.  