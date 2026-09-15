# Didi's K-point

A drama journal. Every Korean and Chinese series, scored five ways — plot, sequence,
characters, chemistry, impact on me — with room for a write-up, stills and a trailer.

Live at **https://YOUR-USERNAME.github.io/didis-k-point/**

---

## Putting it online (about ten minutes, once)

**1. Make the repository**

Go to [github.com/new](https://github.com/new).

- Repository name: `didis-k-point`
- Set it to **Public** (GitHub Pages needs public on a free account)
- Don't add a README — this folder already has one
- Create repository

**2. Upload these files**

On the new repo's page, click **uploading an existing file**, then drag in everything
from this folder:

```
index.html
style.css
app.js
data.json
README.md
.nojekyll
```

Commit them.

**3. Turn on Pages**

Settings → Pages → under *Build and deployment*, set Source to **Deploy from a branch**,
branch **main**, folder **/ (root)**. Save.

Wait a minute, then open `https://YOUR-USERNAME.github.io/didis-k-point/`.
That link is the one you share. Anyone can open it; nobody can change it but you.

---

## Editing it

**4. Make a token — this is what lets the page save**

Go to [Fine-grained tokens](https://github.com/settings/personal-access-tokens/new).

- Token name: `k-point`
- Expiration: whatever you like (you'll make a new one when it runs out)
- Repository access: **Only select repositories** → pick `didis-k-point`
- Permissions → Repository permissions → **Contents: Read and write**
- Generate, then copy the token

**5. Connect once**

On your live site, click **GitHub** in the top right and fill in your username, the
repo name, `main`, and paste the token. Hit Connect.

The token is stored in that browser only. It is never written into the repo — if it
were, anyone reading the page source could rewrite your magazine.

**6. Now just edit**

Click **✎ Edit mode**. Then:

| To do this | Do that |
|---|---|
| Change a title, genres, or a write-up | Click the text and type |
| Set a score | Click or drag along the bar |
| Add a poster or stills | Drag pictures onto the article, paste a screenshot, or click the dotted box |
| Set a poster without opening the show | Drag a picture straight onto its cover in the grid |
| Change a status fast | Click the status button on the cover |
| Add a trailer | Paste a YouTube link in the Watch section — it embeds |
| Change how an article looks | Details → Article layout → Standard, Poster-led, Photo essay, Quick take |
| Add a show | **+ Add a show** in the header |

A bar appears at the bottom whenever something is unsaved. **Save to GitHub** commits
it; the live site catches up in about a minute. `Ctrl+S` / `Cmd+S` works too.

Unsaved work is kept in your browser, so closing the tab by accident won't lose it.

---

## The five pages

Each one has its own link, so you can send someone straight to it.

| Page | URL ends with | What it is |
|---|---|---|
| The library | `#/library` | Every title, filterable eleven ways |
| The diary | `#/diary` | Month by month, what you actually finished |
| The ranking | `#/ranking` | Everything scored, in one table. Tap a column to rank by plot, chemistry, anything |
| The numbers | `#/numbers` | Your taste, counted — genres, platforms, score drift, you vs. IMDb |
| Next up | `#/next` | The watchlist, plus a shuffle button |

Individual shows have links too: `#/show/vincenzo`.

**Library filters:** search, status, needs-a-write-up, release year, watched-in (down to
the month), score band, country, genre, platform, and thirteen sort orders — including
each of the five marks on its own, and the gap between your score and IMDb's.

---

## How the data is shaped

Everything lives in `data.json`. One entry per show:

```json
{
  "id": "mr-plankton",
  "title": "Mr. Plankton",
  "year": 2024,
  "imdb": 8.1,
  "network": "Netflix",
  "genres": "Drama, Comedy, Romance, Tragedy",
  "status": "W",
  "scores": [4.4, 4.5, 4.5, 4.7, 4.5],
  "watched": "2026-01",
  "review": "…",
  "layout": "standard",
  "poster": "images/mr-plankton-1234.jpg",
  "gallery": [{"src": "images/…", "caption": "…"}],
  "videos": [{"url": "https://youtu.be/…", "title": "Trailer"}]
}
```

- `status` — `W` watched, `S` watching, `L` watchlist, `U` unsure
- `scores` — plot, sequence, characters, chemistry, impact. The average is worked out for you
- `myRate` — used instead of `scores` where only one overall number came across from the sheet
- `watched` — `2026-03` or just `2026`. This is what the *Watched in* filter reads
- `year` — when it came out, which is a different filter

You can edit `data.json` by hand on GitHub if you ever want to. The page reads it fresh
every load.

---

## Things worth knowing

- **Pictures** are committed into `images/` in the repo. Keep them under a few MB each;
  GitHub rejects anything over 100 MB and the page stops you at 20 MB.
- **Video files** aren't a good fit for GitHub Pages — use YouTube links instead, which
  embed and play inline.
- **Two people editing at once** will overwrite each other. It's a personal journal, so
  this is unlikely to bite, but it's worth knowing.
- **If your token expires**, the Save button will say so. Make a new one and reconnect.
