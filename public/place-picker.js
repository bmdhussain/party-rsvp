// The town picker, shared by the create form and an event's settings.
//
// A town is never set on the host's behalf. The browser's time zone gives a
// first guess, which is offered as a suggestion to accept or ignore, because
// the town ends up on a page the host's guests read.
(function () {
  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str == null ? '' : String(str);
    return d.innerHTML;
  }

  function mountPlacePicker(root, { onPick, onClear, initial } = {}) {
    const input = root.querySelector('[data-place-input]');
    const results = root.querySelector('[data-place-results]');
    const current = root.querySelector('[data-place-current]');
    const label = root.querySelector('[data-place-label]');
    const clearBtn = root.querySelector('[data-place-clear]');
    const suggestion = root.querySelector('[data-place-suggestion]');
    if (!input || !results) return null;

    let timer = null;
    let chosen = null;

    function show(place) {
      chosen = place;
      if (place) {
        if (label) label.textContent = place.label;
        if (current) current.hidden = false;
        if (suggestion) suggestion.hidden = true;
        input.value = '';
      } else if (current) {
        current.hidden = true;
      }
    }

    function render(places) {
      if (!places.length) {
        results.innerHTML = '<li><button type="button" disabled>No towns match that.</button></li>';
      } else {
        results.innerHTML = places
          .map(
            (p) =>
              `<li><button type="button" data-place="${escapeHtml(JSON.stringify(p))}">${escapeHtml(p.label)}</button></li>`
          )
          .join('');
      }
      results.hidden = false;
    }

    async function search(q) {
      results.hidden = true;
      if (q.trim().length < 2) return;
      try {
        const places = await (await fetch(`/api/places?q=${encodeURIComponent(q)}`)).json();
        render(Array.isArray(places) ? places : []);
      } catch {
        /* a picker that cannot search is still a form that works */
      }
    }

    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => search(input.value), 280);
    });

    results.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-place]');
      if (!btn) return;
      results.hidden = true;
      const place = JSON.parse(btn.dataset.place);
      show(place);
      if (onPick) onPick(place);
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        show(null);
        if (onClear) onClear();
      });
    }

    document.addEventListener('click', (e) => {
      if (!root.contains(e.target)) results.hidden = true;
    });

    if (initial) show(initial);

    // The guess. Offered, never applied: the host taps it or ignores it.
    if (suggestion && !initial) {
      const tz = (() => {
        try {
          return Intl.DateTimeFormat().resolvedOptions().timeZone;
        } catch {
          return '';
        }
      })();
      if (tz) {
        fetch(`/api/places/suggest?tz=${encodeURIComponent(tz)}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((place) => {
            if (!place || !place.label || chosen) return;
            suggestion.innerHTML =
              `<button type="button" class="place-suggest-btn" data-place="${escapeHtml(JSON.stringify(place))}">Use ${escapeHtml(place.label)}</button>` +
              '<small>Guessed from your device’s time zone. Change it if the event is somewhere else.</small>';
            suggestion.hidden = false;
            suggestion.querySelector('[data-place]').addEventListener('click', (e) => {
              const place2 = JSON.parse(e.currentTarget.dataset.place);
              show(place2);
              if (onPick) onPick(place2);
            });
          })
          .catch(() => {});
      }
    }

    return { get value() { return chosen; }, set: show };
  }

  window.RSVPfor = window.RSVPfor || {};
  window.RSVPfor.mountPlacePicker = mountPlacePicker;
})();
