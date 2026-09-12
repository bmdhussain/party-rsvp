// The first group is artwork from The Met's Open Access collection: every piece
// is out of copyright and released under CC0, so it can be used and altered
// without permission or attribution. We credit it anyway, in the picker.
// The second group is CC0 photography. Between them they cover the two looks a
// host tends to want: a designed invitation, or a picture of the occasion.
const TEMPLATES = [
  { id: 'wedding', label: 'Wedding', file: 'wedding.jpg', category: 'celebration', sourceName: 'William Morris, “Pink and Rose”, ca. 1890 · The Met (CC0)', sourceUrl: 'https://www.metmuseum.org/art/collection/search/337071' },
  { id: 'engagement', label: 'Engagement', file: 'engagement.jpg', category: 'celebration', sourceName: 'Réveillon, floral wallpaper, ca. 1780s · The Met (CC0)', sourceUrl: 'https://www.metmuseum.org/art/collection/search/367795' },
  { id: 'anniversary', label: 'Anniversary', file: 'anniversary.jpg', category: 'celebration', sourceName: 'Kano Sansetsu, “Old Plum”, 1646 · The Met (CC0)', sourceUrl: 'https://www.metmuseum.org/art/collection/search/44858' },
  { id: 'baby-shower', label: 'Baby Shower', file: 'baby-shower.jpg', category: 'gathering', sourceName: 'William Morris, “Jasmine”, 1872 · The Met (CC0)', sourceUrl: 'https://www.metmuseum.org/art/collection/search/383485' },
  { id: 'birthday', label: 'Birthday', file: 'birthday.jpg', category: 'celebration', sourceName: 'Embroidered cover, present-day Uzbekistan, early 19th c. · The Met (CC0)', sourceUrl: 'https://www.metmuseum.org/art/collection/search/447384' },
  { id: 'celebration', label: 'Celebration', file: 'celebration.jpg', category: 'gathering', sourceName: 'J.-E.-C. Lachaise, wallpaper design, 19th c. · The Met (CC0)', sourceUrl: 'https://www.metmuseum.org/art/collection/search/384889' },
  { id: 'quinceanera', label: 'Quinceañera', file: 'quinceanera.jpg', category: 'celebration', sourceName: 'H. Minder fils, paisley textile design, mid-19th c. · The Met (CC0)', sourceUrl: 'https://www.metmuseum.org/art/collection/search/367779' },
  { id: 'graduation', label: 'Graduation', file: 'graduation.jpg', category: 'celebration', sourceName: 'Nicolas Cochin, engraved flower panel, 1645 · The Met (CC0)', sourceUrl: 'https://www.metmuseum.org/art/collection/search/425820' },
  { id: 'corporate', label: 'Corporate', file: 'corporate.jpg', category: 'statement', sourceName: 'William Morris, “Marigold”, 1875 · The Met (CC0)', sourceUrl: 'https://www.metmuseum.org/art/collection/search/384018' },
  { id: 'holiday-new-year', label: 'Holiday / New Year', file: 'holiday-new-year.jpg', category: 'statement', sourceName: 'Hasegawa Sadanobu, “Kinkakuji seen in Falling Snow” · The Met (CC0)', sourceUrl: 'https://www.metmuseum.org/art/collection/search/55417' },
  { id: 'housewarming', label: 'Housewarming', file: 'housewarming.jpg', category: 'gathering', sourceName: 'William Morris, “Trellis”, 1864 · The Met (CC0)', sourceUrl: 'https://www.metmuseum.org/art/collection/search/384020' },
  { id: 'retirement', label: 'Retirement', file: 'retirement.jpg', category: 'statement', sourceName: 'Utagawa Hiroshige, “Autumn Moon on the Tama River”, ca. 1838 · The Met (CC0)', sourceUrl: 'https://www.metmuseum.org/art/collection/search/56903' },
  { id: 'sunlit-gathering', label: 'Sunlit Gathering', file: 'sunlit-gathering.jpg', category: 'gathering', sourceName: 'William Morris, “Willow Bough”, 1887 · The Met (CC0)', sourceUrl: 'https://www.metmuseum.org/art/collection/search/384022' },
  // Kept its id so events that already chose it keep their artwork; the label
  // and the art it points at are both new.
  { id: 'citrus-disco', label: 'Festive Bloom', file: 'citrus-disco.jpg', category: 'celebration', sourceName: 'İznik tile panel, Turkey, early 17th c. · The Met (CC0)', sourceUrl: 'https://www.metmuseum.org/art/collection/search/454352' },

  { id: 'cocktail-party', label: 'Cocktail Party', file: 'cocktail-party.png', category: 'statement', sourceName: 'Photo by Matt Bango · StockSnap.io (CC0)', sourceUrl: 'https://stocksnap.io/photo/alcohol-cocktail-NEKGIFYCL4' },
  { id: 'garden-party', label: 'Garden Party', file: 'garden-party.png', category: 'gathering', sourceName: 'Photo by Vikram Mudaliar · StockSnap.io (CC0)', sourceUrl: 'https://stocksnap.io/photo/bougainvillea-flowers-VZWH4VMI19' },
  { id: 'pool-party', label: 'Pool Party', file: 'pool-party.png', category: 'gathering', sourceName: 'Rawpixel (Public Domain)', sourceUrl: 'https://www.rawpixel.com/image/5917171/image-public-domain-summer-water' },
  { id: 'game-night', label: 'Game Night', file: 'game-night.png', category: 'gathering', sourceName: 'Photo by Candace McDaniel · StockSnap.io (CC0)', sourceUrl: 'https://stocksnap.io/photo/lucky-dice-X8CPTKKQEX' },
  { id: 'brunch', label: 'Brunch', file: 'brunch.png', category: 'gathering', sourceName: 'Photo by Tilak Bahadur Karki · WordPress Photos (CC0)', sourceUrl: 'https://wordpress.org/photos/photo/7176a2a49a/' },
  { id: 'dinner-party', label: 'Dinner Party', file: 'dinner-party.png', category: 'statement', sourceName: 'Photo by WDnet Studio · StockSnap.io (CC0)', sourceUrl: 'https://stocksnap.io/photo/finedining-dinner-UAOW7BNH2M' },
  { id: 'halloween', label: 'Halloween', file: 'halloween.png', category: 'celebration', sourceName: 'Photo by Toyah Anette B · Wikimedia Commons (CC0)', sourceUrl: 'https://commons.wikimedia.org/w/index.php?curid=153193086' },
  { id: 'thanksgiving', label: 'Thanksgiving', file: 'thanksgiving.png', category: 'gathering', sourceName: 'Photo by Element5 Digital · StockSnap.io (CC0)', sourceUrl: 'https://stocksnap.io/photo/thanksgiving-autumn-Q1D4QEQM3Z' },
  { id: 'fourth-of-july', label: 'Fourth of July', file: 'fourth-of-july.png', category: 'celebration', sourceName: 'Rawpixel (Public Domain)', sourceUrl: 'https://www.rawpixel.com/image/6038039/photo-image-lights-public-domain-celebration' },
  { id: 'gender-reveal', label: 'Gender Reveal', file: 'gender-reveal.png', category: 'celebration', sourceName: 'Photo by Burak Kebapci · StockSnap.io (CC0)', sourceUrl: 'https://stocksnap.io/photo/balloon-colorful-ZZI582DSTA' },
  { id: 'bridal-shower', label: 'Bridal Shower', file: 'bridal-shower.png', category: 'celebration', sourceName: 'Rawpixel (Public Domain)', sourceUrl: 'https://www.rawpixel.com/image/6040025/photo-image-flower-public-domain-hand' },
  { id: 'bachelorette-party', label: 'Bachelorette Party', file: 'bachelorette-party.png', category: 'celebration', sourceName: 'Photo by Kristin Hardwick · StockSnap.io (CC0)', sourceUrl: 'https://stocksnap.io/photo/champagne-bottle-ZLASC4UKIX' },
  { id: 'reunion', label: 'Reunion', file: 'reunion.png', category: 'gathering', sourceName: 'Photo by Tohm Brigitte · StockSnap.io (CC0)', sourceUrl: 'https://stocksnap.io/photo/picnic-food-ZMJIH1NTZ1' },
  { id: 'welcome-party', label: 'Welcome Party', file: 'welcome-party.png', category: 'gathering', sourceName: 'Rawpixel (Public Domain)', sourceUrl: 'https://www.rawpixel.com/image/5919428/image-light-public-domain-free' },
];

function findTemplate(id) {
  return TEMPLATES.find((t) => t.id === id);
}

module.exports = { TEMPLATES, findTemplate };
