const TEMPLATES = [
  { id: 'celebration', label: 'Celebration', file: 'celebration.png' },
  { id: 'birthday', label: 'Birthday', file: 'birthday.png' },
  { id: 'wedding', label: 'Wedding', file: 'wedding.png' },
  { id: 'baby-shower', label: 'Baby Shower', file: 'baby-shower.png' },
  { id: 'anniversary', label: 'Anniversary', file: 'anniversary.png' },
  { id: 'graduation', label: 'Graduation', file: 'graduation.png' },
  { id: 'retirement', label: 'Retirement', file: 'retirement.png' },
  { id: 'housewarming', label: 'Housewarming', file: 'housewarming.png' },
  { id: 'engagement', label: 'Engagement', file: 'engagement.png' },
  { id: 'holiday-new-year', label: 'Holiday / New Year', file: 'holiday-new-year.png' },
  { id: 'corporate', label: 'Corporate', file: 'corporate.png' },
  { id: 'quinceanera', label: 'Quinceañera', file: 'quinceanera.png' },
  { id: 'sunlit-gathering', label: 'Sunlit Gathering', file: 'sunlit-gathering.png' },
  { id: 'citrus-disco', label: 'Citrus Disco', file: 'citrus-disco.png' },
];

function findTemplate(id) {
  return TEMPLATES.find((t) => t.id === id);
}

module.exports = { TEMPLATES, findTemplate };
