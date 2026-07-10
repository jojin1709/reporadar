const form = document.getElementById('search-form');
const queryInput = document.getElementById('query');
const resultsEl = document.getElementById('results');
const statusEl = document.getElementById('status-line');
const searchBtn = document.getElementById('search-btn');
const cardTemplate = document.getElementById('card-template');

// Filters and Panel elements
const fSource = document.getElementById('f-source');
const fLanguage = document.getElementById('f-language');
const fLicense = document.getElementById('f-license');
const fMinStars = document.getElementById('f-minstars');
const fSort = document.getElementById('f-sort');
const filtersToggleBtn = document.getElementById('filters-toggle-btn');
const filtersPanel = document.getElementById('filters-panel');

// Header and Drawer actions
const bookmarksToggleBtn = document.getElementById('bookmarks-toggle-btn');
const bookmarksCloseBtn = document.getElementById('bookmarks-close-btn');
const bookmarksDrawer = document.getElementById('bookmarks-drawer');
const bookmarksListEl = document.getElementById('bookmarks-list');
const bookmarksCountEl = document.getElementById('bookmarks-count');
const bookmarksExportBtn = document.getElementById('bookmarks-export-btn');
const bookmarksClearBtn = document.getElementById('bookmarks-clear-btn');

// Search History elements
const historyContainer = document.getElementById('history-container');
const historyListEl = document.getElementById('history-list');

// Radar animation sweep element
const radarSweep = document.querySelector('.radar-sweep');

// State management
let bookmarks = JSON.parse(localStorage.getItem('bookmarks')) || [];
let searchHistory = JSON.parse(localStorage.getItem('searchHistory')) || [];
let currentTheme = localStorage.getItem('theme') || 'amber';

// ---- Initialize App ----
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initBookmarks();
  initHistory();
  initFiltersCollapse();
  initKeyboardShortcut();
  loadParamsFromURL();
});

// ---- Theme Switcher ----
function initTheme() {
  document.body.className = `theme-${currentTheme}`;
  const themeBtns = document.querySelectorAll('.theme-btn');
  themeBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === currentTheme);
    btn.addEventListener('click', () => {
      currentTheme = btn.dataset.theme;
      localStorage.setItem('theme', currentTheme);
      document.body.className = `theme-${currentTheme}`;
      themeBtns.forEach(b => b.classList.toggle('active', b.dataset.theme === currentTheme));
    });
  });
}

// ---- Bookmarks Management ----
function initBookmarks() {
  bookmarksToggleBtn.addEventListener('click', () => bookmarksDrawer.classList.add('open'));
  bookmarksCloseBtn.addEventListener('click', () => bookmarksDrawer.classList.remove('open'));
  
  bookmarksExportBtn.addEventListener('click', exportBookmarksMarkdown);
  bookmarksClearBtn.addEventListener('click', clearAllBookmarks);

  renderBookmarksList();
}

function updateBookmarksCount() {
  bookmarksCountEl.textContent = bookmarks.length;
}

function toggleBookmark(repo) {
  const existsIdx = bookmarks.findIndex(b => b.url === repo.url);
  if (existsIdx > -1) {
    bookmarks.splice(existsIdx, 1);
  } else {
    bookmarks.push(repo);
  }
  localStorage.setItem('bookmarks', JSON.stringify(bookmarks));
  renderBookmarksList();
  
  // Sync the star status on visible cards
  const cardStarBtns = document.querySelectorAll(`.repo-card[data-url="${repo.url}"] .bookmark-btn`);
  cardStarBtns.forEach(btn => btn.classList.toggle('active', existsIdx === -1));
}

