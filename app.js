// NAIROBI NIGHTOWLS — APP LOGIC + CONFIG
// Talks to the Apps Script Web App defined in CONFIG.API_URL below.

// ---- Config -----------------------------------------------------------
// Paste your deployed Apps Script Web App URL here after deployment:
// Extensions > Apps Script > Deploy > New deployment > Web app > Execute as Me, Access: Anyone
const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbyzSGvuIhOqNC_YzvvSEm7oRSeMlhMLGx-vNn7_YDn88IkhDs_T7HqOjTuTBVHYXO8moA/exec',
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
let ACTIVE_GROUP_ID = null;

// Admin key lives in sessionStorage only (cleared when the tab closes),
// never localStorage, so it doesn't linger on shared/public machines.
let ADMIN_KEY = sessionStorage.getItem('nightowls_admin_key') || null;

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

// Admin actions always go through POST (see api.gs) and always need
// the admin_key mixed into the payload.
async function adminApiPost(action, payload) {
  if (!ADMIN_KEY) throw new Error('Admin panel is locked.');
  return apiPost(action, Object.assign({}, payload || {}, { admin_key: ADMIN_KEY }));
}

// ---- Init --------------------------------------------------------------

document.addEventListener('DOMContentLoaded', function () {
  renderTrackTabs();
  renderWeekStrip();
  loadReveal();
  loadIdeas(ACTIVE_TRACK);
  wireForms();
  initGroupsSection();
  initAdminSection();
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
      // Keep the "post an idea" form's track dropdown in sync with
      // whichever tab the person is currently browsing.
      const ideaTrackSelect = document.getElementById('idea-track');
      if (ideaTrackSelect) ideaTrackSelect.value = ACTIVE_TRACK;
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
      joinForm.innerHTML = '<p class="success">Welcome to the Nightwatch, ' + escapeHtml(user.full_name) + '. You can now post, vote, and manage groups.</p>';
      refreshGroupsVisibility();
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

// ------------------------------------------------------------------------
// GROUPS: create, list "my groups", view members, manage (founder only)
// ------------------------------------------------------------------------

function initGroupsSection() {
  refreshGroupsVisibility();

  document.getElementById('create-group-form').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!CURRENT_USER_ID) { alert('Join Nightowls first using the form below.'); return; }
    const formData = new FormData(e.target);
    apiPost('createGroup', {
      name: formData.get('name'),
      track: formData.get('track'),
      location_type: formData.get('location_type'),
      location_name: formData.get('location_name'),
      description: formData.get('description'),
      creator_user_id: CURRENT_USER_ID
    }).then(function () {
      e.target.reset();
      loadMyGroups();
    }).catch(function (err) { alert(err.message); });
  });

  document.getElementById('group-detail-close').addEventListener('click', function () {
    ACTIVE_GROUP_ID = null;
    document.getElementById('group-detail-panel').hidden = true;
  });
}

function refreshGroupsVisibility() {
  const signedOut = document.getElementById('groups-signed-out');
  const signedIn = document.getElementById('groups-signed-in');
  if (CURRENT_USER_ID) {
    signedOut.hidden = true;
    signedIn.hidden = false;
    loadMyGroups();
  } else {
    signedOut.hidden = false;
    signedIn.hidden = true;
  }
}

function loadMyGroups() {
  const list = document.getElementById('my-groups-list');
  list.innerHTML = '<p class="loading">Loading your groups…</p>';
  apiGet('listMyGroups', { user_id: CURRENT_USER_ID }).then(function (groups) {
    if (groups.length === 0) {
      list.innerHTML = '<p class="empty">You haven\'t joined or started a group yet.</p>';
      return;
    }
    list.innerHTML = groups.map(function (g) {
      return '<article class="group-card">' +
        '<div class="group-card-head">' +
        '<h4>' + escapeHtml(g.name) + '</h4>' +
        '<span class="group-role-badge">' + escapeHtml(g.my_role) + '</span>' +
        '</div>' +
        '<p class="group-card-meta">' + trackLabel(g.track) + ' · ' + escapeHtml(g.location_name) + ' · ' + (g.member_count || 0) + ' member(s)</p>' +
        '<button class="manage-group-btn" data-group-id="' + g.group_id + '">' +
        (g.my_role === 'founder' ? 'Manage group' : 'View members') +
        '</button></article>';
    }).join('');

    list.querySelectorAll('.manage-group-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { openGroupDetail(btn.dataset.groupId); });
    });
  }).catch(function (err) {
    list.innerHTML = '<p class="empty">Could not load your groups: ' + escapeHtml(err.message) + '</p>';
  });
}

function openGroupDetail(groupId) {
  ACTIVE_GROUP_ID = groupId;
  const panel = document.getElementById('group-detail-panel');
  const content = document.getElementById('group-detail-content');
  panel.hidden = false;
  content.innerHTML = '<p class="loading">Loading group…</p>';

  Promise.all([
    apiGet('listMyGroups', { user_id: CURRENT_USER_ID }),
    apiGet('listGroupMembers', { group_id: groupId })
  ]).then(function (results) {
    const groups = results[0];
    const members = results[1];
    const group = groups.find(function (g) { return g.group_id === groupId; });
    if (!group) { content.innerHTML = '<p class="empty">Group not found.</p>'; return; }
    renderGroupDetail(group, members);
  }).catch(function (err) {
    content.innerHTML = '<p class="empty">Could not load group: ' + escapeHtml(err.message) + '</p>';
  });
}

