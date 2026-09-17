# Sesh Music: adding the soundtrack

Sesh Music is the in-game music player. Open it from the pause menu (**Music**) or
from the on-foot quick wheel (hold **D-Pad Left**, pick **Music**). Music keeps
playing after you close it, while you ride, crash, shop or change maps.

## Where the files go

| What | Folder (inside the project) |
| --- | --- |
| Songs | `public/music/tracks/` |
| Optional cover art | `public/music/covers/` |
| Optional names, order and credits | `content/music/metadata.json` |
| Generated list the game reads (do not edit) | `public/music/catalog.json` |

**Put your music here:** `public/music/tracks/`
**Put optional covers here:** `public/music/covers/`
**Refresh the catalog using:** `npm run music:sync`
(This also runs automatically at the start of `npm run dev` and `npm run build`.)

## Naming

Name songs `Artist Name - Track Title.mp3`. The game shows the part before
` - ` as the artist and the part after it as the title. Without ` - ` the whole
file name becomes the title and the artist shows as "Unknown artist".

MP3 is the recommended format. `.m4a`, `.ogg`, `.opus`, `.wav`, `.flac` and
`.webm` are also listed, but only play in browsers that support them. A file
that will not play shows as **Unavailable** and the player moves to the next song.

A cover with the same name as the song is picked up automatically:
`Artist Name - Track Title.jpg` (or `.jpeg`, `.png`, `.webp`). Square images of
about 500×500 keep the download small. Songs without a cover show a plain music note.

Spaces and accents in file names are fine. Avoid `#`, `?` and `%`: some hosts cannot serve them, so `npm run music:sync` leaves those files out and says which ones to rename.

## Optional metadata

Edit `content/music/metadata.json` to fix a name, set the order, add a credit or
keep a song's saved position when you rename its file. Entries are keyed by the
file name inside `public/music/tracks/`:

```json
{
  "tracks": {
    "Artist Name - Track Title.mp3": {
      "id": "track-title",
      "title": "Track Title (Radio Edit)",
      "artist": "Artist Name",
      "cover": "custom-cover.jpg",
      "credit": "Used with permission of Artist Name",
      "order": 1
    }
  }
}
```

Every field is optional. `id` must be unique; if two songs end up with the same
id, `npm run music:sync` warns and leaves the second one out. `cover` must be a
file inside `public/music/covers/`. Lower `order` numbers come first.

## Publishing new songs

Copying songs onto this PC does not change a game that is already hosted or a
ZIP that was already built. To ship them:

1. Copy the songs (and covers) into the folders above.
2. Run `npm run build` (runs the music sync first), then build the release the
   usual way (`npm run package:windows` for the Windows ZIP).
3. Publish that build through the existing authorised deployment process.

After publishing, check that a song URL such as `/music/tracks/<file>.mp3` opens
as audio (not the game's web page) and that seeking works on the host.

## Before you add music

Everything in `public/music/` is downloaded by players' browsers. It is not
secret just because the source repository is private. Only add music and artwork
you intend to distribute with the game and are authorised to distribute.

## Player notes

- The first visit starts paused. Browsers only allow sound after a click, tap or
  key press. If the browser still blocks it, the player shows **Click / tap to
  enable audio**.
- Music volume and mute only affect music. The pause menu's **Sound** switch
  turns all game audio off, music included.
- Preferences (volume, shuffle, repeat, last song and position, and the three
  settings) are saved in this browser under `swf-music-v1`.
- With no songs installed the player shows "No music added yet." and the rest of
  the game works normally.
