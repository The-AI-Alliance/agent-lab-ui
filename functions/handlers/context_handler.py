# functions/handlers/context_handler.py
import os
import base64
import uuid
import httpx
import io
from google.cloud import storage
from google.cloud import firestore as gcf
from google.cloud.firestore_v1 import SERVER_TIMESTAMP
from pypdf import PdfReader

from firebase_functions import https_fn
from common.core import logger


# --- Generic GCS Uploader Helper ---
def _upload_bytes_to_gcs(
        user_id: str,
        file_bytes: bytes,
        file_name: str,
        mime_type: str,
        context_type: str,
        make_public: bool = False
):
    """Uploads a byte string to GCS and returns a structured response."""
    logger.info(f"Uploading context file for user {user_id} to GCS: {file_name}, type: {context_type}, mimeType: {mime_type}")
    from common.config import get_gcp_project_config
    try:
        project_id, _, _ = get_gcp_project_config()
        bucket_name = f"{project_id}-context-uploads"
        storage_client = storage.Client()
        bucket = storage_client.bucket(bucket_name)
        if not bucket.exists():
            logger.warning(f"Storage bucket '{bucket_name}' not found. Creating it with default settings.")
            bucket = storage_client.create_bucket(bucket, location=os.environ.get("FUNCTION_REGION", "us-central1"))

        _, file_extension = os.path.splitext(file_name)
        unique_filename = f"{uuid.uuid4().hex}{file_extension}"
        blob_path = f"users/{user_id}/files/{unique_filename}"
        blob = bucket.blob(blob_path)

        blob.upload_from_string(file_bytes, content_type=mime_type)

        public_url = None
        if make_public:
            try:
                blob.make_public()
                public_url = blob.public_url
                logger.info(f"Made blob public at URL: {public_url}")
            except Exception as e:
                logger.warning(f"Failed to make blob public: {e}")

        storage_uri = f"gs://{bucket.name}/{blob.name}"
        logger.info(f"Context file for user {user_id} uploaded to {storage_uri}.")
        return {
            "success": True,
            "name": file_name,
            "storageUrl": storage_uri,
            "type": context_type,
            "mimeType": mime_type,
            "publicUrl": public_url
        }
    except Exception as e:
        logger.error(f"Error during GCS upload for user {user_id}: {e}", exc_info=True)
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=f"Failed to upload context file: {e}")


def _create_context_message(
        user_id: str,
        chat_id: str,
        parent_message_id: str,
        file_uri: str,
        mime_type: str,
        preview_map: dict
) -> str:
    """Create a 'context_stuffed' message in Firestore and return its ID."""
    try:
        db = gcf.Client()
        messages = db.collection("chats").document(chat_id).collection("messages")
        data = {
            "participant": "context_stuffed",
            "parts": [{
                "file_data": {
                    "file_uri": file_uri,
                    "mime_type": mime_type
                },
                "preview": preview_map
            }],
            "parentMessageId": parent_message_id,
            "timestamp": SERVER_TIMESTAMP,
            "createdBy": f"user:{user_id}"
        }
        doc_ref = messages.document()
        doc_ref.set(data)
        logger.info(f"Created context message {doc_ref.id} in chat {chat_id}")
        return doc_ref.id
    except Exception as e:
        logger.error(f"Failed to create context message in Firestore: {e}", exc_info=True)
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=f"Failed to create context message: {e}")


