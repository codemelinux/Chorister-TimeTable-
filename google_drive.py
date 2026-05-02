# Developed by Benedict U.
# Google Drive sync helper using OAuth 2.0 (personal Gmail account).
#
# Requires three environment variables:
#   GOOGLE_CLIENT_ID      — OAuth 2.0 client ID from Google Cloud Console
#   GOOGLE_CLIENT_SECRET  — OAuth 2.0 client secret
#   GOOGLE_REFRESH_TOKEN  — Long-lived token obtained via scripts/google_auth_setup.py
#
# Optional:
#   GOOGLE_DRIVE_FOLDER_ID — Drive folder ID where song docs are stored.
#                            If omitted, docs are created in My Drive root.
#
# NOTE ON SHARING: Created Google Docs are set to "anyone with the link can view".
# This is intentional — choir members need to access lyrics without logging in.
# To change this behaviour, remove the permissions().create() call in push_song_to_drive().

import json
import os

# Lazy-initialised Drive/Docs service clients (one instance per process).
_drive_service = None
_docs_service = None

SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/spreadsheets",
]

# Human-readable folder names for each song category.
CATEGORY_FOLDER_NAMES = {
    "hymn": "Hymns",
    "praise_worship": "Praise & Worship",
    "thanksgiving": "Thanksgiving",
    "general": "General",
}


# ---------------------------------------------------------------------------
# Credential building
# ---------------------------------------------------------------------------

def _build_credentials():
    """
    Build OAuth credentials from environment variables.
    Returns None if any required variable is missing (Drive disabled).
    """
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
    refresh_token = os.getenv("GOOGLE_REFRESH_TOKEN")

    if not all([client_id, client_secret, refresh_token]):
        return None

    from google.oauth2.credentials import Credentials
    return Credentials(
        token=None,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=client_id,
        client_secret=client_secret,
        scopes=SCOPES,
    )


def _get_services():
    """
    Return (drive_service, docs_service), initialising them on first call.
    Returns (None, None) if Drive is not configured.
    """
    global _drive_service, _docs_service
    if _drive_service is not None:
        return _drive_service, _docs_service

    creds = _build_credentials()
    if creds is None:
        return None, None

    try:
        from googleapiclient.discovery import build
        _drive_service = build("drive", "v3", credentials=creds)
        _docs_service = build("docs", "v1", credentials=creds)
    except Exception as exc:
        print(f"[google_drive] Failed to initialise API clients: {exc}")
        return None, None

    return _drive_service, _docs_service


# ---------------------------------------------------------------------------
# Drive folder helpers
# ---------------------------------------------------------------------------

def _get_or_create_folder(drive, parent_id: str, name: str) -> str:
    """Return the ID of a named subfolder under parent_id, creating it if absent."""
    query = (
        f"mimeType='application/vnd.google-apps.folder'"
        f" and name='{name}'"
        f" and '{parent_id}' in parents"
        f" and trashed=false"
    )
    results = drive.files().list(q=query, fields="files(id)").execute()
    files = results.get("files", [])
    if files:
        return files[0]["id"]

    meta = {
        "name": name,
        "mimeType": "application/vnd.google-apps.folder",
        "parents": [parent_id],
    }
    folder = drive.files().create(body=meta, fields="id").execute()
    return folder["id"]


# ---------------------------------------------------------------------------
# Document content helpers
# ---------------------------------------------------------------------------

def _make_doc_requests(title: str, category: str, lyrics: str) -> list:
    """
    Return a list of Docs API batchUpdate requests that write song content.
    Inserts title as Heading 1, category label, then the full lyrics.
    """
    cat_label = CATEGORY_FOLDER_NAMES.get(category, category.title())
    body_text = f"{title}\n{cat_label}\n\n{lyrics}"
    return [
        {"insertText": {"location": {"index": 1}, "text": body_text}},
        {
            "updateParagraphStyle": {
                "range": {"startIndex": 1, "endIndex": len(title) + 1},
                "paragraphStyle": {"namedStyleType": "HEADING_1"},
                "fields": "namedStyleType",
            }
        },
    ]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def is_configured() -> bool:
    """Return True if all required OAuth environment variables are present."""
    return all([
        os.getenv("GOOGLE_CLIENT_ID"),
        os.getenv("GOOGLE_CLIENT_SECRET"),
        os.getenv("GOOGLE_REFRESH_TOKEN"),
    ])


def push_song_to_drive(
    title: str,
    category: str,
    lyrics: str,
    doc_id: str | None = None,
) -> tuple[str | None, str | None]:
    """
    Create or update a Google Doc for a song's lyrics.

    If doc_id is provided, the existing document is cleared and rewritten.
    Otherwise a new document is created inside the appropriate category subfolder.

    Returns (doc_url, doc_id) on success, or (None, None) if Drive is not
    configured or an error occurs (errors are printed but not raised).
    """
    drive, docs = _get_services()
    if drive is None:
        return None, None

    root_folder_id = os.getenv("GOOGLE_DRIVE_FOLDER_ID", "root")

    try:
        cat_folder_id = _get_or_create_folder(
            drive, root_folder_id, CATEGORY_FOLDER_NAMES.get(category, "General")
        )

        if doc_id:
            # Update existing doc: clear all content then rewrite.
            doc = docs.documents().get(documentId=doc_id).execute()
            end_index = doc["body"]["content"][-1]["endIndex"] - 1
            requests = []
            if end_index > 1:
                requests.append(
                    {"deleteContentRange": {"range": {"startIndex": 1, "endIndex": end_index}}}
                )
            requests += _make_doc_requests(title, category, lyrics)
            docs.documents().batchUpdate(documentId=doc_id, body={"requests": requests}).execute()
            return f"https://docs.google.com/document/d/{doc_id}/edit", doc_id

        # Create a new Google Doc inside the category subfolder.
        new_file = drive.files().create(
            body={
                "name": title,
                "mimeType": "application/vnd.google-apps.document",
                "parents": [cat_folder_id],
            },
            fields="id",
        ).execute()
        new_doc_id = new_file["id"]

        # Grant "anyone with the link" read access (intentional — see module docstring).
        drive.permissions().create(
            fileId=new_doc_id,
            body={"type": "anyone", "role": "reader"},
        ).execute()

        # Write the song content.
        docs.documents().batchUpdate(
            documentId=new_doc_id,
            body={"requests": _make_doc_requests(title, category, lyrics)},
        ).execute()

        return f"https://docs.google.com/document/d/{new_doc_id}/edit", new_doc_id

    except Exception as exc:
        print(f"[google_drive] Error syncing song '{title}': {exc}")
        # Re-raise so callers can capture the message for API responses.
        raise


def delete_doc_from_drive(doc_id: str) -> bool:
    """
    Permanently delete a Google Doc by ID.
    Returns True on success, False if Drive is not configured or deletion fails.
    Errors are printed but not raised so DB deletion can proceed regardless.
    """
    drive, _ = _get_services()
    if not drive or not doc_id:
        return False
    try:
        drive.files().delete(fileId=doc_id).execute()
        return True
    except Exception as exc:
        print(f"[google_drive] Error deleting doc {doc_id}: {exc}")
        return False
