# Document: `users/{userId}`

This collection is not explicitly managed by the provided backend functions, but its existence is implied by Firebase Authentication. The `{userId}` corresponds to the UID assigned to a user upon authentication. While no specific document schema is defined or used in the backend logic, the UID is crucial for scoping other resources.

## Purpose

The primary purpose of the user's UID in this system is to act as a namespace for user-specific data, ensuring data privacy and isolation.

*   **GCS Scoping:** The `_upload_image_and_get_uri_logic` function uses the user's UID to construct a path in Google Cloud Storage (`users/{user_id}/images/...`), isolating uploaded images on a per-user basis.
*   **ADK Scoping:** The `adk_user_id` (which is derived from the Firebase Auth UID on the client) is passed to all ADK-related functions (`_execute_and_stream_to_firestore`, `save_artifact`, `load_artifact`) to scope artifacts and sessions to a specific user.

## Fields

No fields are read from or written to this document by the backend functions. Any data stored here would be managed by other parts of the application, such as a user profile page on the client.

## Prototypical Example

A document in this collection is not created by the backend, but if it were, it might look like this:

```json  
{  
"displayName": "Alex",  
"email": "alex@example.com",  
"createdAt": "2024-01-01T12:00:00Z"  
}  
```

## Inconsistencies and Notes

*   There is a distinction between `req.auth.uid` (the Firebase Auth UID) and `adkUserId` (a value passed from the client). The system assumes these are related, with the client likely using the Firebase UID to generate the `adkUserId`. This is a loose contract that relies on the client's implementation.  