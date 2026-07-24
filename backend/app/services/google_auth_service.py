"""Google Sign-In: verifies the ID token ("credential") the Google Identity Services button
hands to the frontend, see app/api/v1/routers/auth.py `/google` endpoint.

Unlike GitHub (app/services/github_service.py), this is a login method, not an additive
account connection: there's no code exchange round trip, the browser gets a signed JWT
directly from Google and we only need to verify it server-side.
"""

from typing import Any

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from app.core.config import GOOGLE_WEB_CLIENT_ID

# Reused across calls: it just wraps an HTTP client used to fetch/cache Google's signing keys.
_request = google_requests.Request()


def verify_id_token(credential: str) -> dict[str, Any]:
    """Validates signature, issuer and expiry, and that the token was issued for our client ID.

    Raises ValueError (from the underlying library) on any validation failure.
    """
    return id_token.verify_oauth2_token(credential, _request, GOOGLE_WEB_CLIENT_ID)
