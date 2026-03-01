
import { escapeHtml, formatDate, invokeFunction, requireSession, signOut } from './session.js';

const state = {
  admin: null,
  metrics: null,
  selectedTab: 'overview',
  achievementCatalog: [],
  achievementTargetUserId: null,
};

const achievementCategoryOrder = [
  'longest_current_streak',
  'longest_habit_streak',
  'total_habit_completions',
  'total_habits_achieved',
  'account_age',
];

const els = {
  adminIdentity: document.getElementById('adminIdentity'),
  permissionNotice: document.getElementById('permissionNotice'),
  signOutBtn: document.getElementById('signOutBtn'),
  metrics: document.getElementById('metrics'),
  recentSignups: document.getElementById('recentSignups'),
  recentActions: document.getElementById('recentActions'),
  usersNotice: document.getElementById('usersNotice'),
  userSearchInput: document.getElementById('userSearchInput'),
  userStatusFilter: document.getElementById('userStatusFilter'),
  userResults: document.getElementById('userResults'),
  userEmpty: document.getElementById('userEmpty'),
  achievementModal: document.getElementById('achievementModal'),
  achievementTargetUser: document.getElementById('achievementTargetUser'),
  achievementNotice: document.getElementById('achievementNotice'),
  achievementOptions: document.getElementById('achievementOptions'),
  achievementSelectAll: document.getElementById('achievementSelectAll'),
  grantAchievementsBtn: document.getElementById('grantAchievementsBtn'),
  reportsTable: document.getElementById('reportsTable'),
  reportsNotice: document.getElementById('reportsNotice'),
  pushNotice: document.getElementById('pushNotice'),
  pushForm: document.getElementById('pushForm'),
  pushMode: document.getElementById('pushMode'),
  pushUserIdsWrap: document.getElementById('pushUserIdsWrap'),
  pushSegmentWrap: document.getElementById('pushSegmentWrap'),
  configNotice: document.getElementById('configNotice'),
  configForm: document.getElementById('configForm'),
  maintenanceMode: document.getElementById('maintenanceMode'),
  globalBanner: document.getElementById('globalBanner'),
  minSupportedVersion: document.getElementById('minSupportedVersion'),
  auditTable: document.getElementById('auditTable'),
};

function showNotice(el, message, type = 'error') {
  el.textContent = message;
  el.className = `notice show ${type}`;
}

function clearNotice(el) {
  el.className = 'notice';
  el.textContent = '';
}

function hasPermission(flag) {
  if (!state.admin) return false;
  if (state.admin.role === 'super_admin') return true;
  return Boolean(state.admin[flag]);
}

function setTab(tab) {
  state.selectedTab = tab;
  document.querySelectorAll('.nav-btn').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === tab);
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('hidden', panel.dataset.panel !== tab);
  });
}

function statusBadge(status) {
  const value = (status || 'active').toLowerCase();
  const map = {
    active: 'green',
    suspended: 'orange',
    banned: 'red',
    under_review: 'purple',
    resolved: 'green',
    open: 'gray',
  };
  return `<span class="badge ${map[value] || 'gray'}">${escapeHtml(value.replaceAll('_', ' '))}</span>`;
}

function renderOverview(metrics) {
  const items = [
    ['Users', metrics.totalUsers, `${metrics.activeUsers || 0} active`],
    ['Premium', metrics.premiumUsers, `${metrics.expiredPremiumUsers || 0} expired premium`],
    ['Open reports', metrics.openReports, `${metrics.resolvedReports || 0} resolved`],
    ['Push-ready users', metrics.pushReadyUsers, `${metrics.pushTokens || 0} total tokens`],
  ];
  els.metrics.innerHTML = items.map(([label, value, meta]) => `
    <article class="metric-card">
      <h3>${label}</h3>
      <div class="value">${escapeHtml(String(value ?? 0))}</div>
      <div class="meta">${escapeHtml(meta)}</div>
    </article>
  `).join('');

  els.recentSignups.innerHTML = (metrics.recentSignups || []).map((profile) => `
    <article class="user-card">
      <h3>${escapeHtml(profile.full_name || profile.username || profile.email || 'Unnamed user')}</h3>
      <div class="row muted">
        <span>${escapeHtml(profile.email || 'No email')}</span>
        <span>•</span>
        <span>${formatDate(profile.created_at)}</span>
      </div>
      <div class="row" style="margin-top:10px;">
        ${statusBadge(profile.account_status)}
        ${profile.plan ? `<span class="badge purple">${escapeHtml(profile.plan)}</span>` : ''}
      </div>
    </article>
  `).join('') || '<div class="empty-state">No recent signups found.</div>';

  els.recentActions.innerHTML = (metrics.recentActions || []).map((entry) => `
    <article class="feed-item">
      <h3>${escapeHtml(entry.action || 'Action')}</h3>
      <div class="muted">${formatDate(entry.created_at)}</div>
      <div style="margin-top:8px;">${escapeHtml(entry.target_type || 'system')} ${entry.target_id ? `• ${escapeHtml(entry.target_id)}` : ''}</div>
    </article>
  `).join('') || '<div class="empty-state">No admin actions logged yet.</div>';
}

