const TEMPLATES = [
  { id: 'celebration', label: 'Celebration', file: 'celebration.png' },
  { id: 'birthday', label: 'Birthday', file: 'birthday.png' },
  { id: 'wedding', label: 'Wedding', file: 'wedding.png' },
  { id: 'baby-shower', label: 'Baby Shower', file: 'baby-shower.png' },
];

function findTemplate(id) {
  return TEMPLATES.find((t) => t.id === id);
}

module.exports = { TEMPLATES, findTemplate };
