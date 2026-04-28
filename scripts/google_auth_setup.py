"""
One-time Google OAuth setup for Chorister TimeTable.

Run this script once to authorise your Google account and get a refresh token.
The token values are printed at the end — paste them into your .env file.

Usage:
    python scripts/google_auth_setup.py

Requirements:
    - GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be in .env
      OR passed as environment variables before running this script.
    - A browser will open for you to sign in with codemelinux@gmail.com.
"""

import os
import sys
from pathlib import Path

# Load .env from project root
root = Path(__file__).resolve().parent.parent
env_path = root / ".env"
if env_path.exists():
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())

client_id = os.getenv("GOOGLE_CLIENT_ID")
client_secret = os.getenv("GOOGLE_CLIENT_SECRET")

if not client_id or not client_secret:
    print("\n ERROR: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set.")
    print("\nSteps to get them:")
    print("  1. Go to https://console.cloud.google.com/")
    print("  2. Create a project (or select an existing one)")
    print("  3. Enable 'Google Drive API' and 'Google Docs API'")
    print("  4. Go to APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID")
    print("  5. Application type: Desktop app")
    print("  6. Download the JSON — copy client_id and client_secret into your .env:")
    print()
    print("     GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com")
    print("     GOOGLE_CLIENT_SECRET=your-client-secret")
    print()
    sys.exit(1)

try:
    from google_auth_oauthlib.flow import InstalledAppFlow
except ImportError:
    print("Run: .venv\\Scripts\\python.exe -m pip install google-auth-oauthlib")
    sys.exit(1)

SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/documents",
]

client_config = {
    "installed": {
        "client_id": client_id,
        "client_secret": client_secret,
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "redirect_uris": ["http://localhost"],
    }
}

print("\nOpening browser to authorise Google Drive access...")
print("Sign in with: codemelinux@gmail.com\n")

flow = InstalledAppFlow.from_client_config(client_config, SCOPES)
creds = flow.run_local_server(port=0, prompt="consent", access_type="offline")

print("\n" + "=" * 60)
print("SUCCESS! Add these three lines to your .env file:")
print("=" * 60)
print(f"GOOGLE_CLIENT_ID={client_id}")
print(f"GOOGLE_CLIENT_SECRET={client_secret}")
print(f"GOOGLE_REFRESH_TOKEN={creds.refresh_token}")
print("=" * 60)
print("\nOptionally set a specific Drive folder ID to store song docs:")
print("GOOGLE_DRIVE_FOLDER_ID=<paste folder ID from Drive URL here>")
print()
