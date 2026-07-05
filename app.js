// NAIROBI NIGHTOWLS — APP LOGIC + CONFIG
// Talks to the Apps Script Web App defined in CONFIG.API_URL below.

// ---- Config -----------------------------------------------------------
// Paste your deployed Apps Script Web App URL here after deployment:
// Extensions > Apps Script > Deploy > New deployment > Web app > Execute as Me, Access: Anyone
const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbwOTdw3RGRs4VWPaay5yWoC5oRKwzx3grbn4KB9jI4ovShuJvLWCqx3miQBVdIqxJuxEQ/exec',
  TRACKS: [
    { id: 'business', label: 'Business', color: '#F2B705' },
    { id: 'agriculture', label: 'Agriculture', color: '#4FA37B' },
    { id: 'it', label: 'IT / Tech', color: '#4EA3D9' },
    { id: 'politics', label: 'Politics & Civic', color: '#D9564F' },
    { id: 'campus', label: 'Campus Life', color: '#B57BD9' }
  ],
  WEEK_DAYS: [
    { key: 'mon', label: 'Mon', feature: 'Topic of the Week' },
    { key: 'tue', label: 'Tue', feature: 'Idea of the Week' },
    { key: 'wed', label: 'Wed', feature: 'Book of the Week' },
    { key: 'thu', label: 'Thu', feature: 'Company of the Week' },
    { key: 'fri', label: 'Fri', feature: 'Billionaire of the Week' },
    { key: 'sat', label: 'Sat', feature: 'Quote of the Week' },
    { key: 'sun', label: 'Sun', feature: 'The Ledger' }
  ]
};

let CURRENT_USER_ID = localStorage.getItem('nightowls_user_id') || null;
let ACTIVE_TRACK = 'business';

// ---- API helpers -----------------------------------------------------

async function apiGet(action, params) {
  const url = new URL(CONFIG.API_URL);
  url.searchParams.set('action', action);
  Object.keys(params || {}).forEach(function (k) { url.searchParams.set(k, params[k]); });
  const res = await fetch(url.toString());
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

async function apiPost(action, payload) {
  // Content-Type text/plain avoids a CORS preflight against Apps Script,
  // which does not support custom preflight responses.
  const res = await fetch(CONFIG.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: action, payload: payload || {} })
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

// ---- Init --------------------------------------------------------------

document.addEventListener('DOMContentLoaded', function () {
  renderTrackTabs();
  renderWeekStrip();
  loadReveal();
  loadIdeas(ACTIVE_TRACK);
  wireForms();
});

// ---- Track tabs ----------------------------------------------------------

function renderTrackTabs() {
  const nav = document.getElementById('track-tabs');
  nav.innerHTML = CONFIG.TRACKS.map(function (t) {
    return '<button class="track-tab' + (t.id === ACTIVE_TRACK ? ' active' : '') + '" ' +
      'style="--track-color:' + t.color + '" data-track="' + t.id + '">' + t.label + '</button>';
  }).join('');

  nav.querySelectorAll('.track-tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      ACTIVE_TRACK = btn.dataset.track;
      nav.querySelectorAll('.track-tab').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      loadIdeas(ACTIVE_TRACK);
    });
  });
}

// ---- Weekly rhythm strip ----------------------------------------------------

function renderWeekStrip() {
  const strip = document.getElementById('week-strip');
  strip.innerHTML = CONFIG.WEEK_DAYS.map(function (d) {
    return '<div class="week-day" data-day="' + d.key + '">' +
      '<span class="week-day-label">' + d.label + '</span>' +
      '<span class="week-day-feature">' + d.feature + '</span>' +
      '</div>';
  }).join('');

  apiGet('getCurrentWeek').then(function (items) {
    items.forEach(function (item) {
      const cell = strip.querySelector('[data-day="' + dayKeyFromFeature(item.feature_type) + '"]');
      if (cell) {
        cell.classList.add('filled');
        cell.querySelector('.week-day-feature').textContent = item.title || cell.querySelector('.week-day-feature').textContent;
      }
    });
  }).catch(function (err) { console.warn('Weekly content unavailable:', err.message); });
}

function dayKeyFromFeature(featureType) {
  const map = {
    topic_of_week: 'mon', idea_of_week: 'tue', book_of_week: 'wed',
    company_of_week: 'thu', billionaire_of_week: 'fri',
    quote_of_week: 'sat', the_ledger: 'sun'
  };
  return map[featureType];
}

// ---- Nightly reveal (signature element) --------------------------------------

