# functions/handlers/context_handler.py
import os
import base64
import requests
import io # For PyPDF2 with in-memory bytes
from pypdf import PdfReader
from firebase_functions import https_fn
from common.core import logger

# --- Web Page Fetching ---
def _fetch_web_page_content_logic(req: https_fn.CallableRequest):
    if not req.auth:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.UNAUTHENTICATED, message="Authentication required.")

    url = req.data.get("url")
    if not url:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message="URL is required.")

    try:
        headers = {'User-Agent': 'AgentLabUI-ContextFetcher/1.0'}
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status() # Raises HTTPError for bad responses (4xx or 5xx)

        # For now, return raw content. Could add BeautifulSoup parsing later.
        # soup = BeautifulSoup(response.content, 'html.parser')
        # text_content = soup.get_text(separator='\n', strip=True)
        raw_content = response.text

        # Truncate if too long to prevent excessive data transfer / prompt length
        # This limit should be configurable or more dynamic in a real app
        MAX_WEB_CONTENT_LENGTH = 500 * 1024 # 500KB
        if len(raw_content) > MAX_WEB_CONTENT_LENGTH:
            raw_content = raw_content[:MAX_WEB_CONTENT_LENGTH] + "\n... [TRUNCATED]"

        return {"success": True, "name": url, "content": raw_content, "type": "webpage"}
    except requests.exceptions.RequestException as e:
        logger.error(f"Error fetching web page {url}: {e}")
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=f"Failed to fetch web page: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error processing web page {url}: {e}")
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message="An unexpected error occurred.")


    # --- Git Repository Fetching ---
GITHUB_API_BASE = "https://api.github.com"

def get_github_token():
    # Priority: User-provided token -> Environment variable -> None
    # For this function, user token is passed in `req.data.get("gitToken")`
    # The environment variable GITHUB_TOKEN is a fallback for the function's own use (e.g. public repos)
    return os.environ.get("GITHUB_TOKEN") # Use a specific env var for the function

def fetch_repo_file_content(owner, repo, path, token):
    headers = {"Accept": "application/vnd.github.v3.raw"} # Get raw content
    if token:
        headers["Authorization"] = f"token {token}"

    file_url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{path}"
    try:
        response = requests.get(file_url, headers=headers, timeout=10)
        response.raise_for_status()
        return response.text
    except requests.exceptions.RequestException as e:
        logger.warn(f"Failed to fetch content for {path} in {owner}/{repo}: {e}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error fetching file content for {path}: {e}")
        return None