function renderGroupDetail(group, members) {
  const content = document.getElementById('group-detail-content');
  const isFounder = group.my_role === 'founder';

  const editBlock = isFounder ? (
    '<form id="group-edit-form" class="group-edit-form">' +
    '<label for="ge-name">Group name</label>' +
    '<input id="ge-name" name="name" value="' + escapeHtml(group.name) + '">' +
    '<label for="ge-description">Description</label>' +
    '<textarea id="ge-description" name="description" rows="3">' + escapeHtml(group.description || '') + '</textarea>' +
    '<button type="submit">Save changes</button>' +
    '</form>'
  ) : '';

  const memberRows = members.map(function (m) {
    const isSelf = m.user_id === CURRENT_USER_ID;
    let actions = '';
    if (isFounder && !isSelf) {
      actions =
        '<select class="role-select" data-user-id="' + m.user_id + '">' +
        '<option value="member"' + (m.role === 'member' ? ' selected' : '') + '>member</option>' +
        '<option value="co-lead"' + (m.role === 'co-lead' ? ' selected' : '') + '>co-lead</option>' +
        '</select>' +
        '<button class="make-founder-btn" data-user-id="' + m.user_id + '">Make founder</button>' +
        '<button class="remove-member-btn danger-btn" data-user-id="' + m.user_id + '">Remove</button>';
    } else if (isSelf && m.role !== 'founder') {
      actions = '<button class="leave-group-btn danger-btn" data-user-id="' + m.user_id + '">Leave group</button>';
    } else if (isSelf && m.role === 'founder') {
      actions = '<span class="text-dim-note">Transfer ownership to leave</span>';
    }

    return '<tr>' +
      '<td>' + escapeHtml(m.full_name) + (isSelf ? ' (you)' : '') + '</td>' +
      '<td class="member-role">' + escapeHtml(m.role) + '</td>' +
      '<td class="member-actions">' + actions + '</td>' +
      '</tr>';
  }).join('');

  content.innerHTML =
    '<h3 class="group-detail-title">' + escapeHtml(group.name) + '</h3>' +
    '<p class="group-card-meta">' + trackLabel(group.track) + ' · ' + escapeHtml(group.location_name) + '</p>' +
    editBlock +
    '<h4 class="section-subhead">Members (' + members.length + ')</h4>' +
    '<table class="members-table"><tbody>' + memberRows + '</tbody></table>';

  if (isFounder) {
    document.getElementById('group-edit-form').addEventListener('submit', function (e) {
      e.preventDefault();
      const formData = new FormData(e.target);
      apiPost('updateGroup', {
        group_id: group.group_id,
        requester_user_id: CURRENT_USER_ID,
        name: formData.get('name'),
        description: formData.get('description')
      }).then(function () {
        loadMyGroups();
        openGroupDetail(group.group_id);
      }).catch(function (err) { alert(err.message); });
    });

    content.querySelectorAll('.role-select').forEach(function (select) {
      select.addEventListener('change', function () {
        apiPost('updateGroupMemberRole', {
          group_id: group.group_id,
          requester_user_id: CURRENT_USER_ID,
          target_user_id: select.dataset.userId,
          new_role: select.value
        }).catch(function (err) { alert(err.message); });
      });
    });

    content.querySelectorAll('.make-founder-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!confirm('Make this member the new founder? You will become a regular member.')) return;
        apiPost('transferGroupOwnership', {
          group_id: group.group_id,
          requester_user_id: CURRENT_USER_ID,
          new_founder_user_id: btn.dataset.userId
        }).then(function () {
          loadMyGroups();
          openGroupDetail(group.group_id);
        }).catch(function (err) { alert(err.message); });
      });
    });

    content.querySelectorAll('.remove-member-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!confirm('Remove this member from the group?')) return;
        apiPost('removeGroupMember', {
          group_id: group.group_id,
          requester_user_id: CURRENT_USER_ID,
          target_user_id: btn.dataset.userId
        }).then(function () { openGroupDetail(group.group_id); })
          .catch(function (err) { alert(err.message); });
      });
    });
  }

  content.querySelectorAll('.leave-group-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (!confirm('Leave this group?')) return;
      apiPost('removeGroupMember', {
        group_id: group.group_id,
        requester_user_id: CURRENT_USER_ID,
        target_user_id: CURRENT_USER_ID
      }).then(function () {
        document.getElementById('group-detail-panel').hidden = true;
        loadMyGroups();
      }).catch(function (err) { alert(err.message); });
    });
  });
}

// ------------------------------------------------------------------------
// ADMIN PANEL — gated by admin_key, no AI involved anywhere here
// ------------------------------------------------------------------------

