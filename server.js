require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITLAB_TOKEN = process.env.GITLAB_TOKEN || '';

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ---- suppress noisy favicon 404s from browsers ----
app.get('/favicon.ico', (req, res) => res.status(204).end());

// ---- SPA-style fallback: serve index.html for unknown non-API routes ----
app.get(/^(?!\/api\/).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---- simple in-memory cache (5 min TTL) to avoid hammering rate limits ----
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCached(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.data;
}

function setCached(key, data) {
  cache.set(key, { ts: Date.now(), data });
}

// ---- GitHub search ----
async function searchGitHub({ q, language, license, perPage, isTrending }) {
  let query = q;
  if (isTrending) {
    const date30DaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    query = `created:>${date30DaysAgo}`;
  }
  if (language) query += ` language:${language}`;
  if (license) query += ` license:${license}`;

  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${perPage}`;

  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'RepoRadar-App',
  };
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub API error ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();

  return (data.items || []).map((repo) => ({
    source: 'github',
    name: repo.full_name,
    description: repo.description || '',
    url: repo.html_url,
    stars: repo.stargazers_count || 0,
    forks: repo.forks_count || 0,
    openIssues: repo.open_issues_count || 0,
    language: repo.language || null,
    license: repo.license ? repo.license.spdx_id : null,
    updatedAt: repo.pushed_at || repo.updated_at,
    owner: repo.owner ? repo.owner.login : '',
    avatar: repo.owner ? repo.owner.avatar_url : '',
    topics: repo.topics || [],
  }));
}

// ---- GitLab language fetch helper ----
async function fetchGitLabLanguage(repoId, headers) {
  try {
    const url = `https://gitlab.com/api/v4/projects/${repoId}/languages`;
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && Object.keys(data).length > 0) {
      return Object.keys(data).reduce((a, b) => (data[a] > data[b] ? a : b));
    }
  } catch (err) {
    // Ignore and return null
  }
  return null;
}

// ---- GitLab search ----
async function searchGitLab({ q, perPage, isTrending }) {
  let url = `https://gitlab.com/api/v4/projects?search=${encodeURIComponent(q)}&order_by=star_count&sort=desc&per_page=${perPage}`;
  if (isTrending) {
    url = `https://gitlab.com/api/v4/projects?order_by=star_count&sort=desc&per_page=${perPage}`;
  }

  const headers = {};
  if (GITLAB_TOKEN) headers['PRIVATE-TOKEN'] = GITLAB_TOKEN;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitLab API error ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();

  const repos = (data || []).map((repo) => ({
    source: 'gitlab',
    id: repo.id,
    name: repo.path_with_namespace,
    description: repo.description || '',
    url: repo.web_url,
    stars: repo.star_count || 0,
    forks: repo.forks_count || 0,
    openIssues: repo.open_issues_count || 0,
    language: null,
    license: (repo.license && repo.license.nickname) || null,
    updatedAt: repo.last_activity_at,
    owner: repo.namespace ? repo.namespace.name : '',
    avatar: repo.avatar_url || '',
    topics: repo.topics || [],
  }));

  // Fetch languages in parallel
  await Promise.all(
    repos.map(async (repo) => {
      repo.language = await fetchGitLabLanguage(repo.id, headers);
    })
  );

  return repos;
}

// ---- Codeberg search ----
async function searchCodeberg({ q, perPage, isTrending }) {
  let url = `https://codeberg.org/api/v1/repos/search?q=${encodeURIComponent(q)}&limit=${perPage}`;
  if (isTrending) {
    url = `https://codeberg.org/api/v1/repos/search?limit=${perPage}&sort=stars&order=desc`;
  }

  const headers = {
    Accept: 'application/json',
    'User-Agent': 'RepoRadar-App',
  };

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Codeberg API error ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const items = data.data || [];

  return items.map((repo) => ({
    source: 'codeberg',
    name: repo.full_name,
    description: repo.description || '',
    url: repo.html_url,
    stars: repo.stars_count || 0,
    forks: repo.forks_count || 0,
    openIssues: repo.open_issues_count || 0,
    language: repo.language || null,
    license: null,
    updatedAt: repo.updated_at,
    owner: repo.owner ? repo.owner.login : '',
    avatar: repo.owner ? repo.owner.avatar_url : '',
    topics: repo.topics || [],
  }));
}