def list_repo_files_recursive(owner, repo, path, token, include_ext, exclude_ext, files_list, processed_paths, depth=0):
    logger.info(f"list_repo_files_recursive: Called for {owner}/{repo}, path='{path}', depth={depth}, token_present={bool(token)}, include_ext={include_ext}, exclude_ext={exclude_ext}")

    if depth > 10: # Max recursion depth
        logger.warn(f"Max recursion depth reached for path: '{path}' in {owner}/{repo}")
        return

    MAX_FILES_PER_REPO = 50 # Safety limit
    if len(files_list) >= MAX_FILES_PER_REPO:
        logger.warn(f"Reached max file limit ({MAX_FILES_PER_REPO}) for repo {owner}/{repo}. Current files: {len(files_list)}")
        return

    headers = {"Accept": "application/vnd.github.v3+json"} # Standard JSON response
    if token:
        headers["Authorization"] = f"token {token}"

        # Construct URL path part carefully
    # If path is empty (root), contents_url_path_part is empty, so URL is /repos/.../contents
    # If path is 'docs', contents_url_path_part is '/docs', so URL is /repos/.../contents/docs
    contents_url_path_part = f"/{path.strip('/')}" if path.strip('/') else ""
    contents_url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents{contents_url_path_part}"

    logger.info(f"Attempting to fetch directory contents from: {contents_url}")

    try:
        response = requests.get(contents_url, headers=headers, timeout=15) # Increased timeout slightly
        logger.info(f"GitHub API response status for {contents_url}: {response.status_code}")

        # Log rate limit headers if available (useful for debugging 403s)
        if 'X-RateLimit-Limit' in response.headers:
            logger.info(f"RateLimit-Limit: {response.headers['X-RateLimit-Limit']}, Remaining: {response.headers['X-RateLimit-Remaining']}, Reset: {response.headers['X-RateLimit-Reset']}")

        response.raise_for_status() # This will raise an HTTPError for 4xx/5xx

        contents = response.json()

        if not isinstance(contents, list):
            logger.error(f"Unexpected API response type for {contents_url}. Expected list, got {type(contents)}. Response body: {response.text[:500]}") # Log part of the body
            return

        logger.info(f"Received {len(contents)} items from {contents_url}")

        for item_idx, item in enumerate(contents):
            if len(files_list) >= MAX_FILES_PER_REPO:
                logger.info(f"Max file limit hit during loop for path '{path}'. Stopping.")
                break

            item_path = item.get("path")
            item_type = item.get("type")
            item_name = item.get("name")

            logger.debug(f"Processing item {item_idx + 1}/{len(contents)}: path='{item_path}', type='{item_type}', name='{item_name}'")

            if not item_path or not item_type or not item_name:
                logger.warn(f"Skipping item with missing path, type, or name: {item}")
                continue

            if item_path in processed_paths:
                logger.debug(f"Path '{item_path}' already processed. Skipping.")
                continue
            processed_paths.add(item_path)

            if item_type == "file":
                _, ext_with_dot = os.path.splitext(item_name)
                # Ensure ext is dotless and lowercase for consistent comparison
                ext = ext_with_dot.lstrip('.').lower() if ext_with_dot else ""

                should_include = True
                if include_ext: # include_ext is list of dotless lowercase strings
                    should_include = ext in include_ext
                    logger.debug(f"File '{item_name}' (ext: '{ext}'): include_ext active ({include_ext}). Should include: {should_include}")
                elif exclude_ext: # exclude_ext is list of dotless lowercase strings
                    should_include = ext not in exclude_ext
                    logger.debug(f"File '{item_name}' (ext: '{ext}'): exclude_ext active ({exclude_ext}). Should include: {should_include}")
                else:
                    logger.debug(f"File '{item_name}' (ext: '{ext}'): No extension filters. Should include: True")

                if should_include:
                    file_size = item.get("size", 0)
                    # Limit individual file size before attempting to add to list for content fetching
                    # This limit is for the metadata listing phase. Content fetching has its own limit.
                    MAX_LISTED_FILE_SIZE = 5 * 1024 * 1024 # 5MB, don't even consider fetching content for files larger than this
                    if file_size > MAX_LISTED_FILE_SIZE:
                        logger.warn(f"File '{item_path}' (size: {file_size}) exceeds MAX_LISTED_FILE_SIZE ({MAX_LISTED_FILE_SIZE}). Skipping.")
                        continue

                    files_list.append({
                        "path": item_path,
                        "name": item_name,
                        "type": "gitfile", # This type is for our internal tracking
                        "size": file_size,
                        "download_url": item.get("download_url") # download_url can be None for some items
                    })
                    logger.info(f"Added file to processing list: {item_path} (size: {file_size})")
                else:
                    logger.info(f"File filtered out by extension rules: {item_path}")

            elif item_type == "dir":
                logger.info(f"Recursing into directory: {item_path}")
                list_repo_files_recursive(owner, repo, item_path, token, include_ext, exclude_ext, files_list, processed_paths, depth + 1)
            else:
                logger.warn(f"Unknown item type '{item_type}' for item path: {item_path}. Item data: {item}")

    except requests.exceptions.HTTPError as e:
        # Log more details from the response if available
        response_text = "N/A"
        if e.response is not None:
            try:
                response_text = e.response.text[:1000] # Log first 1KB of error response
            except Exception:
                response_text = "Could not decode response text."
        logger.error(f"HTTPError for {contents_url}: {e}. Response status: {e.response.status_code if e.response is not None else 'N/A'}. Response text: {response_text}")
        if e.response is not None and e.response.status_code == 404:
            logger.warn(f"Directory/path '{path}' not found in {owner}/{repo} (GitHub API returned 404).")
            # For a 404 on a directory, it means it's empty or doesn't exist, so we don't re-raise, just return.
            return
        elif e.response is not None and e.response.status_code == 403:
            logger.error(f"Forbidden (403) accessing {contents_url}. This could be due to rate limits or insufficient permissions (check token).")
            # Decide if 403 should halt all processing or just this path. For now, re-raise.
            raise
        else: # Re-raise other HTTP errors
            raise
    except requests.exceptions.RequestException as e:
        logger.error(f"RequestException (e.g., network issue) for {contents_url}: {e}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error in list_repo_files_recursive for {contents_url}: {e}", exc_info=True)
        raise

