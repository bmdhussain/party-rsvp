// Two kinds of artwork. The first group is drawn for RSVPfor, so there is no
// licence to honour and nobody to credit. The second is CC0 photography, which
// is credited in the picker.
const TEMPLATES = [

  // Drawn for RSVPfor rather than sourced: the modern stationery looks a host
  // reaches for first. No licence to honour and nobody to credit.
  { id: 'sage-garland', label: 'Sage Garland', file: 'sage-garland.jpg', category: 'gathering', origin: 'original' },
  { id: 'olive-garland', label: 'Olive Garland', file: 'olive-garland.jpg', category: 'gathering', origin: 'original' },
  { id: 'blush-garland', label: 'Blush Garland', file: 'blush-garland.jpg', category: 'celebration', origin: 'original' },
  { id: 'terracotta-arches', label: 'Terracotta Arches', file: 'terracotta-arches.jpg', category: 'gathering', origin: 'original' },
  { id: 'plum-arches', label: 'Plum Arches', file: 'plum-arches.jpg', category: 'celebration', origin: 'original' },
  { id: 'teal-arches', label: 'Teal Arches', file: 'teal-arches.jpg', category: 'statement', origin: 'original' },
  { id: 'carnival-stripes', label: 'Carnival Stripes', file: 'carnival-stripes.jpg', category: 'celebration', origin: 'original' },
  { id: 'berry-stripes', label: 'Berry Stripes', file: 'berry-stripes.jpg', category: 'celebration', origin: 'original' },
  { id: 'harbour-stripes', label: 'Harbour Stripes', file: 'harbour-stripes.jpg', category: 'statement', origin: 'original' },
  { id: 'sunset-waves', label: 'Sunset Waves', file: 'sunset-waves.jpg', category: 'gathering', origin: 'original' },
  { id: 'ocean-waves', label: 'Ocean Waves', file: 'ocean-waves.jpg', category: 'gathering', origin: 'original' },
  { id: 'dusk-waves', label: 'Dusk Waves', file: 'dusk-waves.jpg', category: 'statement', origin: 'original' },
  { id: 'terrazzo', label: 'Terrazzo', file: 'terrazzo.jpg', category: 'gathering', origin: 'original' },
  { id: 'pastel-terrazzo', label: 'Pastel Terrazzo', file: 'pastel-terrazzo.jpg', category: 'gathering', origin: 'original' },
  { id: 'ink-terrazzo', label: 'Ink Terrazzo', file: 'ink-terrazzo.jpg', category: 'statement', origin: 'original' },
  { id: 'midnight-confetti', label: 'Midnight Confetti', file: 'midnight-confetti.jpg', category: 'celebration', origin: 'original' },
  { id: 'blush-confetti', label: 'Blush Confetti', file: 'blush-confetti.jpg', category: 'celebration', origin: 'original' },
  { id: 'emerald-confetti', label: 'Emerald Confetti', file: 'emerald-confetti.jpg', category: 'celebration', origin: 'original' },
  { id: 'neon-dusk', label: 'Neon Dusk', file: 'neon-dusk.jpg', category: 'statement', origin: 'original' },
  { id: 'cool-mesh', label: 'Cool Mesh', file: 'cool-mesh.jpg', category: 'statement', origin: 'original' },
  { id: 'paper-cutouts', label: 'Paper Cutouts', file: 'paper-cutouts.jpg', category: 'gathering', origin: 'original' },
  { id: 'jewel-cutouts', label: 'Jewel Cutouts', file: 'jewel-cutouts.jpg', category: 'gathering', origin: 'original' },
  { id: 'pastel-cutouts', label: 'Pastel Cutouts', file: 'pastel-cutouts.jpg', category: 'gathering', origin: 'original' },
  { id: 'deco-gold', label: 'Deco Gold', file: 'deco-gold.jpg', category: 'statement', origin: 'original' },
  { id: 'deco-emerald', label: 'Deco Emerald', file: 'deco-emerald.jpg', category: 'statement', origin: 'original' },
  { id: 'deco-rose', label: 'Deco Rose', file: 'deco-rose.jpg', category: 'celebration', origin: 'original' },
  { id: 'liquid-sunset', label: 'Liquid Sunset', file: 'liquid-sunset.jpg', category: 'statement', origin: 'original' },
  { id: 'liquid-ocean', label: 'Liquid Ocean', file: 'liquid-ocean.jpg', category: 'statement', origin: 'original' },
  { id: 'liquid-sand', label: 'Liquid Sand', file: 'liquid-sand.jpg', category: 'statement', origin: 'original' },

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
