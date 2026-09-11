// Starting points for new forms. Each is a complete, sensible form a host can
// publish as-is or edit freely. `kind: 'rsvp'` templates add questions to an
// event's RSVP form rather than standing alone, so they leave out name and
// email (the RSVP form already asks for both).

const DIETARY = ['None', 'Vegetarian', 'Vegan', 'Gluten-free', 'Dairy-free', 'Halal', 'Kosher', 'Nut allergy', 'Other'];

const q = (type, label, extra = {}) => ({ type, label, help: '', ...(type === 'section' ? {} : { required: false }), ...extra });

const TEMPLATES = [
  {
    id: 'blank',
    name: 'Blank form',
    description: 'Start from scratch with your own questions.',
    kind: 'standalone',
    title: 'Untitled form',
    fields: [q('short', 'Your name', { required: true })],
  },
  {
    id: 'registration',
    name: 'Event registration',
    description: 'Collect attendee details, dietary needs and how they heard about you.',
    kind: 'standalone',
    title: 'Event registration',
    fields: [
      q('short', 'Full name', { required: true }),
      q('email', 'Email address', { required: true, help: "We'll send any updates here." }),
      q('phone', 'Phone number'),
      q('short', 'Organisation or company'),
      q('dropdown', 'How did you hear about this event?', {
        options: ['A friend', 'Social media', 'Email', 'Website', 'Other'],
      }),
      q('checkboxes', 'Dietary requirements', { options: DIETARY }),
      q('paragraph', 'Accessibility needs', { help: "Tell us anything that would make the day easier for you." }),
    ],
  },
  {
    id: 'rsvp-extras',
    name: 'RSVP extras',
    description: 'Dietary needs, plus-one names and accessibility — asked alongside the RSVP.',
    kind: 'rsvp',
    title: 'RSVP questions',
    fields: [
      q('checkboxes', 'Any dietary requirements?', { options: DIETARY }),
      q('short', "Names of anyone you're bringing"),
      q('paragraph', 'Accessibility needs', { help: "Anything that would make it easier for you to join us." }),
      q('short', 'Song request', { help: "We'll try to get it on the playlist." }),
    ],
  },
  {
    id: 'potluck',
    name: 'Potluck sign-up',
    description: 'See who is bringing what, so you don’t end up with six desserts.',
    kind: 'standalone',
    title: 'Potluck sign-up',
    fields: [
      q('short', 'Your name', { required: true }),
      q('email', 'Email address', { required: true }),
      q('choice', 'What are you bringing?', {
        required: true,
        options: ['Main dish', 'Side', 'Salad', 'Dessert', 'Drinks', 'Snacks'],
      }),
      q('short', 'Name of the dish', { required: true }),
      q('number', 'Roughly how many people will it serve?'),
      q('checkboxes', 'Does it contain any of these?', {
        options: ['Nuts', 'Dairy', 'Gluten', 'Eggs', 'Shellfish', 'Meat', 'None of these'],
      }),
    ],
  },
  {
    id: 'volunteer',
    name: 'Volunteer sign-up',
    description: 'Recruit helpers and see which shifts and roles are covered.',
    kind: 'standalone',
    title: 'Volunteer sign-up',
    fields: [
      q('short', 'Full name', { required: true }),
      q('email', 'Email address', { required: true }),
      q('phone', 'Phone number', { help: 'In case we need to reach you on the day.' }),
      q('checkboxes', 'Which shifts can you help with?', {
        required: true,
        options: ['Setup', 'Morning', 'Afternoon', 'Evening', 'Pack-down'],
      }),
      q('checkboxes', 'What would you enjoy doing?', {
        options: ['Welcoming guests', 'Food and drink', 'Setting up', 'Photography', 'Wherever I’m needed'],
      }),
      q('dropdown', 'T-shirt size', { options: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] }),
      q('paragraph', 'Anything else we should know?'),
    ],
  },
  {
    id: 'feedback',
    name: 'Post-event feedback',
    description: 'A short survey to learn what worked and what to change next time.',
    kind: 'standalone',
    title: 'How was it?',
    fields: [
      q('rating', 'Overall, how would you rate the event?', { required: true }),
      q('paragraph', 'What did you enjoy most?'),
      q('paragraph', 'What could we do better?'),
      q('yesno', 'Would you come to another one?'),
      q('email', 'Email address', { help: "Only if you'd like us to follow up." }),
    ],
  },
  {
    id: 'workshop',
    name: 'Workshop registration',
    description: 'Sign people up for a class or session and learn their level.',
    kind: 'standalone',
    title: 'Workshop registration',
    fields: [
      q('short', 'Full name', { required: true }),
      q('email', 'Email address', { required: true }),
      q('choice', 'Which session would you like?', { required: true, options: ['Morning', 'Afternoon'] }),
      q('choice', 'Your experience level', { required: true, options: ['Beginner', 'Intermediate', 'Advanced'] }),
      q('paragraph', 'What do you hope to learn?'),
      q('checkboxes', 'Dietary requirements', { options: DIETARY }),
    ],
  },
  {
    id: 'interest',
    name: 'Interest list',
    description: 'Gather people who want to hear about your next event.',
    kind: 'standalone',
    title: 'Stay in the loop',
    fields: [
      q('short', 'Your name', { required: true }),
      q('email', 'Email address', { required: true }),
      q('checkboxes', 'What kind of events interest you?', {
        options: ['Dinners', 'Parties', 'Workshops', 'Community', 'Music', 'Sports'],
      }),
      q('choice', 'How often would you like to hear from us?', { options: ['Every event', 'Once a month', 'Only the big ones'] }),
    ],
  },
];

function findFormTemplate(id) {
  return TEMPLATES.find((t) => t.id === id) || null;
}

module.exports = { FORM_TEMPLATES: TEMPLATES, findFormTemplate };
