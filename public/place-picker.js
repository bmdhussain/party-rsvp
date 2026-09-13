// The town picker, shared by the create form and an event's settings.
//
// A town is never set on the host's behalf. The browser's time zone gives a
// first guess, offered as a suggestion to accept or ignore, because the town
// ends up on a page the host's guests read.
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
    // The places behind the visible list. They stay in JavaScript rather than
    // being written into data- attributes: a place name can contain a quote,
    // and JSON always does, which ends the attribute early and leaves the
    // parser with half an object.
    let offered = [];
    let suggested = null;

    function show(place, { fillInput = true } = {}) {
      chosen = place;
      if (place) {
        // The selected town belongs in the box the host typed into. Anything
        // else reads as though the click did nothing.
        if (fillInput) input.value = place.label;
        // The name is already in the box above; repeating it here just doubles
        // it up, so this line says what having it means instead.
        if (label) label.textContent = 'Weather will show on the event page.';
        if (current) current.hidden = false;
        if (suggestion) suggestion.hidden = true;
      } else {
        input.value = '';
        if (current) current.hidden = true;
      }
    }

    function choose(place) {
      results.hidden = true;
      show(place);
      if (onPick) onPick(place);
    }

    async function search(q) {
      results.hidden = true;
      if (q.trim().length < 2) return;
      try {
        const places = await (await fetch(`/api/places?q=${encodeURIComponent(q)}`)).json();
        offered = Array.isArray(places) ? places : [];
      } catch {
        return; // a picker that cannot search is still a form that works
      }
      results.innerHTML = offered.length
        ? offered
            .map((p, i) => `<li><button type="button" data-index="${i}">${escapeHtml(p.label)}</button></li>`)
            .join('')
        : '<li><button type="button" disabled>No towns match that.</button></li>';
      results.hidden = false;
    }

    input.addEventListener('input', () => {
      // Typing after choosing means the choice no longer matches what is on
      // screen, so it stops counting until something is picked again.
      if (chosen && input.value !== chosen.label) {
        chosen = null;
        if (current) current.hidden = true;
      }
      clearTimeout(timer);
      timer = setTimeout(() => search(input.value), 280);
    });

    results.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-index]');
      if (!btn) return;
      const place = offered[Number(btn.dataset.index)];
      if (place) choose(place);
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

    // A town already saved on the event: named in the box, so it reads the same
    // as one just chosen.
    if (initial) show(initial);

    // The precise option. A time zone is a country-sized hint — everyone in
    // India reports Asia/Kolkata — so a host who wants the actual town taps
    // once and the browser asks their permission. Nothing happens without that
    // tap, and nothing is looked up from their network address.
    const locateBtn = root.querySelector('[data-place-locate]');
    if (locateBtn) {
      if (!navigator.geolocation) {
        locateBtn.hidden = true;
      } else {
        locateBtn.addEventListener('click', () => {
          const original = locateBtn.textContent;
          locateBtn.disabled = true;
          locateBtn.textContent = 'Finding you…';
          const done = (msg) => {
            locateBtn.disabled = false;
            locateBtn.textContent = original;
            if (msg) window.RSVPfor?.toast(msg, { kind: 'info' });
          };
          navigator.geolocation.getCurrentPosition(
            async (pos) => {
              try {
                const { latitude, longitude } = pos.coords;
                const place = await (
                  await fetch(`/api/places/reverse?lat=${latitude}&lon=${longitude}`)
                ).json();
                if (!place || !place.label) return done('Could not name that spot — try typing the town.');
                done();
                choose(place);
              } catch {
                done('Could not look that up — try typing the town.');
              }
            },
            () => done('No location shared. You can still type the town.'),
            { enableHighAccuracy: false, timeout: 9000, maximumAge: 10 * 60 * 1000 }
          );
        });
      }
    }

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
            suggested = place;
            suggestion.innerHTML =
              `<button type="button" class="place-suggest-btn">Use ${escapeHtml(place.label)}</button>` +
              '<small>Guessed from your device’s time zone. Change it if the event is somewhere else.</small>';
            suggestion.hidden = false;
            suggestion.querySelector('button').addEventListener('click', () => choose(suggested));
          })
          .catch(() => {});
      }
    }

    return {
      get value() {
        return chosen;
      },
      set: show,
    };
  }

  window.RSVPfor = window.RSVPfor || {};
  window.RSVPfor.mountPlacePicker = mountPlacePicker;
})();