# --- Web Page Fetching ---
def _fetch_web_page_content_logic(req: https_fn.CallableRequest):
    logger.info(f"[_fetch_web_page_content_logic] Function called with data keys: {list(req.data.keys()) if isinstance(req.data, dict) else 'Non-dict data'}")
    if not req.auth:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.UNAUTHENTICATED, message="Authentication required.")

    url = req.data.get("url")
    chat_id = req.data.get("chatId")
    parent_message_id = req.data.get("parentMessageId")
    if not url:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message="URL is required.")
    if not chat_id:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message="chatId is required.")

    try:
        headers = {'User-Agent': 'AgentLab-ContextFetcher/1.0'}
        logger.info(f"[_fetch_web_page_content_logic] Fetching web page content from URL: {url}")
        with httpx.Client(timeout=20.0) as client:
            response = client.get(url, headers=headers)
            response.raise_for_status()
            raw_content_bytes = response.content
            mime_type = response.headers.get('Content-Type', 'text/plain; charset=utf-8').split(';')[0]
            file_name_from_url = url.split('/')[-1] or "webpage.html"
        logger.info(f"Fetched web page content from {url}, size: {len(raw_content_bytes)} bytes, mimeType: {mime_type}")

        # Create a text preview (first 1000 chars)
        try:
            preview_text = raw_content_bytes.decode('utf-8', errors='ignore')[:1000]
        except Exception:
            preview_text = ""

        upload_result = _upload_bytes_to_gcs(
            user_id=req.auth.uid,
            file_bytes=raw_content_bytes,
            file_name=file_name_from_url,
            mime_type=mime_type,
            context_type='webpage',
            make_public=False
        )

        preview_map = {"type": "text", "value": preview_text}
        message_id = _create_context_message(
            user_id=req.auth.uid,
            chat_id=chat_id,
            parent_message_id=parent_message_id,
            file_uri=upload_result["storageUrl"],
            mime_type=upload_result["mimeType"],
            preview_map=preview_map
        )

        return {
            **upload_result,
            "success": True,
            "messageId": message_id,
            "preview": preview_map
        }
    except httpx.RequestError as err:
        logger.error(f"Error fetching web page {url}: {err}")
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=f"Failed to fetch web page: {str(err)}")


# --- Git Repository Fetching ---
GITHUB_API_BASE = "https://api.github.com"
NEW_FILE_SEPARATOR = "\n\n---<newfile>--\n\n"

def get_github_token():
    return os.environ.get("GITHUB_TOKEN")

def fetch_repo_file_content(session: httpx.Client, owner, repo, path, token):
    headers = {"Accept": "application/vnd.github.v3.raw"}
    if token:
        headers["Authorization"] = f"token {token}"
    file_url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{path}"
    try:
        response = session.get(file_url, headers=headers, timeout=15)
        response.raise_for_status()
        return response.text
    except httpx.RequestError as e:
        logger.warn(f"Failed to fetch content for {path} in {owner}/{repo}: {e}")
        return None

def list_repo_files_recursive(session: httpx.Client, owner, repo, path, token, include_ext, exclude_ext, files_list, processed_paths, depth=0):
    if depth > 10:
        logger.warn(f"Max recursion depth reached for path: '{path}' in {owner}/{repo}")
        return
    MAX_FILES_PER_REPO = 100
    if len(files_list) >= MAX_FILES_PER_REPO:
        return
    headers = {"Accept": "application/vnd.github.v3+json"}
    if token:
        headers["Authorization"] = f"token {token}"
    contents_url_path_part = f"/{path.strip('/')}" if path.strip('/') else ""
    contents_url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents{contents_url_path_part}"
    try:
        response = session.get(contents_url, headers=headers, timeout=20)
        response.raise_for_status()
        contents = response.json()
        if not isinstance(contents, list): return

        tasks = []
        for item in contents:
            if len(files_list) >= MAX_FILES_PER_REPO: break
            item_path, item_type, item_name = item.get("path"), item.get("type"), item.get("name")
            if not all([item_path, item_type, item_name]) or item_path in processed_paths: continue
            processed_paths.add(item_path)
            if item_type == "file":
                _, ext_with_dot = os.path.splitext(item_name)
                ext = ext_with_dot.lstrip('.').lower() if ext_with_dot else ""
                should_include = not (include_ext and ext not in include_ext) and not (exclude_ext and ext in exclude_ext)
                if should_include:
                    files_list.append({"path": item_path, "name": item_name})
            elif item_type == "dir":
                task = list_repo_files_recursive(session, owner, repo, item_path, token, include_ext, exclude_ext, files_list, processed_paths, depth + 1)
                tasks.append(task)

    except httpx.HTTPStatusError as e:
        if e.response is not None and e.response.status_code == 404:
            logger.warn(f"Directory/path '{path}' not found in {owner}/{repo} (404).")
            return
        raise

