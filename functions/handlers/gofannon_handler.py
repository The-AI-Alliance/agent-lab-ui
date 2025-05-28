# functions/handlers/gofannon_handler.py  
import json
import os
import traceback
from firebase_admin import firestore
from firebase_functions import https_fn
from common.core import db, logger

MANIFEST_FILE_PATH = os.path.join(os.path.dirname(__file__), '..', 'gofannon_manifest.json')

def _get_gofannon_tool_manifest_logic(req: https_fn.CallableRequest):
    if not req.auth:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.UNAUTHENTICATED,
            message="Authentication required to fetch Gofannon tool manifest."
        )

    logger.info(f"Fetching Gofannon tool manifest from local file: {MANIFEST_FILE_PATH} (logic part).")
    try:
        if not os.path.exists(MANIFEST_FILE_PATH):
            logger.error(f"Local Gofannon manifest file not found at: {MANIFEST_FILE_PATH}")
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.NOT_FOUND,
                message="Local Gofannon manifest file not found. Please ensure 'gofannon_manifest.json' exists in the 'functions' directory."
            )

        with open(MANIFEST_FILE_PATH, 'r') as f:
            manifest_root_object = json.load(f)

            # Expecting the manifest_root_object to be a dictionary with a "tools" key containing the array.
        if not isinstance(manifest_root_object, dict) or "tools" not in manifest_root_object:
            logger.error(f"Local Gofannon manifest is not in expected format. It must be a JSON object with a 'tools' array. Found: {type(manifest_root_object)}")
            raise ValueError("Local Gofannon manifest format error. It must be a JSON object with a 'tools' array.")

        tools_array_from_manifest = manifest_root_object["tools"]

        if not isinstance(tools_array_from_manifest, list):
            logger.error(f"The 'tools' key in the manifest does not contain a list. Found: {type(tools_array_from_manifest)}")
            raise ValueError("The 'tools' key in the manifest must contain a JSON array of tools.")

            # Prepare data for Firestore: store the whole manifest object
        firestore_manifest_doc = {
            **manifest_root_object,
            "last_updated_firestore": firestore.SERVER_TIMESTAMP,
            "source": "local_project_file"
        }
        db.collection("gofannonToolManifest").document("latest").set(firestore_manifest_doc)
        logger.info("Full Gofannon tool manifest (object with 'tools' array) updated/set in Firestore.")

        # Return the actual array of tools to the client.  
        return {"success": True, "manifest": tools_array_from_manifest}

    except FileNotFoundError:
        logger.error(f"Local Gofannon manifest file not found (FileNotFoundError) at: {MANIFEST_FILE_PATH}")
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.NOT_FOUND, message="Local Gofannon manifest file could not be read.")
    except json.JSONDecodeError as e:
        logger.error(f"Error decoding JSON from local Gofannon manifest '{MANIFEST_FILE_PATH}': {e}")
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message=f"Error parsing local tool manifest: {e}. Ensure it is valid JSON.")
    except ValueError as e: # For format errors from our checks  
        logger.error(f"Error processing local Gofannon manifest: {e}")
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=f"Error processing local tool manifest: {e}")
    except Exception as e:
        logger.error(f"Unexpected error loading local Gofannon manifest: {e}\n{traceback.format_exc()}", exc_info=True)
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message="An unexpected error occurred while loading the tool manifest.")

__all__ = ['_get_gofannon_tool_manifest_logic']  