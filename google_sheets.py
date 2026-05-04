# Developed by Benedict U.
# Google Sheets sync helper for Monthly Dues.

import calendar
import os

_sheets_service = None

SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/spreadsheets",
]


def _build_credentials():
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


def _get_service():
    global _sheets_service
    if _sheets_service is not None:
        return _sheets_service

    creds = _build_credentials()
    if creds is None:
        return None

    from googleapiclient.discovery import build

    _sheets_service = build("sheets", "v4", credentials=creds)
    return _sheets_service


def is_configured() -> bool:
    return bool(os.getenv("MONTHLY_DUES_SPREADSHEET_ID")) and all([
        os.getenv("GOOGLE_CLIENT_ID"),
        os.getenv("GOOGLE_CLIENT_SECRET"),
        os.getenv("GOOGLE_REFRESH_TOKEN"),
    ])


def _ensure_sheet(service, spreadsheet_id: str, title: str):
    spreadsheet = service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
    for sheet in spreadsheet.get("sheets", []):
        props = sheet.get("properties", {})
        if props.get("title") == title:
            return

    service.spreadsheets().batchUpdate(
        spreadsheetId=spreadsheet_id,
        body={"requests": [{"addSheet": {"properties": {"title": title}}}]},
    ).execute()


def sync_monthly_dues(year: int, dues_rows: list[dict]) -> None:
    """Write dues rows plus a summary footer to a worksheet named 'Monthly Dues YYYY'."""
    spreadsheet_id = os.getenv("MONTHLY_DUES_SPREADSHEET_ID")
    service = _get_service()
    if not spreadsheet_id or service is None:
        raise RuntimeError("Google Sheets is not configured")

    sheet_title = f"Monthly Dues {year}"
    _ensure_sheet(service, spreadsheet_id, sheet_title)

    # Build per-chorister rows
    header = ["Chorister"] + [calendar.month_name[m] for m in range(1, 13)] + ["Total Owed"]
    values = [header]
    total_owed = total_paid = total_waived = 0
    for row in dues_rows:
        month_cells = []
        for due in row["months"]:
            status = due["status"]
            amount = int(due["amount"])
            month_cells.append(f"RM{amount} - {status.title()}")
            if status == "pending":
                total_owed += amount
            elif status == "paid":
                total_paid += amount
            elif status == "waived":
                total_waived += amount
        values.append([row["chorister_name"], *month_cells, f"RM{row['total_owed']}"])

    # Blank separator then summary footer
    values.append([""] * 14)
    values.append(["SUMMARY", f"Year: {year}", "", "", "", "", "", "", "", "", "", "", "", ""])
    values.append(["Total Owed", f"RM{total_owed}", "", "", "", "", "", "", "", "", "", "", "", ""])
    values.append(["Total Paid", f"RM{total_paid}", "", "", "", "", "", "", "", "", "", "", "", ""])
    values.append(["Total Waived", f"RM{total_waived}", "", "", "", "", "", "", "", "", "", "", "", ""])

    escaped_title = sheet_title.replace("'", "''")
    service.spreadsheets().values().clear(
        spreadsheetId=spreadsheet_id,
        range=f"'{escaped_title}'!A:N",
        body={},
    ).execute()
    service.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range=f"'{escaped_title}'!A1",
        valueInputOption="RAW",
        body={"values": values},
    ).execute()
