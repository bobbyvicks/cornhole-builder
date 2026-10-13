/* THE TEMPLATES. Each is a function of the page's element helpers, so a
   template is built from exactly what the page builds by hand. */
export function makeTemplates({ T, C, freshBoard }) {
  return [
    { id: 'team', label: 'Team', occasion: 'team', board: () => freshBoard({ base: { color: '#1f3a93' }, elements: [
      C('star', { color: '#f2b705', width: 8, y: 20 }),
      T('YOUR TEAM', { font: 'Anton', size: 4.5, y: 30 }),
      T('EST. 2026', { font: 'Oswald', size: 1.5, color: '#f2b705', y: 36, spacing: 0.25 }),
    ] }) },
    { id: 'wedding', label: 'Wedding', occasion: 'wedding', board: () => freshBoard({ base: { color: '#fffaf0' }, pattern: { kind: 'border', color: '#9caf88', size: 0.75 }, elements: [
      T('Mr & Mrs', { font: 'Great Vibes', size: 3.2, color: '#6e1423', y: 16 }),
      C('laurel', { color: '#9caf88', width: 16, y: 27.5 }),
      T('SMITH', { font: 'Cinzel', size: 2.5, color: '#36393b', y: 26.5, spacing: 0.2 }),
      T('June 14, 2026', { font: 'Cormorant Garamond', size: 1.4, color: '#36393b', y: 30.5 }),
      C('rings', { color: '#d8b25c', width: 4.5, y: 41 }),
    ] }) },
    { id: 'rustic', label: 'Rustic wedding', occasion: 'wedding', board: () => freshBoard({ base: { kind: 'wood', stain: 'natural' }, elements: [
      T('the', { font: 'Parisienne', size: 2.2, color: '#36393b', y: 18 }),
      T('Johnsons', { font: 'Dancing Script', size: 4.2, color: '#36393b', y: 24 }),
      C('heart', { color: '#6e1423', width: 3.5, y: 31 }),
      T('established', { font: 'Cinzel', size: 1, color: '#36393b', y: 36, spacing: 0.3 }),
      T('06 . 14 . 2026', { font: 'Cormorant Garamond', size: 1.8, color: '#36393b', y: 39.5 }),
    ] }) },
    { id: 'anniversary', label: 'Anniversary', occasion: 'anniversary', board: () => freshBoard({ base: { kind: 'gradient', color: '#0b1b3a', color2: '#5b2a86', angle: 160 }, elements: [
      C('infinity', { color: '#d8b25c', width: 9, y: 17 }),
      T('Mike & Dana', { font: 'Allura', size: 3.8, color: '#fffaf0', y: 26 }),
      T('25 YEARS', { font: 'Cinzel', size: 2.2, color: '#d8b25c', y: 33, spacing: 0.3 }),
      T('and still winning', { font: 'Cormorant Garamond', size: 1.5, color: '#fffaf0', y: 37.5 }),
    ] }) },
    { id: 'birthday', label: 'Birthday', occasion: 'birthday', board: () => freshBoard({ base: { kind: 'gradient', color: '#e75480', color2: '#f2b705', angle: 160 }, elements: [
      C('balloons', { color: '#ffffff', width: 9, y: 19 }),
      T('HAPPY', { font: 'Luckiest Guy', size: 3.2, color: '#ffffff', y: 29, outline: '#111111', outlineWidth: 0.08 }),
      T('40TH', { font: 'Luckiest Guy', size: 5.5, color: '#ffe44d', y: 35, outline: '#111111', outlineWidth: 0.1 }),
      T('Sarah', { font: 'Pacifico', size: 2.6, color: '#ffffff', y: 42 }),
    ] }) },
    { id: 'family', label: 'Family', occasion: 'family', board: () => freshBoard({ base: { color: '#1f4d2e' }, elements: [
      C('mountains', { color: '#f5f0e6', width: 20, y: 20 }),
      T('THE MILLERS', { font: 'Alfa Slab One', size: 2.9, color: '#f5f0e6', y: 32 }),
      T('EST. 2018', { font: 'Montserrat', size: 1.4, color: '#f5f0e6', y: 36.5, spacing: 0.35 }),
      C('pine', { color: '#f5f0e6', width: 3.5, x: 5, y: 44 }), C('pine', { color: '#f5f0e6', width: 3.5, x: 19, y: 44 }),
    ] }) },
    { id: 'patriotic', label: 'Stars and stripes', occasion: 'holiday', board: () => freshBoard({ base: { color: '#c8102e' }, pattern: { kind: 'stripes', color: '#ffffff', size: 2.4 }, elements: [
      C('rounded-square', { color: '#1f3a93', width: 18, y: 24 }),
      C('three-stars', { color: '#ffffff', width: 15, y: 20 }),
      T('USA', { font: 'Bungee', size: 4, color: '#ffffff', y: 29 }),
    ] }) },
    { id: 'business', label: 'Business', occasion: 'business', board: () => freshBoard({ base: { color: '#36393b' }, elements: [
      C('badge', { color: '#d8b25c', width: 10, y: 20 }),
      T('LOGO', { font: 'Bebas Neue', size: 2.4, color: '#36393b', y: 20 }),
      T('COMPANY NAME', { font: 'Montserrat', size: 2.2, color: '#ffffff', y: 31, spacing: 0.1 }),
      T('SINCE 1999', { font: 'Oswald', size: 1.3, color: '#d8b25c', y: 35, spacing: 0.3 }),
      T('www.yoursite.com', { font: 'Poppins', size: 1.1, color: '#ffffff', y: 45 }),
    ] }) },
    { id: 'beach', label: 'Lake and beach', occasion: 'other', board: () => freshBoard({ base: { kind: 'gradient', color: '#4fa3e3', color2: '#f5f0e6', angle: 180 }, elements: [
      C('sun', { color: '#f2b705', width: 9, y: 19 }),
      T('LAKE DAYS', { font: 'Righteous', size: 3.4, color: '#1f3a93', y: 32, arc: 25 }),
      T('Summer 2026', { font: 'Satisfy', size: 2.2, color: '#0f8b8d', y: 40 }),
    ] }) },
    { id: 'holiday', label: 'Holidays', occasion: 'holiday', board: () => freshBoard({ base: { color: '#6e1423' }, elements: [
      C('xmas-tree', { color: '#1f7a3a', width: 12, y: 20 }),
      T('Merry & Bright', { font: 'Lobster', size: 3, color: '#f5f0e6', y: 34 }),
      C('snowflake', { color: '#ffffff', width: 3, x: 5, y: 42 }), C('snowflake', { color: '#ffffff', width: 2.2, x: 19, y: 44 }), C('snowflake', { color: '#ffffff', width: 2.5, x: 20, y: 9 }),
    ] }) },
    { id: 'monogram', label: 'Monogram', occasion: 'wedding', board: () => freshBoard({ base: { color: '#fffaf0' }, elements: [
      C('oval-frame', { color: '#9caf88', width: 15, y: 25 }),
      T('J & M', { font: 'Cinzel', size: 3.6, color: '#36393b', y: 25 }),
      T('est. 2026', { font: 'Cormorant Garamond', size: 1.4, color: '#6e1423', y: 36, spacing: 0.15 }),
      C('leaf', { color: '#9caf88', width: 3, x: 6, y: 42, rotation: -30 }), C('leaf', { color: '#9caf88', width: 3, x: 18, y: 42, rotation: 30 }),
    ] }) },
    { id: 'engagement', label: 'Engagement', occasion: 'wedding', board: () => freshBoard({ base: { color: '#f4c2c2' }, elements: [
      C('diamond-ring', { color: '#ffffff', width: 9, y: 19 }),
      T('She said', { font: 'Sacramento', size: 3.8, color: '#6e1423', y: 30 }),
      T('YES!', { font: 'Playfair Display', size: 5, color: '#6e1423', y: 37 }),
      C('hearts', { color: '#ffffff', width: 4, y: 44 }),
    ] }) },
    { id: 'bachelorette', label: 'Bachelorette', occasion: 'wedding', board: () => freshBoard({ base: { kind: 'gradient', color: '#e75480', color2: '#5b2a86', angle: 160 }, elements: [
      C('champagne', { color: '#ffffff', width: 8, y: 18 }),
      T('LAST FLING', { font: 'Bebas Neue', size: 3.8, color: '#ffffff', y: 29, spacing: 0.2 }),
      T('before the ring', { font: 'Pacifico', size: 2, color: '#ffe44d', y: 35 }),
      T('Nashville 2026', { font: 'Montserrat', size: 1.3, color: '#ffffff', y: 42, spacing: 0.1 }),
    ] }) },
    { id: 'baby', label: 'Baby shower', occasion: 'other', board: () => freshBoard({ base: { color: '#c9b7dc' }, elements: [
      C('balloons', { color: '#ffffff', width: 8, y: 18 }),
      T('Oh Baby', { font: 'Pacifico', size: 4, color: '#ffffff', y: 30, shadow: true }),
      T('coming October 2026', { font: 'Poppins', size: 1.4, color: '#36393b', y: 36 }),
    ] }) },
    { id: 'graduation', label: 'Graduation', occasion: 'other', board: () => freshBoard({ base: { color: '#1f3a93' }, elements: [
      C('grad-cap', { color: '#f2b705', width: 11, y: 19 }),
      T('CLASS OF', { font: 'Oswald', size: 2.6, color: '#ffffff', y: 29, spacing: 0.3 }),
      T('2026', { font: 'Anton', size: 6, color: '#f2b705', y: 36 }),
      T('Jordan', { font: 'Satisfy', size: 2.4, color: '#ffffff', y: 43 }),
    ] }) },
    { id: 'tailgate', label: 'Tailgate', occasion: 'team', board: () => freshBoard({ base: { color: '#1f4d2e' }, pattern: { kind: 'dstripes', color: '#2e7d32', size: 1.5 }, elements: [
      C('football', { color: '#b87333', width: 11, y: 19 }),
      T('GAME DAY', { font: 'Black Ops One', size: 3.8, color: '#ffffff', y: 30 }),
      T('tailgate crew', { font: 'Permanent Marker', size: 2.2, color: '#ffe44d', y: 36 }),
    ] }) },
    { id: 'cabin', label: 'The cabin', occasion: 'family', board: () => freshBoard({ base: { kind: 'wood', stain: 'walnut' }, elements: [
      C('pine', { color: '#f5f0e6', width: 6, x: 6, y: 20 }), C('pine', { color: '#f5f0e6', width: 8, x: 12, y: 18 }), C('pine', { color: '#f5f0e6', width: 6, x: 18, y: 20 }),
      T('THE CABIN', { font: 'Rye', size: 3.2, color: '#f5f0e6', y: 31 }),
      T('EST. 2015', { font: 'Special Elite', size: 1.5, color: '#f5f0e6', y: 36 }),
    ] }) },
    { id: 'bbq', label: 'Backyard BBQ', occasion: 'family', board: () => freshBoard({ base: { color: '#36393b' }, elements: [
      C('flame', { color: '#f26b1d', width: 10, y: 19 }),
      T('BACKYARD', { font: 'Alfa Slab One', size: 2.8, color: '#ffffff', y: 29.5 }),
      T('BBQ', { font: 'Bungee', size: 5.5, color: '#f26b1d', y: 36 }),
      T('low & slow since 2010', { font: 'Courgette', size: 1.6, color: '#ffffff', y: 43 }),
    ] }) },
    { id: 'brewery', label: 'Brewery', occasion: 'business', board: () => freshBoard({ base: { color: '#d4a017' }, elements: [
      C('beer', { color: '#36393b', width: 10, y: 19 }),
      T('CRAFT', { font: 'Bebas Neue', size: 4, color: '#36393b', y: 29.5, spacing: 0.3 }),
      T('BEER CO.', { font: 'Bebas Neue', size: 4, color: '#36393b', y: 34, spacing: 0.3 }),
      T('cold ones since 2020', { font: 'Special Elite', size: 1.4, color: '#36393b', y: 41 }),
    ] }) },
    { id: 'halloween', label: 'Halloween', occasion: 'holiday', board: () => freshBoard({ base: { color: '#111111' }, elements: [
      C('pumpkin', { color: '#f26b1d', width: 11, y: 19 }),
      T('SPOOKY', { font: 'Bangers', size: 4.2, color: '#f26b1d', y: 30 }),
      T('SEASON', { font: 'Bangers', size: 4.2, color: '#7ac943', y: 35 }),
      C('ghost', { color: '#ffffff', width: 4.5, x: 5, y: 42 }), C('ghost', { color: '#ffffff', width: 3.5, x: 19, y: 43, flipH: true }),
    ] }) },
    { id: 'winter', label: 'Winter', occasion: 'holiday', board: () => freshBoard({ base: { color: '#8fa9c4' }, elements: [
      C('snowman', { color: '#ffffff', width: 10, y: 20 }),
      T('Let it Snow', { font: 'Lobster', size: 3.4, color: '#ffffff', y: 33, shadow: true }),
      C('snowflake', { color: '#ffffff', width: 3, x: 4, y: 10 }), C('snowflake', { color: '#ffffff', width: 2.5, x: 20, y: 42 }),
    ] }) },
    { id: 'camping', label: 'Camping', occasion: 'family', board: () => freshBoard({ base: { color: '#1f4d2e' }, elements: [
      C('tent', { color: '#f5f0e6', width: 12, y: 19 }),
      T('HAPPY CAMPERS', { font: 'Fredoka', size: 2.8, color: '#f5f0e6', y: 31 }),
      C('campfire', { color: '#f26b1d', width: 5, y: 40 }),
    ] }) },
    { id: 'golf', label: 'Golf', occasion: 'other', board: () => freshBoard({ base: { color: '#2e7d32' }, elements: [
      C('golf-flag', { color: '#ffffff', width: 10, y: 19 }),
      T('THE 19TH HOLE', { font: 'Playfair Display', size: 2.6, color: '#ffffff', y: 31 }),
      T('drinks on the loser', { font: 'Courgette', size: 1.7, color: '#ffe44d', y: 36 }),
    ] }) },
    { id: 'nautical', label: 'Nautical', occasion: 'other', board: () => freshBoard({ base: { color: '#fffaf0' }, pattern: { kind: 'stripes', color: '#0b1b3a', size: 2 }, elements: [
      C('circle', { color: '#fffaf0', width: 18, y: 24 }),
      C('anchor', { color: '#0b1b3a', width: 9, y: 20 }),
      T('AHOY', { font: 'Cinzel', size: 2.8, color: '#0b1b3a', y: 30.5, spacing: 0.2 }),
    ] }) },
    { id: 'baseball', label: 'Baseball', occasion: 'team', board: () => freshBoard({ base: { color: '#c8102e' }, elements: [
      C('bat-ball', { color: '#ffffff', width: 11, y: 19 }),
      T('HOME RUN', { font: 'Luckiest Guy', size: 3.6, color: '#ffffff', y: 31, outline: '#111111', outlineWidth: 0.08 }),
      T('Little League 2026', { font: 'Oswald', size: 1.5, color: '#ffffff', y: 37, spacing: 0.2 }),
    ] }) },
    { id: 'garden', label: 'Sunflower', occasion: 'family', board: () => freshBoard({ base: { color: '#f5f0e6' }, elements: [
      C('sunflower', { color: '#f2b705', width: 12, y: 19 }),
      T('The Garcias', { font: 'Dancing Script', size: 4, color: '#1f4d2e', y: 32 }),
      T('bloom where you are planted', { font: 'Courgette', size: 1.3, color: '#1f4d2e', y: 38 }),
    ] }) },
  ];
}
