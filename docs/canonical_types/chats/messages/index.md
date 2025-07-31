# Document: `chats/{chatId}/messages/{messageId}`

This document represents a single turn or message within a conversation's tree structure. It can originate from a user, an assistant (model/agent), or be a system message indicating stuffed context. Assistant messages are special, containing a `run` object that tracks the execution of the query.

## Fields

| Field                     | Type                  | Description                                                                                                                                  | Set By                                                              | Read By                                                               |    
| ------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------- |    
| `participant`             | String                | Identifies the sender. Format: `user:{uid}`, `agent:{agentId}`, `model:{modelId}`, or `context_stuffed`.                                     | `addChatMessage` (from `ChatPage`), `query..._logic`                | `get_full_message_history`, Client/UI (`ChatPage`)                  |    
| `parentMessageId`         | String                | The ID of the preceding message in the conversational tree. `null` for the first message.                                                      | `addChatMessage` (from `ChatPage`), `query..._logic`                | `get_full_message_history`, Client/UI (`ChatPage` for path)         |    
| `childMessageIds`         | Array of Strings      | A list of IDs for messages that directly follow this one, enabling branching/forking.                                                        | `addChatMessage` (from `ChatPage`), `query..._logic`                | Client/UI (`MessageActions` for fork navigation)                    |    
| `timestamp`               | Timestamp             | Server timestamp of when the message document was created.                                                                                   | `addChatMessage`, `query..._logic`                                  | Client/UI (`ChatPage`)                                                |    
| `parts`                   | Array of Maps         | The structured content of the message, including text and stubs for context items.                                                           | `addChatMessage` (from `ChatPage`)                                  | `get_full_message_history`, Client/UI (`ChatPage`)                  |    
| `content`                 | String                | (Primarily for Assistant Messages) The final, accumulated text response from the model/agent.                                                | `_run_agent_task_logic` (in `task/__init__.py`)                     | Client/UI (`ChatPage`)                                                |    
| `contextItems`            | Array of Maps         | (Only for `context_stuffed` participant) A list of the context items that were added in this turn.                                           | `addChatMessage` (from `ChatPage`)                                  | `get_full_message_history`, Client/UI (`ContextDisplayBubble`)        |    
| `outputEvents`            | Array of Maps         | (Only on Assistant Messages) A log of all event objects streamed back from the ADK Runner or model's `generate_content` call.                 | `_run_model_direct`, `_run_vertex_agent` etc.                       | Client/UI (`AgentReasoningLogDialog`)                                 |    
| `run`                     | Map                   | (Only on Assistant Messages) An object containing all data related to the execution of the query that generated this message.                  | `query..._logic` (initial), `_run_agent_task_logic` (updates)      | `_run_agent_task_logic` (reads context)                             |    
| `run.status`              | String                | The state of the query: `pending`, `running`, `completed`, `error`.                                                                          | `query..._logic`, `_run_agent_task_logic`                          | Client/UI (`ChatPage`)                                                |    
| `run.inputMessage`        | String                | The raw text input from the user's turn.                                                                                                     | `query..._logic`                                                   | Client/UI (`AgentRunner` historical view)                           |    
| `run.stuffedContextItems` | Array of Maps         | The raw context content (text, image data) passed from the client for this specific turn. This is processed into artifacts by the task.       | `query..._logic` (from `AgentRunner`)                                 | `_create_artifacts_from_context` (in `task/__init__.py`)            |    
| `run.processedArtifacts`  | Array of Maps         | A list of artifact reference objects (`{filename, version, type}`) created by the task from the raw context items.                             | `_create_artifacts_from_context`                                    | `_build_adk_content_from_history_and_artifacts`                     |    
| `run.finalResponseText`   | String                | The final, complete response text. This is a duplicate of the top-level `content` field.                                                     | `_run_agent_task_logic`                                             | Client/UI (`AgentRunner` historical view)                           |    
| `run.queryErrorDetails`   | Array of Strings      | If `status` is `error`, this contains one or more error messages.                                                                            | `_run_agent_task_logic`                                             | Client/UI (`ChatPage`, `AgentRunner`)                                 |    

## Prototypical Example (User Message with Context)

```json  
{  
"participant": "context_stuffed",  
"parentMessageId": "msg-abc123",  
"childMessageIds": [],  
"timestamp": "2024-05-21T10:05:00Z",  
"parts": [  
{  
"type": "pdf",  
"name": "annual_report.pdf"  
}  
],  
"contextItems": [  
{  
"name": "annual_report.pdf",  
"type": "pdf",  
"content": "..."  
}  
]  
}  
```

## Inconsistencies and Notes

*   **Redundant Fields:** `run.finalResponseText` is a duplicate of the top-level `content` field. This is for convenience, to keep all "run" information self-contained while providing an easy-to-access top-level field for simple message display.
*   **Content vs. Parts:** User and context messages store their content in the `parts` array. Assistant messages store their final text in the `content` field (which is aggregated from streaming events). This asymmetry is intentional.
*   **Large Data in Firestore:** The `contextItems` and `run.stuffedContextItems` fields can temporarily store large amounts of data in Firestore before it's processed into GCS artifacts. The `outputEvents` array could also grow very large for complex tool-using runs, potentially exceeding the 1 MiB document size limit.
*   **Run History:** The `AgentRunner` component in the UI has a "historical view" mode that reads `agent/{agentId}/runs/{runId}` documents, which have a similar structure to the `run` object here. This suggests a legacy pattern that is being superseded by the integrated chat/message structure.  