function renderBookmarksList() {
  updateBookmarksCount();
  bookmarksListEl.innerHTML = '';
  
  if (bookmarks.length === 0) {
    bookmarksListEl.innerHTML = '<div class="empty-state" style="padding: 20px 0;">// no signals saved.</div>';
    return;
  }

  bookmarks.forEach(repo => {
    const item = document.createElement('div');
    item.className = 'bookmark-item';
    
    const info = document.createElement('div');
    info.className = 'bookmark-item-info';
    
    const name = document.createElement('h4');
    name.className = 'bookmark-item-name';
    const link = document.createElement('a');
    link.href = repo.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = repo.name;
    name.appendChild(link);
    
    const meta = document.createElement('div');
    meta.className = 'bookmark-item-meta';
    meta.innerHTML = `<span>${repo.source}</span> • <span>★ ${formatNum(repo.stars)}</span>`;
    if (repo.language) {
      meta.innerHTML += ` • <span>${repo.language}</span>`;
    }
    
    info.appendChild(name);
    info.appendChild(meta);
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'bookmark-remove-btn';
    removeBtn.title = 'Remove bookmark';
    removeBtn.innerHTML = '×';
    removeBtn.addEventListener('click', () => toggleBookmark(repo));
    
    item.appendChild(info);
    item.appendChild(removeBtn);
    bookmarksListEl.appendChild(item);
  });
}

function clearAllBookmarks() {
  if (confirm('Are you sure you want to clear all saved signals?')) {
    bookmarks = [];
    localStorage.setItem('bookmarks', JSON.stringify(bookmarks));
    renderBookmarksList();
    
    // Deactivate all star buttons on cards
    document.querySelectorAll('.bookmark-btn').forEach(btn => btn.classList.remove('active'));
  }
}

function exportBookmarksMarkdown() {
  if (bookmarks.length === 0) {
    alert('No bookmarks to export.');
    return;
  }
  
  let mdContent = `# RepoRadar Bookmarked Repositories\n\nGenerated on ${new Date().toLocaleDateString()}\n\n`;
  bookmarks.forEach((repo, index) => {
    mdContent += `### ${index + 1}. [${repo.name}](${repo.url})\n`;
    mdContent += `* **Source**: ${repo.source.toUpperCase()}\n`;
    mdContent += `* **Stars**: ★ ${repo.stars.toLocaleString()} | **Forks**: ⑂ ${repo.forks.toLocaleString()}\n`;
    if (repo.language) mdContent += `* **Language**: ${repo.language}\n`;
    if (repo.description) mdContent += `* **Description**: ${repo.description}\n`;
    mdContent += `\n`;
  });
  
  const blob = new Blob([mdContent], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'reporadar-bookmarks.md';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ---- Collapsible Filters ----
function initFiltersCollapse() {
  filtersToggleBtn.addEventListener('click', () => {
    const isCollapsed = filtersPanel.classList.contains('collapsed');
    filtersPanel.classList.toggle('collapsed', !isCollapsed);
    filtersToggleBtn.classList.toggle('expanded', isCollapsed);
  });
}

// ---- Search History ----
function initHistory() {
  renderHistoryTags();
}

function addHistoryQuery(q) {
  const query = q.trim();
  if (!query) return;
  
  searchHistory = searchHistory.filter(h => h.toLowerCase() !== query.toLowerCase());
  searchHistory.unshift(query);
  searchHistory = searchHistory.slice(0, 5); // Keep top 5 latest queries
  localStorage.setItem('searchHistory', JSON.stringify(searchHistory));
  
  renderHistoryTags();
}

function renderHistoryTags() {
  historyListEl.innerHTML = '';
  if (searchHistory.length === 0) {
    historyContainer.classList.add('hidden');
    return;
  }
  
  historyContainer.classList.remove('hidden');
  searchHistory.forEach(q => {
    const tag = document.createElement('span');
    tag.className = 'history-tag';
    tag.textContent = q;
    tag.addEventListener('click', () => {
      queryInput.value = q;
      runSearch(q);
    });
    historyListEl.appendChild(tag);
  });
}

// ---- Keyboard Shortcuts ----
function initKeyboardShortcut() {
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== queryInput) {
      e.preventDefault();
      queryInput.focus();
      queryInput.select();
    }
  });
}

// ---- URL State Synchronization ----
function loadParamsFromURL() {
  const params = new URLSearchParams(window.location.search);
  const q = params.get('q');
  
  if (q) {
    queryInput.value = q;
    if (params.get('source')) fSource.value = params.get('source');
    if (params.get('language')) fLanguage.value = params.get('language');
    if (params.get('license')) fLicense.value = params.get('license');
    if (params.get('minStars')) fMinStars.value = params.get('minStars');
    if (params.get('sort')) fSort.value = params.get('sort');
    
    // Automatically expand filters panel if any advanced filters are active
    if (fLanguage.value || fLicense.value || fMinStars.value || fSort.value !== 'best' || fSource.value !== 'all') {
      filtersPanel.classList.remove('collapsed');
      filtersToggleBtn.classList.add('expanded');
    }
    
    runSearch(q);
  }
}

