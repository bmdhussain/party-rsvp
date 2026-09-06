const TEMPLATES = [
  { id: 'celebration', label: 'Celebration', file: 'celebration.png', category: 'gathering', sourceUrl: 'https://freesvg.org/neocreo-invitation' },
  { id: 'birthday', label: 'Birthday', file: 'birthday.png', category: 'celebration', sourceUrl: 'https://freesvg.org/bday-card' },
  { id: 'wedding', label: 'Wedding', file: 'wedding.png', category: 'celebration', sourceUrl: 'https://freesvg.org/wedding-flyer-vector-illustration' },
  { id: 'baby-shower', label: 'Baby Shower', file: 'baby-shower.png', category: 'gathering', sourceUrl: 'https://freesvg.org/cartoon-illustration-of-a-baby' },
  { id: 'anniversary', label: 'Anniversary', file: 'anniversary.png', category: 'celebration', sourceUrl: 'https://freesvg.org/anniversary-cake' },
  { id: 'graduation', label: 'Graduation', file: 'graduation.png', category: 'celebration', sourceUrl: 'https://freesvg.org/graduation-frame' },
  { id: 'retirement', label: 'Retirement', file: 'retirement.png', category: 'statement', sourceUrl: 'https://freesvg.org/party-poster' },
  { id: 'housewarming', label: 'Housewarming', file: 'housewarming.png', category: 'gathering', sourceUrl: 'https://freesvg.org/house-vector' },
  { id: 'engagement', label: 'Engagement', file: 'engagement.png', category: 'celebration', sourceUrl: 'https://freesvg.org/cupid-ring-frame-vector-drawing' },
  { id: 'holiday-new-year', label: 'Holiday / New Year', file: 'holiday-new-year.png', category: 'statement', sourceUrl: 'https://freesvg.org/merry-christmas-and-happy-new-year-greeting-card-vector-image' },
  { id: 'corporate', label: 'Corporate', file: 'corporate.png', category: 'statement', sourceUrl: 'https://freesvg.org/business-card-svg-template' },
  { id: 'quinceanera', label: 'Quinceañera', file: 'quinceanera.png', category: 'celebration', sourceUrl: 'https://freesvg.org/easter-lilies-frame-vector-illustration' },
  { id: 'sunlit-gathering', label: 'Sunlit Gathering', file: 'sunlit-gathering.png', category: 'gathering', sourceUrl: 'https://freesvg.org/invitation-frame' },
  { id: 'citrus-disco', label: 'Citrus Disco', file: 'citrus-disco.png', category: 'celebration', sourceUrl: 'https://freesvg.org/party-confetti' },
];

function findTemplate(id) {
  return TEMPLATES.find((t) => t.id === id);
}

module.exports = { TEMPLATES, findTemplate };
