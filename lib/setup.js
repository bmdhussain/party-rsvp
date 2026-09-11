// Where a host is in setting up an event, derived entirely from the event's own
// state rather than stored progress. That way "pick up where you left off"
// works on any device and can never disagree with what's actually there.

const STEPS = [
  {
    id: 'basics',
    label: 'Add the basics',
    hint: 'A name, a date and a place.',
    tab: 'settings',
    done: (e) => Boolean(e.name && e.event_date && e.location),
  },
  {
    id: 'look',
    label: 'Choose a look',
    hint: 'Pick artwork and put your words on it.',
    tab: 'design',
    done: (e) => Boolean(e.has_image),
  },
  {
    id: 'publish',
    label: 'Publish',
    hint: 'Make the invitation live so guests can reply.',
    tab: 'overview',
    done: (e) => Boolean(e.published_at),
  },
  {
    id: 'share',
    label: 'Get your first reply',
    hint: 'Send the link to your people.',
    tab: 'share',
    done: (e) => Number(e.rsvp_count) > 0,
  },
];

function tabHref(eventId, tab) {
  return tab === 'overview' ? `/host/${eventId}` : `/host/${eventId}/${tab}`;
}

// `event` needs: id, name, event_date, location, has_image, published_at, rsvp_count.
function setupProgress(event) {
  const steps = STEPS.map((step) => ({
    id: step.id,
    label: step.label,
    hint: step.hint,
    done: step.done(event),
    href: tabHref(event.id, step.tab),
  }));
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done) || null;
  return { steps, done, total: steps.length, complete: done === steps.length, next };
}

// Publishing needs a name and a date — an invitation with no date can't be
// replied to meaningfully, and a duplicated event deliberately starts without
// one. Returns a reason string, or null when the event can go live.
function publishBlocker(event) {
  if (!event.name || !String(event.name).trim()) return 'Give the event a name before publishing.';
  if (!event.event_date) return 'Set a date and time before publishing.';
  return null;
}

module.exports = { setupProgress, publishBlocker, tabHref, STEPS };
