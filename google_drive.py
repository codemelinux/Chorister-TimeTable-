# Developed by Benedict U.
import json
import os

_drive_service = None
_docs_service = None

CATEGORY_FOLDER_NAMES = {
    "hymn": "Hymns",
    "praise_worship": "Praise & Worship",
    "thanksgiving": "Thanksgiving",
    "general": "General",
}


def _get_services():
    global _drive_service, _docs_service
    if _drive_service is not None:
        return _drive_service, _docs_service

    sa_json = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON")
    if not sa_json:
        return None, None

    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build

        info = json.loads(sa_json)
        scopes = [
            "https://www.googleapis.com/auth/drive",
            "https://www.googleapis.com/auth/documents",
        ]
        creds = service_account.Credentials.from_service_account_info(info, scopes=scopes)
        _drive_service = build("drive", "v3", credentials=creds)
        _docs_service = build("docs", "v1", credentials=creds)
    except Exception as exc:
        print(f"[google_drive] Failed to initialise: {exc}")
        return None, None

    return _drive_service, _docs_service


def _get_or_create_folder(drive, parent_id: str, name: str) -> str:
    query = (
        f"mimeType='application/vnd.google-apps.folder' "
        f"and name='{name}' "
        f"and '{parent_id}' in parents "
        f"and trashed=false"
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


def _make_doc_content(title: str, category: str, lyrics: str) -> list:
    cat_label = CATEGORY_FOLDER_NAMES.get(category, category.title())
    return [
        {"insertText": {"location": {"index": 1}, "text": f"{title}\n{cat_label}\n\n{lyrics}"}},
        {
            "updateParagraphStyle": {
                "range": {"startIndex": 1, "endIndex": len(title) + 1},
                "paragraphStyle": {"namedStyleType": "HEADING_1"},
                "fields": "namedStyleType",
            }
        },
    ]


def push_song_to_drive(title: str, category: str, lyrics: str, doc_id: str | None = None) -> tuple[str | None, str | None]:
    """
    Create or update a Google Doc for a song's lyrics.
    Returns (doc_url, doc_id). Returns (None, None) if Drive is not configured.
    """
    drive, docs = _get_services()
    if drive is None:
        return None, None

    root_folder_id = os.getenv("GOOGLE_DRIVE_FOLDER_ID", "root")

    try:
        # Ensure category subfolder exists
        cat_folder_name = CATEGORY_FOLDER_NAMES.get(category, "General")
        cat_folder_id = _get_or_create_folder(drive, root_folder_id, cat_folder_name)

        if doc_id:
            # Update existing doc: clear content then rewrite
            doc = docs.documents().get(documentId=doc_id).execute()
            end_index = doc["body"]["content"][-1]["endIndex"] - 1
            requests = []
            if end_index > 1:
                requests.append({"deleteContentRange": {"range": {"startIndex": 1, "endIndex": end_index}}})
            requests += _make_doc_content(title, category, lyrics)
            docs.documents().batchUpdate(documentId=doc_id, body={"requests": requests}).execute()
            doc_url = f"https://docs.google.com/document/d/{doc_id}/edit"
            return doc_url, doc_id

        # Create new Google Doc inside the category folder
        file_meta = {
            "name": title,
            "mimeType": "application/vnd.google-apps.document",
            "parents": [cat_folder_id],
        }
        new_file = drive.files().create(body=file_meta, fields="id").execute()
        new_doc_id = new_file["id"]

        # Make it readable by anyone with the link
        drive.permissions().create(
            fileId=new_doc_id,
            body={"type": "anyone", "role": "reader"},
        ).execute()

        # Write lyrics content
        docs.documents().batchUpdate(
            documentId=new_doc_id,
            body={"requests": _make_doc_content(title, category, lyrics)},
        ).execute()

        doc_url = f"https://docs.google.com/document/d/{new_doc_id}/edit"
        return doc_url, new_doc_id

    except Exception as exc:
        print(f"[google_drive] Error syncing song '{title}': {exc}")
        return None, None
