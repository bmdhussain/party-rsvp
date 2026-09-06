const TEMPLATES = [
  { id: 'celebration', label: 'Celebration', file: 'celebration.png', category: 'gathering', sourceName: 'FreeSVG.org · Public Domain', sourceUrl: 'https://freesvg.org/neocreo-invitation' },
  { id: 'birthday', label: 'Birthday', file: 'birthday.png', category: 'celebration', sourceName: 'FreeSVG.org · Public Domain', sourceUrl: 'https://freesvg.org/bday-card' },
  { id: 'wedding', label: 'Wedding', file: 'wedding.png', category: 'celebration', sourceName: 'FreeSVG.org · Public Domain', sourceUrl: 'https://freesvg.org/wedding-flyer-vector-illustration' },
  { id: 'baby-shower', label: 'Baby Shower', file: 'baby-shower.png', category: 'gathering', sourceName: 'FreeSVG.org · Public Domain', sourceUrl: 'https://freesvg.org/cartoon-illustration-of-a-baby' },
  { id: 'anniversary', label: 'Anniversary', file: 'anniversary.png', category: 'celebration', sourceName: 'FreeSVG.org · Public Domain', sourceUrl: 'https://freesvg.org/anniversary-cake' },
  { id: 'graduation', label: 'Graduation', file: 'graduation.png', category: 'celebration', sourceName: 'FreeSVG.org · Public Domain', sourceUrl: 'https://freesvg.org/graduation-frame' },
  { id: 'retirement', label: 'Retirement', file: 'retirement.png', category: 'statement', sourceName: 'FreeSVG.org · Public Domain', sourceUrl: 'https://freesvg.org/party-poster' },
  { id: 'housewarming', label: 'Housewarming', file: 'housewarming.png', category: 'gathering', sourceName: 'FreeSVG.org · Public Domain', sourceUrl: 'https://freesvg.org/house-vector' },
  { id: 'engagement', label: 'Engagement', file: 'engagement.png', category: 'celebration', sourceName: 'FreeSVG.org · Public Domain', sourceUrl: 'https://freesvg.org/cupid-ring-frame-vector-drawing' },
  { id: 'holiday-new-year', label: 'Holiday / New Year', file: 'holiday-new-year.png', category: 'statement', sourceName: 'FreeSVG.org · Public Domain', sourceUrl: 'https://freesvg.org/merry-christmas-and-happy-new-year-greeting-card-vector-image' },
  { id: 'corporate', label: 'Corporate', file: 'corporate.png', category: 'statement', sourceName: 'FreeSVG.org · Public Domain', sourceUrl: 'https://freesvg.org/business-card-svg-template' },
  { id: 'quinceanera', label: 'Quinceañera', file: 'quinceanera.png', category: 'celebration', sourceName: 'FreeSVG.org · Public Domain', sourceUrl: 'https://freesvg.org/easter-lilies-frame-vector-illustration' },
  { id: 'sunlit-gathering', label: 'Sunlit Gathering', file: 'sunlit-gathering.png', category: 'gathering', sourceName: 'FreeSVG.org · Public Domain', sourceUrl: 'https://freesvg.org/invitation-frame' },
  { id: 'citrus-disco', label: 'Citrus Disco', file: 'citrus-disco.png', category: 'celebration', sourceName: 'FreeSVG.org · Public Domain', sourceUrl: 'https://freesvg.org/party-confetti' },

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