function initAdminSection() {
  const unlockBtn = document.getElementById('admin-unlock-btn');
  const lockBtn = document.getElementById('admin-lock-btn');
  const locked = document.getElementById('admin-locked');
  const panel = document.getElementById('admin-panel');

  function showUnlocked() {
    locked.hidden = true;
    panel.hidden = false;
    loadAdminModerationQueue();
    refreshAdminPoolCount();
  }

  if (ADMIN_KEY) showUnlocked();

  unlockBtn.addEventListener('click', function () {
    const key = prompt('Enter admin key:');
    if (!key) return;
    ADMIN_KEY = key;
    // Verify the key immediately with a harmless read before trusting it.
    adminApiPost('adminListPendingProfiles', {}).then(function () {
      sessionStorage.setItem('nightowls_admin_key', ADMIN_KEY);
      showUnlocked();
    }).catch(function () {
      ADMIN_KEY = null;
      alert('That admin key was rejected.');
    });
  });

  lockBtn.addEventListener('click', function () {
    ADMIN_KEY = null;
    sessionStorage.removeItem('nightowls_admin_key');
    panel.hidden = true;
    locked.hidden = false;
  });

  document.getElementById('admin-profile-form').addEventListener('submit', function (e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    adminApiPost('adminCreateNightowlProfile', {
      alias: formData.get('alias'),
      track: formData.get('track'),
      rarity_tier: formData.get('rarity_tier'),
      bio_redacted: formData.get('bio_redacted'),
      bio_full: formData.get('bio_full'),
      net_worth_redacted: formData.get('net_worth_redacted'),
      county_redacted: formData.get('county_redacted')
    }).then(function () {
      e.target.reset();
      refreshAdminPoolCount();
      alert('Profile added to the reveal pool.');
    }).catch(function (err) { alert(err.message); });
  });

  document.getElementById('admin-weekly-form').addEventListener('submit', function (e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    adminApiPost('adminPublishWeeklyContent', {
      day_of_week: formData.get('day_of_week'),
      track: formData.get('track'),
      title: formData.get('title'),
      body: formData.get('body'),
      link: formData.get('link')
    }).then(function () {
      e.target.reset();
      renderWeekStrip();
      alert('Weekly content published.');
    }).catch(function (err) { alert(err.message); });
  });

  document.getElementById('admin-draft-ledger-btn').addEventListener('click', function () {
    adminApiPost('adminDraftLedger', {}).then(function (draft) {
      document.getElementById('admin-week-body').value = draft.draft_body;
      document.getElementById('admin-day').value = 'sun';
    }).catch(function (err) { alert(err.message); });
  });

  document.getElementById('admin-run-reveal-btn').addEventListener('click', function () {
    adminApiPost('adminRunNightlyReveal', {}).then(function (reveal) {
      if (!reveal) { alert('No profiles left in the pool — add one above first.'); return; }
      loadReveal();
      refreshAdminPoolCount();
      alert('Reveal published.');
    }).catch(function (err) { alert(err.message); });
  });

  document.getElementById('admin-advance-week-btn').addEventListener('click', function () {
    if (!confirm('Advance the week number now? This normally happens automatically on Mondays.')) return;
    adminApiPost('adminAdvanceWeek', {}).then(function (newWeek) {
      alert('Now on week ' + newWeek + '.');
      renderWeekStrip();
    }).catch(function (err) { alert(err.message); });
  });
}

function refreshAdminPoolCount() {
  const note = document.getElementById('admin-pool-count');
  adminApiPost('adminListPendingProfiles', {}).then(function (profiles) {
    note.textContent = profiles.length + ' profile(s) waiting in the reveal pool.';
  }).catch(function () { note.textContent = ''; });
}

function loadAdminModerationQueue() {
  const list = document.getElementById('admin-moderation-list');
  list.innerHTML = '<p class="loading">Loading flagged items…</p>';
  adminApiPost('adminListModerationQueue', {}).then(function (items) {
    if (items.length === 0) {
      list.innerHTML = '<p class="empty">Nothing flagged right now.</p>';
      return;
    }
    list.innerHTML = items.map(function (item) {
      return '<div class="moderation-item">' +
        '<p><strong>' + escapeHtml(item.content_type) + '</strong>: ' + escapeHtml(item.flagged_reason) + '</p>' +
        '<button class="approve-btn" data-log-id="' + item.log_id + '">Approve</button>' +
        '<button class="reject-btn danger-btn" data-log-id="' + item.log_id + '">Reject</button>' +
        '</div>';
    }).join('');

    list.querySelectorAll('.approve-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { resolveModerationItem(btn.dataset.logId, 'approved'); });
    });
    list.querySelectorAll('.reject-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { resolveModerationItem(btn.dataset.logId, 'rejected'); });
    });
  }).catch(function (err) {
    list.innerHTML = '<p class="empty">Could not load queue: ' + escapeHtml(err.message) + '</p>';
  });
}

function resolveModerationItem(logId, decision) {
  adminApiPost('adminResolveModerationLog', { log_id: logId, decision: decision })
    .then(function () { loadAdminModerationQueue(); })
    .catch(function (err) { alert(err.message); });
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