function renderUsers(users) {
  if (!users.length) {
    els.userResults.innerHTML = '';
    els.userEmpty.classList.remove('hidden');
    return;
  }
  els.userEmpty.classList.add('hidden');
  els.userResults.innerHTML = users.map((user) => {
    const premiumExpiry = user.premium_expires_at ? `Expires ${formatDate(user.premium_expires_at)}` : 'No premium expiry';
    const note = user.status_reason ? `<div class="muted" style="margin-top:8px;">Reason: ${escapeHtml(user.status_reason)}</div>` : '';
    return `
      <article class="user-card" data-user-id="${escapeHtml(user.user_id)}">
        <div class="row" style="justify-content:space-between; align-items:flex-start;">
          <div>
            <h3>${escapeHtml(user.full_name || user.username || user.email || user.user_id)}</h3>
            <div class="muted">${escapeHtml(user.email || 'No email')} • ${escapeHtml(user.user_id)}</div>
          </div>
          <div class="row">
            ${statusBadge(user.account_status)}
            ${user.plan ? `<span class="badge purple">${escapeHtml(user.plan)}</span>` : ''}
          </div>
        </div>
        <div class="kv" style="margin-top:14px;">
          <strong>Username</strong><span>${escapeHtml(user.username || '—')}</span>
          <strong>Premium</strong><span>${escapeHtml(premiumExpiry)}</span>
          <strong>Created</strong><span>${formatDate(user.created_at)}</span>
          <strong>Push tokens</strong><span>${escapeHtml(String(user.push_token_count ?? 0))}</span>
        </div>
        ${note}
        <div class="actions">
          <button class="btn primary" data-action="grant-premium" data-user-id="${escapeHtml(user.user_id)}">Grant 30 days premium</button>
          <button class="btn outline" data-action="remove-premium" data-user-id="${escapeHtml(user.user_id)}">Remove premium</button>
          <button class="btn warning" data-action="suspend" data-user-id="${escapeHtml(user.user_id)}">Suspend 7 days</button>
          <button class="btn outline" data-action="activate" data-user-id="${escapeHtml(user.user_id)}">Restore active</button>
          <button class="btn primary" data-action="grant-achievement" data-user-id="${escapeHtml(user.user_id)}">Grant Achievement</button>
          <button class="btn danger" data-action="delete-user" data-user-id="${escapeHtml(user.user_id)}">Delete User</button>
        </div>
      </article>
    `;
  }).join('');
}

