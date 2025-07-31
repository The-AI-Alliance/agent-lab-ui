# Document: `projects/{projectId}`

This document represents a project, which acts as a container for organizing related chats, agents, and models. It is entirely managed by the client-side application.

## Purpose

The primary purpose of a Project is to provide a workspace for users. By associating agents, models, and chats with a project, the UI can present a filtered, context-aware view, simplifying navigation and management. For example, when creating a new agent within a project, the model selector will only show models also associated with that project.

## Fields

| Field               | Type      | Description                                                    | Set By                                                         | Read By                                                                                                                              |    
| ------------------- | --------- | -------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |    
| `name`              | String    | A user-friendly name for the project.                          | Client/UI (`CreateProjectPage`, `ProjectDetailsPage`)          | Client/UI (`ProjectsPage`, `ProjectDetailsPage`)                                                                                     |    
| `description`       | String    | A brief description of the project's purpose.                  | Client/UI (`CreateProjectPage`, `ProjectDetailsPage`)          | Client/UI (`ProjectsPage`, `ProjectDetailsPage`)                                                                                     |    
| `ownerId`           | String    | The UID of the user who created the project.                   | `createProject`                                                | _(For future permission checks)_                                                                                                      |    
| `createdAt`         | Timestamp | A server timestamp of when the project was created.            | `createProject`                                                | _(For client display)_                                                                                                              |    
| `updatedAt`         | Timestamp | A server timestamp updated when the project metadata is changed. | `createProject`, `updateProject`                               | _(For client display)_                                                                                                              |    

## Prototypical Example

```json  
{  
"name": "Q3 Marketing Campaign",  
"description": "Agents and models for analyzing Q3 marketing data and drafting campaign materials.",  
"ownerId": "user-uid-abc-123",  
"createdAt": "2024-05-19T08:00:00Z",  
"updatedAt": "2024-05-19T08:00:00Z"  
}  
```

## Inconsistencies and Notes
*   **Client-Side Only:** As the original analysis noted, this collection is not directly used by any backend agent execution or deployment logic. Its entire lifecycle (CRUD) is managed by the frontend application (`CreateProjectPage`, `ProjectsPage`, `ProjectDetailsPage`) through `firebaseService` functions.
*   **Loose Coupling:** The association between a project and its assets (agents, models, chats) is maintained via an `projectIds` array field on the asset documents themselves. This is a form of loose coupling.
*   **No Cascade Delete:** The `deleteProject` function in `firebaseService.js` only deletes the project document itself. It does **not** cascade to delete associated agents, models, or chats. These assets will simply be "orphaned," retaining the deleted project's ID in their `projectIds` array. This must be handled by the UI or a separate cleanup process if desired.  