# Document: `users/{userId}`

This collection stores profile information and application-specific permissions for each authenticated user. The `{userId}` corresponds to the UID assigned by Firebase Authentication. This document is created and updated automatically on user login and can be modified by administrators to grant permissions.

## Purpose

The user document serves two primary functions:
1.  **Profile Storage:** It caches basic user profile information from the authentication provider (e.g., Google) like display name and email.
2.  **Authorization:** It contains a `permissions` object that dictates what the user is allowed to do within the application, such as accessing the app at all or using the admin panel.

## Fields

| Field                       | Type          | Description                                                                                               | Set By                                   | Read By                                                   |    
| --------------------------- | ------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------- |    
| `uid`                       | String        | The user's unique Firebase Authentication ID.                                                             | `ensureUserProfile`                      | `AuthContext`, `getUsersForAdminReview`                     |    
| `email`                     | String        | The user's email address.                                                                                 | `ensureUserProfile`                      | Client/UI (`UserProfile`, `AdminPage`)                      |    
| `displayName`               | String        | The user's display name.                                                                                  | `ensureUserProfile`                      | Client/UI (`UserProfile`, `AdminPage`)                      |    
| `photoURL`                  | String        | A URL for the user's profile picture.                                                                     | `ensureUserProfile`                      | Client/UI (`UserProfile`)                                   |    
| `createdAt`                 | Timestamp     | Server timestamp of when the user profile was first created.                                              | `ensureUserProfile`                      | Client/UI (`AdminPage`)                                     |    
| `lastLoginAt`               | Timestamp     | Server timestamp of the user's last login.                                                                | `ensureUserProfile`                      | _(For client display)_                                        |    
| `permissions`               | Map           | An object containing boolean flags for user permissions (e.g., `isAdmin`, `isAuthorized`).                | `updateUserPermissions` (from `AdminPage`) | `AuthContext` (for `ProtectedRoute`)                      |    
| `permissionsLastUpdatedAt`  | Timestamp     | Server timestamp of when the permissions were last modified.                                              | `updateUserPermissions`                  | _(For client display)_                                        |    

## Prototypical Example

```json  
{  
"uid": "user-uid-abc-123",  
"email": "alex@example.com",  
"displayName": "Alex",  
"photoURL": "https://lh3.googleusercontent.com/a/...",  
"createdAt": "2024-01-01T12:00:00Z",  
"lastLoginAt": "2024-05-21T11:00:00Z",  
"permissions": {  
"isAuthorized": true,  
"isAdmin": false,  
"canCreateAgent": true,  
"canRunAgent": true  
},  
"permissionsLastUpdatedAt": "2024-05-20T14:00:00Z"  
}  
```

## Inconsistencies and Notes

*   **Bootstrapping Permissions:** A new user who signs in for the first time will have a profile created by `ensureUserProfile` but will **not** have a `permissions` field. The `ProtectedRoute` component will then deny them access, redirecting them to `/unauthorized`. They will appear in the `AdminPage` list for an administrator to review and assign permissions. Once permissions are set, the user can access the app on their next login/refresh.
*   **UID vs. `adkUserId`:** The backend logic for agent execution uses an `adkUserId` passed from the client. The client (`AgentRunner`) uses the `currentUser.uid` from `AuthContext` for this value, establishing a direct link between the Firebase Auth user and the ADK session/artifact owner.
*   **GCS Scoping:** The `_upload_image_and_get_uri_logic` function correctly uses the user's UID to construct a path in Google Cloud Storage (`users/{user_id}/images/...`), isolating uploaded images on a per-user basis.  