function renderAchievementOptions() {
  const items = state.achievementCatalog || [];
  if (!items.length) {
    els.achievementOptions.innerHTML = '<div class="muted">No achievement catalog rows found.</div>';
    return;
  }

  const grouped = new Map();
  items.forEach((item) => {
    const categoryKey = String(item.category_key || 'other');
    const categoryName = String(item.category_name || categoryKey.replaceAll('_', ' '));
    if (!grouped.has(categoryKey)) {
      grouped.set(categoryKey, {
        categoryKey,
        categoryName,
        items: [],
      });
    }
    grouped.get(categoryKey).items.push(item);
  });

  const categoryOrderIndex = (categoryKey) => {
    const index = achievementCategoryOrder.indexOf(categoryKey);
    return index === -1 ? 999 : index;
  };

  const groups = [...grouped.values()]
    .sort((a, b) => categoryOrderIndex(a.categoryKey) - categoryOrderIndex(b.categoryKey));

  els.achievementOptions.innerHTML = groups.map((group, index) => {
    const groupItems = [...group.items].sort((a, b) => {
      const aValue = Number(a.target_value ?? Number.MAX_SAFE_INTEGER);
      const bValue = Number(b.target_value ?? Number.MAX_SAFE_INTEGER);
      if (aValue !== bValue) return aValue - bValue;
      return String(a.name || a.key).localeCompare(String(b.name || b.key));
    });

    return `
      <details class="achievement-group" ${index === 0 ? 'open' : ''}>
        <summary>
          <span class="achievement-group__title">${escapeHtml(group.categoryName)}</span>
          <span class="muted">${escapeHtml(String(groupItems.length))} achievements</span>
        </summary>
        <div class="achievement-group__items">
          ${groupItems.map((item) => `
            <label class="row" style="justify-content:flex-start; gap:10px;">
              <input style="width:auto;" type="checkbox" data-achievement-key="${escapeHtml(item.key)}">
              <span>
                <strong>${escapeHtml(item.name || item.key)}</strong>
                <span class="muted">(${escapeHtml(item.target_label || item.key)})</span>
              </span>
            </label>
          `).join('')}
        </div>
      </details>
    `;
  }).join('');
}

async function loadAchievementCatalog() {
  const payload = await invokeFunction('admin-list-achievements', {});
  state.achievementCatalog = payload.achievements || [];
  renderAchievementOptions();
}

function closeAchievementModal() {
  state.achievementTargetUserId = null;
  clearNotice(els.achievementNotice);
  els.achievementModal.classList.add('hidden');
}

async function openAchievementModal(userId) {
  state.achievementTargetUserId = userId;
  clearNotice(els.achievementNotice);
  els.achievementSelectAll.checked = false;
  els.achievementOptions.innerHTML = '<div class="muted">Loading achievements...</div>';
  els.achievementTargetUser.textContent = `User: ${userId}`;
  els.achievementModal.classList.remove('hidden');

  try {
    await loadAchievementCatalog();
  } catch (error) {
    showNotice(els.achievementNotice, error.message || 'Could not load achievements.');
  }
}

function selectedAchievementKeys() {
  const keys = [];
  els.achievementOptions.querySelectorAll('input[type="checkbox"][data-achievement-key]').forEach((input) => {
    if (input.checked) keys.push(input.dataset.achievementKey);
  });
  return keys;
}

function toggleAchievementOptions(checked) {
  els.achievementOptions.querySelectorAll('input[type="checkbox"][data-achievement-key]').forEach((input) => {
    input.checked = checked;
  });
}

async function grantAchievements() {
  clearNotice(els.achievementNotice);

  const grantAll = els.achievementSelectAll.checked;
  const chosenKeys = selectedAchievementKeys();
  if (!state.achievementTargetUserId) {
    showNotice(els.achievementNotice, 'No user selected.');
    return;
  }

  if (!grantAll && !chosenKeys.length) {
    showNotice(els.achievementNotice, 'Pick at least one achievement or enable Select all.');
    return;
  }

  try {
    const payload = await invokeFunction('admin-grant-achievements', {
      user_id: state.achievementTargetUserId,
      grant_all: grantAll,
      achievement_keys: chosenKeys,
    });

    const granted = payload.granted_achievements || 0;
    const unlocked = payload.unlocked_badges || 0;
    showNotice(els.usersNotice, `Granted ${granted} achievements and unlocked ${unlocked} badges.`, 'success');
    closeAchievementModal();
    await Promise.all([searchUsers(), loadOverview(), loadAudit()]);
  } catch (error) {
    showNotice(els.achievementNotice, error.message || 'Could not grant achievements.');
  }
}