function updateURLParams(q) {
  const params = new URLSearchParams();
  params.set('q', q);
  if (fSource.value !== 'all') params.set('source', fSource.value);
  if (fLanguage.value.trim()) params.set('language', fLanguage.value.trim());
  if (fLicense.value.trim()) params.set('license', fLicense.value.trim());
  if (fMinStars.value.trim()) params.set('minStars', fMinStars.value.trim());
  if (fSort.value !== 'best') params.set('sort', fSort.value);
  
  const newUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({}, '', newUrl);
}

// ---- Render Helpers ----
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
  const card = node.querySelector('.repo-card');
  card.setAttribute('data-url', repo.url);

  const sourceTag = node.querySelector('.source-tag');
  sourceTag.textContent = repo.source;
  sourceTag.classList.add(repo.source);

  // Score display with tooltip data
  node.querySelector('.score-val').textContent = repo.score;
  const tooltipContent = node.querySelector('.tooltip-content');
  
  if (repo.scoreDetails) {
    tooltipContent.innerHTML = `
      <div class="tooltip-detail-item"><span>Stars (55%):</span> <b>${Math.round(repo.scoreDetails.starScore * 100)}%</b></div>
      <div class="tooltip-detail-item"><span>Recency (30%):</span> <b>${Math.round(repo.scoreDetails.recencyScore * 100)}%</b></div>
      <div class="tooltip-detail-item"><span>Forks (15%):</span> <b>${Math.round(repo.scoreDetails.forkScore * 100)}%</b></div>
      <div class="tooltip-detail-item"><span>Total Score:</span> <b>${repo.score}</b></div>
    `;
  } else {
    tooltipContent.textContent = 'Custom algorithm score';
  }

  // Star Bookmark Button
  const bookmarkBtn = node.querySelector('.bookmark-btn');
  const isBookmarked = bookmarks.some(b => b.url === repo.url);
  bookmarkBtn.classList.toggle('active', isBookmarked);
  bookmarkBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleBookmark(repo);
  });

  const link = node.querySelector('.repo-name a');
  link.href = repo.url;
  link.textContent = repo.name;

  node.querySelector('.repo-desc').textContent = repo.description || 'No description provided.';

  node.querySelector('.stars b').textContent = formatNum(repo.stars);
  node.querySelector('.forks b').textContent = formatNum(repo.forks);
  node.querySelector('.lang').textContent = repo.language || '';
  node.querySelector('.license').textContent = repo.license ? `⚖ ${repo.license}` : '';
  node.querySelector('.updated').textContent = `↻ ${timeAgo(repo.daysSinceUpdate)}`;

  // Clickable Topic chips
  const topicsEl = node.querySelector('.repo-topics');
  (repo.topics || []).slice(0, 5).forEach((t) => {
    const chip = document.createElement('span');
    chip.className = 'topic-chip';
    chip.textContent = t;
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      queryInput.value = t;
      runSearch(t);
    });
    topicsEl.appendChild(chip);
  });

  // Copy Clone Command Action
  node.querySelector('.copy-clone-btn').addEventListener('click', (e) => {
    const btn = e.target;
    const command = `git clone ${repo.url}.git`;
    navigator.clipboard.writeText(command).then(() => {
      const originalText = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = originalText, 1200);
    });
  });

  // Copy URL Action
  node.querySelector('.copy-url-btn').addEventListener('click', (e) => {
    const btn = e.target;
    navigator.clipboard.writeText(repo.url).then(() => {
      const originalText = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = originalText, 1200);
    });
  });

  return node;
}

function setLoading(isLoading) {
  searchBtn.disabled = isLoading;
  searchBtn.querySelector('.btn-label').textContent = isLoading ? 'SCANNING...' : 'SCAN';
  
  // Speed up or restore background radar sweep speed
  if (radarSweep) {
    radarSweep.classList.toggle('scanning', isLoading);
  }
}

// ---- Search Execution ----
async function runSearch(q) {
  if (!q.trim()) return;
  
  setLoading(true);
  updateURLParams(q);
  addHistoryQuery(q);

  statusEl.textContent = `Scanning all signal channels for "${q}"...`;
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
