# Local folder import

The Windows local edition can turn a user-selected folder into verified,
self-contained TypingManiaNovel songs. The folder and every subfolder are
scanned for MP3, FLAC, M4A, AAC, MP4 audio, OGG, and WAV files, plus LRC, TXT,
JPEG, PNG, and WebP companions.

The browser grants access only after the player chooses a folder. Supported
files are copied over the same-origin localhost connection into a random
temporary session. Paths are normalized, traversal is rejected, executable
formats are never accepted, and per-file, per-session, and file-count limits
bound resource use. The source folder is read-only from TypingManiaNovel's
perspective.

For each audio file, the importer validates the complete stream and duration,
requires title and performer tags, searches for a strict title/performer/
duration catalog match, and uses either that recording's timeline or a
same-stem local LRC/TXT timeline. A valid local timeline remains the offline
fallback, while the two best live/regional lyric routes compare its whole-song
text against the strictly matched recording. Provider line wrapping,
punctuation, and an extra translation layer are tolerated; a sidecar that
clearly belongs to another song is replaced automatically. It removes
language-specific credit rows,
rejects instrumental/BGM or insubstantial vocal timelines, corrects obvious
interlude gaps attached to the previous lyric, verifies every pronunciation,
chooses embedded, companion, or verified online artwork, optionally verifies
a direct animation, film, television, documentary, commercial, variety,
sports-event, visual-novel, JRPG, or game poster,
removes duplicates, and writes one atomic package. Chinese pinyin is generated
locally; Japanese Kanji requires a recording-specific timed reading.

Files without trustworthy identity, timed lyrics, complete pronunciation, or
substantial vocal content are skipped. Missing optional artwork uses the
neutral bundled image instead. Temporary copies are deleted after the import,
whether it succeeds or fails. Reset can remove only local-folder packages and
their scores without changing the selected source folder.

The in-game submenu starts at 10 songs and accepts a 1–500-song target. A safe
stop keeps every completed package and reports the five most recent failures.
