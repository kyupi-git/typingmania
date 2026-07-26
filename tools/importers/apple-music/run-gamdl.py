import os
from pathlib import Path

from gamdl.cli.cli import main
from gamdl.downloader import AppleMusicDownloader


def positive_limit(value, fallback=20):
    try:
        return max(1, min(200, int(value)))
    except (TypeError, ValueError):
        return fallback


remaining = positive_limit(os.environ.get("TMN_GAMDL_LIMIT"))
skip_file = os.environ.get("TMN_GAMDL_SKIP_FILE", "")
try:
    skipped_ids = {
        value.strip()
        for value in Path(skip_file).read_text(encoding="utf-8").splitlines()
        if value.strip()
    }
except (OSError, ValueError):
    skipped_ids = set()

original_items_from_url = AppleMusicDownloader.get_download_item_from_url


async def limited_song_items(self, url):
    global remaining
    if remaining <= 0:
        return
    async for item in original_items_from_url(self, url):
        media = item.media
        if media.partial:
            yield item
            continue
        metadata = media.media_metadata or {}
        if metadata.get("type") not in {"songs", "library-songs"}:
            continue
        media_id = str(metadata.get("id") or "")
        if media_id and media_id in skipped_ids:
            continue
        if remaining <= 0:
            break
        remaining -= 1
        yield item


AppleMusicDownloader.get_download_item_from_url = limited_song_items


if __name__ == "__main__":
    main()
