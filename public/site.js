// Shared by every page: sign-out, the account menu, and showing server-rendered
// dates in the visitor's own timezone.
(function () {
  document.addEventListener('click', async (e) => {
    const logout = e.target.closest('[data-logout]');
    if (logout) {
      logout.disabled = true;
      try {
        await fetch('/auth/logout', { method: 'POST' });
      } catch (err) {
        // Signing out locally still matters even if the request failed.
      }
      window.location.href = '/';
      return;
    }
    document.querySelectorAll('details.account-menu[open]').forEach((menu) => {
      if (!menu.contains(e.target)) menu.removeAttribute('open');
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('details.account-menu[open]').forEach((menu) => menu.removeAttribute('open'));
  });

  const FORMATS = {
    date: { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' },
    datetime: { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' },
  };

  function localizeTimes(root) {
    (root || document).querySelectorAll('time[data-local]').forEach((el) => {
      const date = new Date(el.getAttribute('datetime'));
      if (Number.isNaN(date.getTime())) return;
      el.textContent = date.toLocaleString(undefined, FORMATS[el.dataset.local] || FORMATS.date);
    });
  }

  // One confirmation style for the whole app. Publishing, saving and closing
  // all say what happened in the same place, in the same words, so "is it
  // saved?" and "is it live?" never need guessing.
  let toastTimer = null;
  function toast(message, { kind = 'success', action = null, duration = 5000 } = {}) {
    let host = document.getElementById('app-toast');
    if (!host) {
      host = document.createElement('div');
      host.id = 'app-toast';
      host.className = 'app-toast';
      // Polite, so a screen reader finishes its sentence before announcing it.
      host.setAttribute('role', 'status');
      host.setAttribute('aria-live', 'polite');
      document.body.appendChild(host);
    }
    host.className = `app-toast is-${kind} is-visible`;
    host.textContent = '';

    const text = document.createElement('span');
    text.className = 'app-toast-text';
    text.textContent = message;
    host.appendChild(text);

    if (action && action.label) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'app-toast-action';
      btn.textContent = action.label;
      btn.addEventListener('click', () => {
        if (typeof action.onClick === 'function') action.onClick(btn);
      });
      host.appendChild(btn);
    }

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'app-toast-close';
    close.setAttribute('aria-label', 'Dismiss');
    close.textContent = '×';
    close.addEventListener('click', () => host.classList.remove('is-visible'));
    host.appendChild(close);

    clearTimeout(toastTimer);
    // An error stays until dismissed; there may be something to act on.
    if (duration && kind !== 'error') toastTimer = setTimeout(() => host.classList.remove('is-visible'), duration);
  }

  window.RSVPfor = Object.assign(window.RSVPfor || {}, { localizeTimes, toast });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => localizeTimes());
  } else {
    localizeTimes();
  }
})();
