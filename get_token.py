import os
from google_auth_oauthlib.flow import InstalledAppFlow

# Load .env if present
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")

if not CLIENT_ID or not CLIENT_SECRET:
    raise SystemExit(
        "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env before running this script."
    )

CLIENT_CONFIG = {
    "installed": {
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "redirect_uris": ["urn:ietf:wg:oauth:2.0:oob", "http://localhost"],
    }
}

SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/spreadsheets",
]

flow = InstalledAppFlow.from_client_config(CLIENT_CONFIG, SCOPES)
creds = flow.run_local_server(port=0, access_type="offline", prompt="consent")

print("\n=== Copy these into your .env ===")
print(f"GOOGLE_CLIENT_ID={CLIENT_ID}")
print(f"GOOGLE_CLIENT_SECRET={CLIENT_SECRET}")
print(f"GOOGLE_REFRESH_TOKEN={creds.refresh_token}")
