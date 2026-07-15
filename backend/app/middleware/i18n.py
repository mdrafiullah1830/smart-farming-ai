from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from typing import Optional


SUPPORTED_LANGUAGES = {"bn", "en"}
DEFAULT_LANGUAGE = "bn"


def get_locale_from_header(accept_language: Optional[str]) -> str:
    if not accept_language:
        return DEFAULT_LANGUAGE
    for lang_entry in accept_language.split(","):
        lang_code = lang_entry.strip().split(";")[0].strip()[:2]
        if lang_code in SUPPORTED_LANGUAGES:
            return lang_code
    return DEFAULT_LANGUAGE


class I18nMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        accept_language = request.headers.get("accept-language", "")
        locale = get_locale_from_header(accept_language)
        request.state.locale = locale
        response = await call_next(request)
        response.headers["Content-Language"] = locale
        return response
