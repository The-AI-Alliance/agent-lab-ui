# Document: `projects/{projectId}`

This collection is **not used** by any of the backend functions provided in the codebase.

## Purpose

While the GCP Project ID is a critical piece of configuration retrieved from the environment (`get_gcp_project_config`), there is no logic that creates, reads, updates, or deletes documents within a Firestore collection named `projects`.

Any data in this collection would be for other purposes outside the scope of the provided agent execution and deployment logic.  