def _fetch_git_repo_contents_logic(req: https_fn.CallableRequest):
    if not req.auth:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.UNAUTHENTICATED, message="Authentication required.")

    data = req.data
    org_user = data.get("orgUser")
    repo_name = data.get("repoName")
    user_token = data.get("gitToken") # User-provided token takes precedence
    include_ext = data.get("includeExt", []) # Expected to be list of strings without '.'
    exclude_ext = data.get("excludeExt", []) # Expected to be list of strings without '.'
    directory = data.get("directory", "") # API wants path without leading/trailing slashes for specific dir

    if not org_user or not repo_name:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message="Organization/User and Repository Name are required.")

    auth_token = user_token or get_github_token() # Use user's token, or fallback to function's env token

    files_to_fetch_meta = []
    processed_paths = set()
    try:
        list_repo_files_recursive(org_user, repo_name, directory.strip('/'), auth_token, include_ext, exclude_ext, files_to_fetch_meta, processed_paths)
    except Exception as e_list: # Catch errors from listing itself (e.g. repo not found)
        logger.error(f"Critical error during repo file listing for {org_user}/{repo_name}: {e_list}")
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=f"Failed to list repository files: {str(e_list)}")

    fetched_items = []
    total_content_size = 0
    MAX_TOTAL_CONTENT_SIZE = 1 * 1024 * 1024 # 1MB total content limit

    for file_meta in files_to_fetch_meta:
        if total_content_size >= MAX_TOTAL_CONTENT_SIZE:
            logger.warn(f"Reached total content size limit for {org_user}/{repo_name}. Stopping content fetching.")
            fetched_items.append({
                "name": file_meta["path"],
                "content": "... [TOTAL CONTENT LIMIT REACHED, FILE SKIPPED] ...",
                "type": "gitfile_skipped"
            })
            break

        content = fetch_repo_file_content(org_user, repo_name, file_meta["path"], auth_token)
        if content is not None:
            # Simple truncation per file (already somewhat handled by size check in list_repo_files_recursive)
            # More refined truncation might be needed.
            MAX_SINGLE_FILE_CONTENT_LENGTH = 150 * 1024 # 150KB per file for prompt
            if len(content) > MAX_SINGLE_FILE_CONTENT_LENGTH:
                content = content[:MAX_SINGLE_FILE_CONTENT_LENGTH] + "\n... [FILE CONTENT TRUNCATED]"

            fetched_items.append({"name": file_meta["path"], "content": content, "type": "gitfile"})
            total_content_size += len(content)
        else:
            fetched_items.append({
                "name": file_meta["path"],
                "content": "... [Failed to fetch content or file too large/binary] ...",
                "type": "gitfile_error"
            })

    if not fetched_items and not files_to_fetch_meta:
        logger.info(f"No files matched criteria or found in {org_user}/{repo_name}/{directory}")
        # Return success but with empty items, or indicate no files found.
        # For now, success with empty items is fine.
    elif not fetched_items and files_to_fetch_meta:
        # This implies all files found by list_repo_files_recursive failed to fetch content
        # This is an edge case, possibly indicating issues with content fetching logic or all files being too large/binary
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message="Found files in repo, but failed to retrieve content for any of them.")


    return {"success": True, "items": fetched_items}

# --- PDF Processing ---
def _process_pdf_content_logic(req: https_fn.CallableRequest):
    if not req.auth:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.UNAUTHENTICATED, message="Authentication required.")

    url = req.data.get("url")
    file_data_base64 = req.data.get("fileData") # Base64 encoded string from client
    file_name_from_client = req.data.get("fileName") # Original name of uploaded file

    pdf_bytes = None
    pdf_source_name = "Uploaded PDF"

    if url:
        pdf_source_name = url.split('/')[-1] # Simple name from URL
        try:
            headers = {'User-Agent': 'AgentLabUI-ContextFetcher/1.0'}
            response = requests.get(url, headers=headers, timeout=20, stream=True)
            response.raise_for_status()
            pdf_bytes = response.content # Read all content if small, or iterate for large
        except requests.exceptions.RequestException as e:
            logger.error(f"Error fetching PDF from URL {url}: {e}")
            raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=f"Failed to fetch PDF from URL: {str(e)}")
    elif file_data_base64:
        pdf_source_name = file_name_from_client or "Uploaded PDF"
        try:
            pdf_bytes = base64.b64decode(file_data_base64)
        except Exception as e:
            logger.error(f"Error decoding base64 PDF data: {e}")
            raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message="Invalid PDF file data.")
    else:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message="Either PDF URL or file data is required.")

    if not pdf_bytes:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message="Could not load PDF data.")

    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        text_content = ""
        for page_num in range(len(reader.pages)):
            page = reader.pages[page_num]
            text_content += page.extract_text() or "" # Add empty string if None
            if page_num < len(reader.pages) -1 :
                text_content += "\n--- End of Page {} ---\n".format(page_num + 1)

                # Truncate if too long
        MAX_PDF_CONTENT_LENGTH = 500 * 1024 # 500KB
        if len(text_content) > MAX_PDF_CONTENT_LENGTH:
            text_content = text_content[:MAX_PDF_CONTENT_LENGTH] + "\n... [PDF CONTENT TRUNCATED]"

        return {"success": True, "name": pdf_source_name, "content": text_content, "type": "pdf"}
    except Exception as e: # Catch PyPDF2 errors or others
        logger.error(f"Error processing PDF '{pdf_source_name}': {e}")
        # Return a generic error, or a specific error if PyPDF2 indicates encryption etc.
        if "encrypted" in str(e).lower():
            return {"success": True, "name": pdf_source_name, "content": "[PDF is encrypted and cannot be processed]", "type": "pdf_error"}
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=f"Failed to process PDF: {str(e)}")

__all__ = ['_fetch_web_page_content_logic', '_fetch_git_repo_contents_logic', '_process_pdf_content_logic']