function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function setProfileStatus(message, type = '') {
  const el = document.getElementById('profile-status');
  el.textContent = message;
  el.className = `profile-status ${type}`;
}

function renderProfileUrl(handle, isPublic) {
  const hint = document.getElementById('profile-url-hint');
  const viewBtn = document.getElementById('view-profile-btn');
  if (handle) {
    hint.textContent = `Your page: ${window.location.origin}/@${handle}${isPublic ? '' : ' (private until you switch it on)'}`;
    viewBtn.href = `/@${handle}`;
    viewBtn.style.display = isPublic ? 'inline-flex' : 'none';
  } else {
    hint.textContent = '3–30 characters: lowercase letters, numbers and underscores.';
    viewBtn.style.display = 'none';
  }
}

async function loadAccount() {
  const box = document.getElementById('account-summary');
  try {
    const { user } = await (await fetch('/api/me')).json();
    if (!user) {
      window.location.href = '/login?next=/settings';
      return;
    }
    box.innerHTML = `
      ${user.avatarUrl ? `<img class="account-summary-avatar" src="${escapeHtml(user.avatarUrl)}" alt="" referrerpolicy="no-referrer" />` : ''}
      <div><strong>${escapeHtml(user.name)}</strong>${user.email ? `<small>${escapeHtml(user.email)}</small>` : ''}</div>`;
  } catch (err) {
    box.innerHTML = '<div class="empty-note">Couldn\'t load your account.</div>';
  }
}

async function loadProfile() {
  try {
    const res = await fetch('/api/me/profile');
    if (!res.ok) return;
    const profile = await res.json();
    document.getElementById('profile-handle-input').value = profile.handle || '';
    document.getElementById('profile-bio-input').value = profile.bio || '';
    document.getElementById('profile-public-input').checked = Boolean(profile.publicProfile);
    renderProfileUrl(profile.handle, profile.publicProfile);
  } catch (err) {
    // Saving will surface any real problem.
  }
}

document.getElementById('profile-handle-input').addEventListener('input', (e) => {
  // Nudge toward a valid handle as they type rather than rejecting it on save.
  e.target.value = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
});

document.getElementById('save-profile-btn').addEventListener('click', async (e) => {
  const button = e.currentTarget;
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Saving…';
  setProfileStatus('');

  try {
    const res = await fetch('/api/me/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        handle: document.getElementById('profile-handle-input').value,
        bio: document.getElementById('profile-bio-input').value,
        publicProfile: document.getElementById('profile-public-input').checked,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not save your profile.');
    renderProfileUrl(data.handle, data.publicProfile);
    setProfileStatus(data.publicProfile ? 'Saved — your page is live.' : 'Saved. Your page is private for now.', 'success');
  } catch (err) {
    setProfileStatus(err.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
});

loadAccount();
loadProfile();