// ---- ranking ----
function daysSince(dateStr) {
  if (!dateStr) return 9999;
  const diffMs = Date.now() - new Date(dateStr).getTime();
  return diffMs / (1000 * 60 * 60 * 24);
}

function rankResults(results) {
  if (results.length === 0) return results;

  const maxLogStars = Math.max(...results.map((r) => Math.log10(r.stars + 1)), 1);
  const maxLogForks = Math.max(...results.map((r) => Math.log10(r.forks + 1)), 1);

  return results
    .map((r) => {
      const starScore = Math.log10(r.stars + 1) / maxLogStars;
      const forkScore = Math.log10(r.forks + 1) / maxLogForks;
      const days = daysSince(r.updatedAt);
      const recencyScore = Math.max(0, 1 - days / 365); // 1.0 = updated today, 0 = a year+ stale

      const score = starScore * 0.55 + recencyScore * 0.3 + forkScore * 0.15;
      return {
        ...r,
        score: Math.round(score * 1000) / 1000,
        daysSinceUpdate: Math.round(days),
        scoreDetails: {
          starScore: Math.round(starScore * 1000) / 1000,
          recencyScore: Math.round(recencyScore * 1000) / 1000,
          forkScore: Math.round(forkScore * 1000) / 1000,
        },
      };
    })
    .sort((a, b) => b.score - a.score);
}

// ---- main search endpoint ----
app.get('/api/search', async (req, res) => {
  try {
    const {
      q = '',
      language = '',
      license = '',
      minStars = '0',
      sort = 'best', // best | stars | updated
      source = 'all', // all | github | gitlab | codeberg (supports 'both' too)
      perPage = '20',
      trending = 'false',
    } = req.query;

    const isTrending = trending === 'true' || !q.trim();
    const queryStr = isTrending ? '__trending__' : q;

    const perPageNum = Math.min(parseInt(perPage, 10) || 20, 50);
    const cacheKey = JSON.stringify({ q: queryStr, language, license, minStars, sort, source, perPageNum, isTrending });

    const cached = getCached(cacheKey);
    if (cached) {
      return res.json({ ...cached, cached: true });
    }

    const tasks = [];
    const errors = [];

    if (source === 'both' || source === 'all' || source === 'github') {
      tasks.push(
        searchGitHub({ q, language, license, perPage: perPageNum, isTrending }).catch((err) => {
          errors.push({ source: 'github', message: err.message });
          return [];
        })
      );
    }
    if (source === 'both' || source === 'all' || source === 'gitlab') {
      tasks.push(
        searchGitLab({ q, perPage: perPageNum, isTrending }).catch((err) => {
          errors.push({ source: 'gitlab', message: err.message });
          return [];
        })
      );
    }
    if (source === 'both' || source === 'all' || source === 'codeberg') {
      tasks.push(
        searchCodeberg({ q, perPage: perPageNum, isTrending }).catch((err) => {
          errors.push({ source: 'codeberg', message: err.message });
          return [];
        })
      );
    }

    const resultsArrays = await Promise.all(tasks);
    let merged = resultsArrays.flat();

    // minStars filter
    const minStarsNum = parseInt(minStars, 10) || 0;
    merged = merged.filter((r) => r.stars >= minStarsNum);

    // Language filter matching primary language or tags/topics
    if (language) {
      merged = merged.filter(
        (r) =>
          (r.language && r.language.toLowerCase() === language.toLowerCase()) ||
          (r.topics && r.topics.some((t) => t.toLowerCase() === language.toLowerCase()))
      );
    }

    let ranked = rankResults(merged);

    if (sort === 'stars') {
      ranked = [...ranked].sort((a, b) => b.stars - a.stars);
    } else if (sort === 'updated') {
      ranked = [...ranked].sort((a, b) => a.daysSinceUpdate - b.daysSinceUpdate);
    }
    // 'best' keeps rankResults' score-sorted order

    const payload = {
      query: q,
      count: ranked.length,
      results: ranked,
      errors,
      cached: false,
    };

    setCached(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Unexpected server error.' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    githubTokenConfigured: !!GITHUB_TOKEN,
    gitlabTokenConfigured: !!GITLAB_TOKEN,
  });
});

// Conditionally listen on port if not running in a Vercel serverless environment
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`RepoRadar running at http://localhost:${PORT}`);
    if (!GITHUB_TOKEN) {
      console.log('Tip: set GITHUB_TOKEN in .env to raise the GitHub search rate limit.');
    }
  });
}

module.exports = app;