function loadReveal() {
  const card = document.getElementById('reveal-card');
  apiGet('getLatestReveal').then(function (data) {
    if (!data || !data.profile) {
      card.innerHTML = '<p class="reveal-empty">Tonight\'s reveal generates at 8pm — check back soon.</p>';
      return;
    }
    const p = data.profile;
    card.innerHTML =
      '<div class="reveal-scanline"></div>' +
      '<span class="reveal-rarity">' + (p.rarity_tier === 'legendary' ? 'LEGENDARY' : 'LOCAL LEGEND') + '</span>' +
      '<h3 class="reveal-alias">' + escapeHtml(p.alias) + '</h3>' +
      '<p class="reveal-track">' + trackLabel(p.track) + '</p>' +
      '<dl class="reveal-stats">' +
      '<dt>Net worth</dt><dd class="redacted">' + escapeHtml(String(p.net_worth_redacted)) + '</dd>' +
      '<dt>County</dt><dd class="redacted">' + escapeHtml(String(p.county_redacted)) + '</dd>' +
      '</dl>' +
      '<p class="reveal-bio">' + escapeHtml(p.bio_redacted || '') + '</p>';
  }).catch(function (err) {
    card.innerHTML = '<p class="reveal-empty">Reveal feed unavailable: ' + escapeHtml(err.message) + '</p>';
  });
}

// ---- Ideas board -----------------------------------------------------------

function loadIdeas(track) {
  const list = document.getElementById('ideas-list');
  list.innerHTML = '<p class="loading">Loading ideas…</p>';
  apiGet('listIdeas', { track: track, limit: 20 }).then(function (ideas) {
    if (ideas.length === 0) {
      list.innerHTML = '<p class="empty">No ideas posted in this track yet. Be first.</p>';
      return;
    }
    list.innerHTML = ideas.map(renderIdeaCard).join('');
    wireUpvoteButtons();
  }).catch(function (err) {
    list.innerHTML = '<p class="empty">Could not load ideas: ' + escapeHtml(err.message) + '</p>';
  });
}

function renderIdeaCard(idea) {
  return '<article class="idea-card">' +
    '<h4>' + escapeHtml(idea.title) + '</h4>' +
    '<p>' + escapeHtml(idea.description) + '</p>' +
    '<div class="idea-meta">' +
    '<button class="upvote-btn" data-idea-id="' + idea.idea_id + '">▲ ' + (idea.upvote_count || 0) + '</button>' +
    '</div></article>';
}

function wireUpvoteButtons() {
  document.querySelectorAll('.upvote-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (!CURRENT_USER_ID) {
        alert('Join Nightowls first (see the form below) so votes can be counted once per person.');
        return;
      }
      apiPost('upvoteIdea', { idea_id: btn.dataset.ideaId, user_id: CURRENT_USER_ID })
        .then(function (result) {
          btn.textContent = '▲ ' + result.upvote_count;
          if (result.suggest_group) {
            alert('This idea has enough momentum to become a group! Consider turning it into one.');
          }
        })
        .catch(function (err) { alert(err.message); });
    });
  });
}

// ---- Forms: join + post idea -------------------------------------------------

function wireForms() {
  const joinForm = document.getElementById('join-form');
  joinForm.addEventListener('submit', function (e) {
    e.preventDefault();
    const formData = new FormData(joinForm);
    apiPost('registerUser', {
      full_name: formData.get('full_name'),
      email: formData.get('email'),
      primary_track: formData.get('primary_track'),
      campus_or_county: formData.get('campus_or_county')
    }).then(function (user) {
      CURRENT_USER_ID = user.user_id;
      localStorage.setItem('nightowls_user_id', user.user_id);
      joinForm.innerHTML = '<p class="success">Welcome to the Nightwatch, ' + escapeHtml(user.full_name) + '. You can now post and vote.</p>';
    }).catch(function (err) { alert(err.message); });
  });

  const ideaForm = document.getElementById('idea-form');
  ideaForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!CURRENT_USER_ID) {
      alert('Join Nightowls first using the form above.');
      return;
    }
    const formData = new FormData(ideaForm);
    apiPost('createIdea', {
      author_user_id: CURRENT_USER_ID,
      title: formData.get('title'),
      description: formData.get('description'),
      track: formData.get('track')
    }).then(function () {
      ideaForm.reset();
      loadIdeas(ACTIVE_TRACK);
    }).catch(function (err) { alert(err.message); });
  });
}

// ---- Small utils ---------------------------------------------------------

function trackLabel(trackId) {
  const t = CONFIG.TRACKS.find(function (t) { return t.id === trackId; });
  return t ? t.label : trackId;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : str;
  return div.innerHTML;
}
