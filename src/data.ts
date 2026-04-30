// data.ts
export interface Product {
  id: number;
  name: string;
  type: string;
  fullType: string;
  price: string;
  priceNum: string | number;
  rating: number;
  description: string;
  designer: string;
  articleNumber: string;
  emoji: string;
  thumbEmojis: string[];
  dims: { w: number; h: number; d: number };
  imageUrl?: string;
  
  // 👇 ADD THESE (all optional – won't break existing code)
  category?: string;
  onSale?: boolean;
  isNew?: boolean;
  salePercent?: number;
  originalPrice?: number;
  reviewCount?: number;
  colors?: string[];
  materials?: string[];
  ikeaId?: string;
  ikeaUrl?: string;
}

export const PRODUCTS: Product[] = [
  {
    id: 1,
    name: 'Skruvsta',
    type: 'Swivel chair',
    fullType: 'Swivel chair, Vissle grey',
    price: '$229',
    priceNum: '229',
    rating: 4.6,
    description:
      'You sit comfortably since the chair is adjustable in height. The swivel function lets you move freely and reach what you need without getting up.',
    designer: 'Nike Karlsson',
    articleNumber: 'BC100001',
    emoji: '🪑',
    thumbEmojis: ['🪑', '🔘', '📐', '🖼'],
    dims: { w: 68, h: 93, d: 68 },
  },
  {
    id: 2,
    name: 'Fröset',
    type: 'Armchair',
    fullType: 'Armchair, Rattan brown',
    price: '$159',
    priceNum: '159',
    rating: 4.4,
    description:
      'The rounded shape and the rattan material make the armchair feel warm and welcoming. Easy to move around thanks to the light weight.',
    designer: 'Maja Ganszyniec',
    articleNumber: 'BC200002',
    emoji: '🛋',
    thumbEmojis: ['🛋', '🔘', '📐', '🖼'],
    dims: { w: 64, h: 78, d: 72 },
  },
  {
    id: 3,
    name: 'Poäng',
    type: 'Rocking chair',
    fullType: 'Rocking chair, Gunnared light green',
    price: '$299',
    priceNum: '299',
    rating: 4.8,
    description:
      'POÄNG rocking chair has stylish curved lines in bent-wood and is gentle on your back, providing nice support for the neck. The rocking feel adds an extra dimension to the comfort, allowing you to fully relax.',
    designer: 'James C. Hawk',
    articleNumber: 'BC773001',
    emoji: '🪑',
    thumbEmojis: ['🪑', '🌿', '📐', '🖼'],
    dims: { w: 68, h: 100, d: 82 },
  },
  {
    id: 4,
    name: 'Vedbo',
    type: 'Armchair high',
    fullType: 'High-back armchair, Gunnared beige',
    price: '$349',
    priceNum: '349',
    rating: 4.5,
    description:
      'The high back gives you excellent neck and head support. Generous seat depth makes it easy to find a comfortable sitting position.',
    designer: 'Ola Wihlborg',
    articleNumber: 'BC440003',
    emoji: '🪑',
    thumbEmojis: ['🪑', '🔘', '📐', '🖼'],
    dims: { w: 72, h: 110, d: 80 },
  },
  {
    id: 5,
    name: 'Vedbo',
    type: 'Armchair',
    fullType: 'Armchair, Gunnared beige',
    price: '$189',
    priceNum: '189',
    rating: 4.3,
    description:
      'A compact and comfortable armchair with a generous seat depth. A great fit for smaller spaces.',
    designer: 'Ola Wihlborg',
    articleNumber: 'BC440004',
    emoji: '🛋',
    thumbEmojis: ['🛋', '🔘', '📐', '🖼'],
    dims: { w: 67, h: 85, d: 75 },
  },
  {
    id: 6,
    name: 'Poäng',
    type: 'Armchair',
    fullType: 'Armchair, Knisa light beige',
    price: '$169',
    priceNum: '169',
    rating: 4.7,
    description:
      'A timeless classic combining form and function. The bent-wood frame gives a light, springy comfort.',
    designer: 'James C. Hawk',
    articleNumber: 'BC773002',
    emoji: '🪑',
    thumbEmojis: ['🪑', '🌿', '📐', '🖼'],
    dims: { w: 68, h: 100, d: 82 },
  },
  {
    id: 7,
    name: 'Fullösa',
    type: 'Armchair',
    fullType: 'Armchair, Kabusa light beige',
    price: '$599',
    priceNum: '599',
    rating: 4.9,
    description:
      'A luxurious and spacious lounge chair with a wide seat. Made for those who want to fully sink in and relax.',
    designer: 'Nike Karlsson',
    articleNumber: 'BC990001',
    emoji: '🛋',
    thumbEmojis: ['🛋', '🔘', '📐', '🖼'],
    dims: { w: 90, h: 95, d: 88 },
  },
];
