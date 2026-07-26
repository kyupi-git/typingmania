import sys
from http.cookiejar import MozillaCookieJar

from yt_dlp.cookies import extract_cookies_from_browser


class QuietLogger:
    def debug(self, message):
        pass

    def info(self, message):
        pass

    def warning(self, message):
        pass

    def error(self, message):
        pass


def apple_cookie(cookie):
    domain = str(cookie.domain or "").lower().lstrip(".")
    return domain == "apple.com" or domain.endswith(".apple.com")


def main():
    if len(sys.argv) != 2:
        return 2

    output = sys.argv[1]
    for browser in ("edge", "chrome", "firefox"):
        try:
            source = extract_cookies_from_browser(browser, logger=QuietLogger())
            selected = [cookie for cookie in source if apple_cookie(cookie)]
            if not any(
                cookie.name == "media-user-token" and len(cookie.value or "") >= 20
                for cookie in selected
            ):
                continue
            destination = MozillaCookieJar(output)
            for cookie in selected:
                destination.set_cookie(cookie)
            destination.save(ignore_discard=True, ignore_expires=True)
            return 0
        except Exception:
            continue
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