function renderReports(reports) {
  els.reportsTable.innerHTML = reports.map((report) => `
    <tr>
      <td>${formatDate(report.created_at)}</td>
      <td>${escapeHtml(report.reporter_display || report.reporter_id || 'Unknown')}</td>
      <td>${escapeHtml(report.reported_display || report.reported_user_id || 'Unknown')}</td>
      <td>
        <strong>${escapeHtml(report.reason || 'No reason')}</strong>
        <div class="muted" style="margin-top:6px;">${escapeHtml(report.description || report.details || report.message || 'No extra details')}</div>
      </td>
      <td>${statusBadge(report.status || 'open')}</td>
      <td>
        <button class="btn outline" data-report-id="${escapeHtml(report.id)}" data-action="resolve-report">Resolve</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="6" class="muted">No reports found.</td></tr>';
}

function renderAudit(logs) {
  els.auditTable.innerHTML = logs.map((entry) => `
    <tr>
      <td>${formatDate(entry.created_at)}</td>
      <td>${escapeHtml(entry.actor_email || entry.actor_user_id || 'system')}</td>
      <td>${escapeHtml(entry.action || '—')}</td>
      <td>${escapeHtml(entry.target_type || '—')} ${entry.target_id ? `• ${escapeHtml(entry.target_id)}` : ''}</td>
      <td><code>${escapeHtml(JSON.stringify(entry.details || {}))}</code></td>
    </tr>
  `).join('') || '<tr><td colspan="5" class="muted">No audit logs yet.</td></tr>';
}

async function loadAccess() {
  const payload = await invokeFunction('admin-check-access', {});
  state.admin = payload.admin;
  els.adminIdentity.textContent = `${payload.admin.email || payload.admin.user_id} • ${payload.admin.role}`;
  showNotice(els.permissionNotice, `Signed in as ${payload.admin.role.replaceAll('_', ' ')}.`, 'success');
}

async function loadOverview() {
  const payload = await invokeFunction('admin-get-dashboard-metrics', {});
  state.metrics = payload;
  renderOverview(payload);
}

async function searchUsers() {
  clearNotice(els.usersNotice);
  try {
    const payload = await invokeFunction('admin-search-users', {
      query: els.userSearchInput.value.trim(),
      account_status: els.userStatusFilter.value,
      limit: 25,
    });
    renderUsers(payload.users || []);
  } catch (error) {
    showNotice(els.usersNotice, error.message || 'Could not search users.');
  }
}

async function loadReports() {
  clearNotice(els.reportsNotice);
  try {
    const payload = await invokeFunction('admin-list-reports', { limit: 50 });
    renderReports(payload.reports || []);
  } catch (error) {
    showNotice(els.reportsNotice, error.message || 'Could not load reports.');
  }
}

async function loadConfig() {
  clearNotice(els.configNotice);
  try {
    const payload = await invokeFunction('admin-get-config', {});
    const config = payload.config || {};
    els.maintenanceMode.checked = Boolean(config.maintenance_mode?.enabled);
    els.globalBanner.value = config.global_banner?.text || '';
    els.minSupportedVersion.value = config.min_supported_version?.value || '';
  } catch (error) {
    showNotice(els.configNotice, error.message || 'Could not load config.');
  }
}

async function loadAudit() {
  const payload = await invokeFunction('admin-list-audit-logs', { limit: 75 });
  renderAudit(payload.logs || []);
}

async function handleUserAction(action, userId) {
  clearNotice(els.usersNotice);
  try {
    if (action === 'grant-premium') {
      await invokeFunction('admin-update-user-plan', {
        user_id: userId,
        plan: 'premium',
        premium_days: 30,
      });
      showNotice(els.usersNotice, 'Premium granted for 30 days.', 'success');
    }
    if (action === 'grant-achievement') {
      await openAchievementModal(userId);
      return;
    }
    if (action === 'remove-premium') {
      await invokeFunction('admin-update-user-plan', {
        user_id: userId,
        plan: 'free',
        premium_days: 0,
      });
      showNotice(els.usersNotice, 'Premium removed.', 'success');
    }
    if (action === 'suspend') {
      await invokeFunction('admin-set-account-status', {
        user_id: userId,
        status: 'suspended',
        suspended_days: 7,
        reason: 'Suspended by admin dashboard',
      });
      showNotice(els.usersNotice, 'User suspended for 7 days.', 'success');
    }
    if (action === 'activate') {
      await invokeFunction('admin-set-account-status', {
        user_id: userId,
        status: 'active',
        reason: 'Account restored by admin dashboard',
      });
      showNotice(els.usersNotice, 'User restored to active.', 'success');
    }
    if (action === 'delete-user') {
      const confirmed = window.confirm('Delete this user permanently? This cannot be undone.');
      if (!confirmed) return;

      await invokeFunction('admin-delete-user', { user_id: userId });
      showNotice(els.usersNotice, 'User deleted successfully.', 'success');
    }
    await searchUsers();
    await loadOverview();
  } catch (error) {
    showNotice(els.usersNotice, error.message || 'User action failed.');
  }
}

function wireTabs() {
  document.querySelectorAll('.nav-btn').forEach((button) => {
    button.addEventListener('click', () => setTab(button.dataset.tab));
  });
}

async function bootstrap() {
  const session = await requireSession('login.html');
  if (!session) return;

  wireTabs();
  els.signOutBtn.addEventListener('click', signOut);
  document.getElementById('refreshOverviewBtn').addEventListener('click', loadOverview);
  document.getElementById('searchUsersBtn').addEventListener('click', searchUsers);
  document.getElementById('refreshReportsBtn').addEventListener('click', loadReports);
  document.getElementById('refreshConfigBtn').addEventListener('click', loadConfig);
  document.getElementById('refreshAuditBtn').addEventListener('click', loadAudit);
  els.pushMode.addEventListener('change', () => {
    const segmentMode = els.pushMode.value === 'segment';
    els.pushUserIdsWrap.classList.toggle('hidden', segmentMode);
    els.pushSegmentWrap.classList.toggle('hidden', !segmentMode);
  });
  els.achievementSelectAll.addEventListener('change', () => {
    toggleAchievementOptions(els.achievementSelectAll.checked);
  });
  els.grantAchievementsBtn.addEventListener('click', grantAchievements);
  els.achievementModal.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="close-achievement-modal"]');
    if (!button) return;
    closeAchievementModal();
  });

  els.userResults.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    await handleUserAction(button.dataset.action, button.dataset.userId);
  });

  els.reportsTable.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action="resolve-report"]');
    if (!button) return;
    try {
      await invokeFunction('admin-resolve-report', {
        report_id: button.dataset.reportId,
        status: 'resolved',
        moderator_note: 'Resolved from admin dashboard',
      });
      showNotice(els.reportsNotice, 'Report resolved.', 'success');
      await loadReports();
      await loadOverview();
    } catch (error) {
      showNotice(els.reportsNotice, error.message || 'Could not resolve report.');
    }
  });

  els.pushForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearNotice(els.pushNotice);
    const formData = new FormData(els.pushForm);
    const mode = formData.get('mode');
    try {
      const payload = {
        title: String(formData.get('title') || '').trim(),
        body: String(formData.get('body') || '').trim(),
      };
      if (mode === 'segment') {
        payload.segment = String(formData.get('segment') || 'all');
      } else {
        payload.user_ids = String(formData.get('user_ids') || '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);
      }
      const result = await invokeFunction('admin-send-push', payload);
      showNotice(els.pushNotice, `Push sent to ${result.sent || 0} device tokens.`, 'success');
      els.pushForm.reset();
      els.pushMode.dispatchEvent(new Event('change'));
      await loadOverview();
      await loadAudit();
    } catch (error) {
      showNotice(els.pushNotice, error.message || 'Push send failed.');
    }
  });

  els.configForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearNotice(els.configNotice);
    try {
      await invokeFunction('admin-update-config', {
        updates: {
          maintenance_mode: { enabled: els.maintenanceMode.checked },
          global_banner: { text: els.globalBanner.value.trim() },
          min_supported_version: { value: els.minSupportedVersion.value.trim() },
        },
      });
      showNotice(els.configNotice, 'Config saved successfully.', 'success');
      await loadAudit();
    } catch (error) {
      showNotice(els.configNotice, error.message || 'Config update failed.');
    }
  });

  await loadAccess();
  await Promise.all([loadOverview(), searchUsers(), loadReports(), loadConfig(), loadAudit()]);
}

bootstrap().catch((error) => {
  showNotice(els.permissionNotice, error.message || 'Could not load admin dashboard.');
});