def _fetch_git_repo_contents_logic(req: https_fn.CallableRequest):
    if not req.auth:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.UNAUTHENTICATED, message="Authentication required.")
    data = req.data
    org_user, repo_name = data.get("orgUser"), data.get("repoName")
    chat_id = data.get("chatId")
    parent_message_id = data.get("parentMessageId")
    if not org_user or not repo_name:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message="Organization/User and Repository Name are required.")
    if not chat_id:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message="chatId is required.")

    auth_token = data.get("gitToken") or get_github_token()
    files_to_fetch_meta, processed_paths = [], set()
    try:
        with httpx.Client() as session:
            directory = data.get('directory', "")
            list_repo_files_recursive(session, org_user, repo_name, directory, auth_token, data.get("includeExt", []), data.get("excludeExt", []), files_to_fetch_meta, processed_paths)
    except Exception as e_list:
        logger.error(f"Critical error during repo file listing for {org_user}/{repo_name}: {e_list}")
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=f"Failed to list repository files: {str(e_list)}")

    if not files_to_fetch_meta:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.NOT_FOUND, message="No files found matching the specified criteria in the repository.")

    content_chunks = []
    total_content_size, MAX_TOTAL_CONTENT_SIZE = 0, 5 * 1024 * 1024
    with httpx.Client() as session:
        fetch_tasks = [fetch_repo_file_content(session, org_user, repo_name, file_meta["path"], auth_token) for file_meta in files_to_fetch_meta]
        fetched_contents = fetch_tasks

    for i, content in enumerate(fetched_contents):
        file_meta = files_to_fetch_meta[i]
        if content:
            if total_content_size + len(content) > MAX_TOTAL_CONTENT_SIZE:
                content_chunks.append(f"{file_meta['path']}\n... [TOTAL CONTENT LIMIT REACHED, FILE SKIPPED] ...")
                continue
            content_chunks.append(f"{file_meta['path']}\n{content}")
            total_content_size += len(content)
        else:
            content_chunks.append(f"{file_meta['path']}\n... [Failed to fetch content] ...")

    monolithic_content = NEW_FILE_SEPARATOR.join(content_chunks)
    file_name = f"clone_{org_user}_{repo_name}.txt"
    logger.info(f"Fetched {len(files_to_fetch_meta)} files from {org_user}/{repo_name}, total content size: {total_content_size} bytes.")

    upload_result = _upload_bytes_to_gcs(
        user_id=req.auth.uid,
        file_bytes=monolithic_content.encode('utf-8'),
        file_name=file_name,
        mime_type='text/plain',
        context_type='git_repo',
        make_public=False
    )

    # Preview: list of all files separated by line carriage (newline)
    preview_list = "\n".join([meta["path"] for meta in files_to_fetch_meta])
    preview_map = {"type": "file_list", "value": preview_list}

    message_id = _create_context_message(
        user_id=req.auth.uid,
        chat_id=chat_id,
        parent_message_id=parent_message_id,
        file_uri=upload_result["storageUrl"],
        mime_type=upload_result["mimeType"],
        preview_map=preview_map
    )

    return {
        **upload_result,
        "success": True,
        "messageId": message_id,
        "preview": preview_map
    }

