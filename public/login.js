(async function () {
  const container = document.getElementById('provider-buttons');
  // Already URL-encoded by the server (or empty), and only ever a path on this
  // site — the server validated it.
  const next = container.dataset.next || '';
  try {
    const providers = await (await fetch('/api/auth/providers')).json();
    const buttons = [];
    if (providers.google) {
      buttons.push(`<a class="btn provider-btn google" href="/auth/google${next}"><span class="icon">G</span> Continue with Google</a>`);
    }
    if (providers.facebook) {
      buttons.push(`<a class="btn provider-btn facebook" href="/auth/facebook${next}"><span class="icon">f</span> Continue with Facebook</a>`);
    }
    container.innerHTML = buttons.length
      ? buttons.join('')
      : '<div class="empty-note">Sign-in isn\'t configured yet. The site owner needs to add Google login credentials.</div>';
  } catch (err) {
    container.innerHTML = '<div class="empty-note">Couldn\'t load sign-in options. Refresh to try again.</div>';
  }
})();
