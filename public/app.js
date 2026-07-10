const form = document.getElementById('search-form');
const queryInput = document.getElementById('query');
const resultsEl = document.getElementById('results');
const statusEl = document.getElementById('status-line');
const searchBtn = document.getElementById('search-btn');
const cardTemplate = document.getElementById('card-template');

const fSource = document.getElementById('f-source');
const fLanguage = document.getElementById('f-language');
const fLicense = document.getElementById('f-license');
const fMinStars = document.getElementById('f-minstars');
const fSort = document.getElementById('f-sort');

function timeAgo(days) {
  if (days < 1) return 'today';
  if (days < 30) return `${Math.round(days)}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}

function formatNum(n) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

function renderCard(repo) {
  const node = cardTemplate.content.cloneNode(true);

  const sourceTag = node.querySelector('.source-tag');
  sourceTag.textContent = repo.source;
  sourceTag.classList.add(repo.source);

  node.querySelector('.score-tag').textContent = `score ${repo.score}`;

  const link = node.querySelector('.repo-name a');
  link.href = repo.url;
  link.textContent = repo.name;

  node.querySelector('.repo-desc').textContent = repo.description || 'No description provided.';

  node.querySelector('.stars b').textContent = formatNum(repo.stars);
  node.querySelector('.forks b').textContent = formatNum(repo.forks);
  node.querySelector('.lang').textContent = repo.language || '';
  node.querySelector('.license').textContent = repo.license ? `⚖ ${repo.license}` : '';
  node.querySelector('.updated').textContent = `↻ ${timeAgo(repo.daysSinceUpdate)}`;

  const topicsEl = node.querySelector('.repo-topics');
  (repo.topics || []).slice(0, 5).forEach((t) => {
    const chip = document.createElement('span');
    chip.className = 'topic-chip';
    chip.textContent = t;
    topicsEl.appendChild(chip);
  });

  return node;
}

function setLoading(isLoading) {
  searchBtn.disabled = isLoading;
  searchBtn.querySelector('.btn-label').textContent = isLoading ? 'SCANNING...' : 'SCAN';
}

async function runSearch(q) {
  setLoading(true);
  statusEl.textContent = `Scanning GitHub + GitLab for "${q}"...`;
  statusEl.classList.remove('error');
  resultsEl.innerHTML = '<div class="loading-state">// picking up signal...</div>';

  const params = new URLSearchParams({
    q,
    source: fSource.value,
    sort: fSort.value,
  });
  if (fLanguage.value.trim()) params.set('language', fLanguage.value.trim());
  if (fLicense.value.trim()) params.set('license', fLicense.value.trim());
  if (fMinStars.value.trim()) params.set('minStars', fMinStars.value.trim());

  try {
    const res = await fetch(`/api/search?${params.toString()}`);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Search failed.');
    }

    resultsEl.innerHTML = '';

    if (data.results.length === 0) {
      resultsEl.innerHTML = '<div class="empty-state">// no signal. try a broader query or fewer filters.</div>';
    } else {
      data.results.forEach((repo) => resultsEl.appendChild(renderCard(repo)));
    }

    let statusText = `${data.count} repos ranked`;
    if (data.cached) statusText += ' (cached)';
    if (data.errors && data.errors.length > 0) {
      statusText += ` — warning: ${data.errors.map((e) => `${e.source} failed`).join(', ')}`;
      statusEl.classList.add('error');
    }
    statusEl.textContent = statusText;
  } catch (err) {
    resultsEl.innerHTML = '';
    statusEl.textContent = `Error: ${err.message}`;
    statusEl.classList.add('error');
  } finally {
    setLoading(false);
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const q = queryInput.value.trim();
  if (q) runSearch(q);
});
