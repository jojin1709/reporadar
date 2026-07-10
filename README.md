# RepoRadar

Cross-platform repo discovery engine. Search GitHub + GitLab at once, ranked by
a composite score (stars + recency + forks) instead of raw star count alone —
so you stop scrolling GitHub search results manually.

## Features

- Searches GitHub Search API and GitLab API in parallel
- Composite ranking score (log-scaled stars, recency of last push, forks) — not just raw stars
- Filters: source (GitHub/GitLab/both), language, license, min stars, sort mode
- 5-minute in-memory cache per query to avoid hammering rate limits
- Zero accounts, zero tracking, runs entirely on your own machine

## Live Demo

You can use the search engine directly online:
👉 **[reporadar-eight.vercel.app](https://reporadar-eight.vercel.app)**

## How ranking works

Each repo gets a score out of 1.0:

```
score = 0.55 * star_score + 0.30 * recency_score + 0.15 * fork_score
```

- `star_score` — log-scaled stars, normalized against the top result in the current search (so a 500k-star repo doesn't make everything else look like zero)
- `recency_score` — 1.0 if pushed today, decaying to 0 at ~1 year stale. Rewards actively maintained projects over abandoned ones with old stars
- `fork_score` — log-scaled forks, same normalization approach

Switch **Sort** to "Most stars" or "Recently updated" if you want a simpler,
non-composite ordering instead.

## Known limitations (v1)

- GitLab's project list endpoint doesn't return a primary language field
  without an extra per-project API call, so the **Language** filter only
  hard-filters GitHub results; GitLab results are matched against topics
  as a best-effort fallback.
- License filtering is applied via GitHub's `license:` search qualifier;
  GitLab license filtering isn't supported by their search endpoint in this
  version.
- Unauthenticated GitHub search is limited to ~10 requests/min. Add a
  `GITHUB_TOKEN` in `.env` to raise this.

## Project structure

```
reporadar/
├── server.js          # Express backend: search, ranking, caching
├── package.json
├── .env.example
└── public/
    ├── index.html      # UI markup
    ├── style.css        # Dark radar/terminal theme
    └── app.js           # Fetches /api/search, renders result cards
```

## Ideas for v2

- Semantic search: embed repo descriptions + query, rank by vector similarity instead of keyword matching, for true "find something like X" search
- Add Bitbucket / SourceForge as additional sources
- Pre-index popular topics on a schedule instead of live-querying every search
- "Similar repos" suggestions once a user clicks into one result

---

## Author

Developed and maintained by **[Jojin John](https://www.linkedin.com/in/jojin-john-74386b34a/)**
