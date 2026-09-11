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

  window.RSVPfor = Object.assign(window.RSVPfor || {}, { localizeTimes });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => localizeTimes());
  } else {
    localizeTimes();
  }
})();