# --- PDF Processing ---
def _process_pdf_content_logic(req: https_fn.CallableRequest):
    if not req.auth:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.UNAUTHENTICATED, message="Authentication required.")
    url, file_data_base64, file_name_from_client = req.data.get("url"), req.data.get("fileData"), req.data.get("fileName")
    chat_id = req.data.get("chatId")
    parent_message_id = req.data.get("parentMessageId")
    if not chat_id:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message="chatId is required.")

    pdf_bytes, pdf_source_name = None, "Uploaded PDF"
    if url:
        pdf_source_name = url.split('/')[-1]
        try:
            with httpx.Client() as client:
                response = client.get(url, headers={'User-Agent': 'AgentLab-ContextFetcher/1.0'}, timeout=30)
                response.raise_for_status()
                pdf_bytes = response.content
        except httpx.RequestError as e:
            raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=f"Failed to fetch PDF from URL: {str(e)}")
    elif file_data_base64:
        pdf_source_name = file_name_from_client or "Uploaded PDF"
        try:
            pdf_bytes = base64.b64decode(file_data_base64)
        except Exception as e:
            logger.error(f"Error decoding base64 PDF data: {e}")
            raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message="Invalid PDF file data provided.")
    else:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message="Either PDF URL or file data is required.")
    if not pdf_bytes:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message="Could not load PDF data.")

    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        text_content = "".join(page.extract_text() or "" for page in reader.pages)
        MAX_PDF_CONTENT_LENGTH = 2 * 1024 * 1024
        if len(text_content) > MAX_PDF_CONTENT_LENGTH:
            text_content = text_content[:MAX_PDF_CONTENT_LENGTH] + "\n... [PDF CONTENT TRUNCATED]"
        logger.info(f"Extracted {len(text_content)} characters from PDF: {pdf_source_name}")

        # Preview is first 1000 characters of extracted text
        preview_text = (text_content or "")[:1000]

        upload_result = _upload_bytes_to_gcs(
            user_id=req.auth.uid,
            file_bytes=text_content.encode('utf-8'),
            file_name=f"{os.path.splitext(pdf_source_name)[0]}.txt",
            mime_type='text/plain',
            context_type='pdf',
            make_public=False
        )

        preview_map = {"type": "text", "value": preview_text}
        message_id = _create_context_message(
            user_id=req.auth.uid,
            chat_id=chat_id,
            parent_message_id=parent_message_id,
            file_uri=upload_result["storageUrl"],
            mime_type=upload_result["mimeType"],
            preview_map=preview_map
        )

        return {
            **upload_result,
            "success": True,
            "messageId": message_id,
            "preview": preview_map
        }
    except Exception as e:
        if "encrypted" in str(e).lower():
            raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.FAILED_PRECONDITION, message="PDF is encrypted and cannot be processed.")
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=f"Failed to process PDF: {str(e)}")

# --- Image Upload ---
def _upload_image_and_get_uri_logic(req: https_fn.CallableRequest):
    if not req.auth:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.UNAUTHENTICATED, message="Authentication required.")
    data = req.data
    file_data_base64, file_name, mime_type = data.get("fileData"), data.get("fileName"), data.get("mimeType")
    chat_id = data.get("chatId")
    parent_message_id = data.get("parentMessageId")
    user_id = req.auth.uid
    if not all([file_data_base64, file_name, mime_type, user_id]):
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message="Missing required fields: fileData, fileName, mimeType.")
    if not chat_id:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message="chatId is required.")
    try:
        image_bytes = base64.b64decode(file_data_base64)
        upload_result = _upload_bytes_to_gcs(
            user_id=user_id,
            file_bytes=image_bytes,
            file_name=file_name,
            mime_type=mime_type,
            context_type='image',
            make_public=True  # Make image public for preview
        )
        # Preview should be the public URL of the image
        preview_map = {"type": "image_url", "value": upload_result.get("publicUrl")}
        message_id = _create_context_message(
            user_id=user_id,
            chat_id=chat_id,
            parent_message_id=parent_message_id,
            file_uri=upload_result["storageUrl"],
            mime_type=upload_result["mimeType"],
            preview_map=preview_map
        )

        return {
            **upload_result,
            "success": True,
            "messageId": message_id,
            "preview": preview_map
        }
    except Exception as e:
        logger.error(f"Error processing image upload for user {user_id}: {e}", exc_info=True)
        # The helper will raise the HttpsError as needed
        raise

# This __all__ list makes the functions importable by main.py
__all__ = [
    '_fetch_web_page_content_logic',
    '_fetch_git_repo_contents_logic',
    '_process_pdf_content_logic',
    '_upload_image_and_get_uri_logic'
]