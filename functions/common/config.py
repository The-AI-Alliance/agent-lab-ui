import os
import firebase_admin # For project_id retrieval
from .core import logger # Use the central logger

# --- CORS Configuration ---
CORS_ORIGINS = [
    "http://localhost:3000",
    f"https://{os.environ.get('GCP_PROJECT', 'your-project-id')}.web.app",
    f"https://{os.environ.get('GCP_PROJECT', 'your-project-id')}.firebaseapp.com"
]

# --- Global Constants ---
GOFANNON_MANIFEST_URL = "https://raw.githubusercontent.com/The-AI-Alliance/gofannon/main/manifest.json"

def get_gcp_project_config():
    """
    Determines GCP project ID, location, and staging bucket.
    """
    project_id = None
    try:
        project_id = firebase_admin.get_app().project_id
        if project_id: logger.info(f"Retrieved project ID from firebase_admin: {project_id}")
    except Exception as e:
        logger.warn(f"Could not get project ID from firebase_admin.get_app().project_id: {e}. Falling back.")

    if not project_id:
        project_id = os.environ.get("GCP_PROJECT") or os.environ.get("GOOGLE_CLOUD_PROJECT")
        if project_id: logger.info(f"Retrieved project ID from environment variables: {project_id}")

    location = "us-central1" # Default or configure as needed

    if not project_id:
        logger.error("GCP Project ID could not be determined.")
        raise ValueError("GCP Project ID not found.")

    staging_bucket_name = f"{project_id}-adk-staging"
    staging_bucket = f"gs://{staging_bucket_name}"
    logger.info(f"Using Project ID: {project_id}, Location: {location}, Staging Bucket: {staging_bucket}")
    return project_id, location, staging_bucket

__all__ = ['CORS_ORIGINS', 'GOFANNON_MANIFEST_URL', 'get_gcp_project_config']