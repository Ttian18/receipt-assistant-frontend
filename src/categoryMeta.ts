import {
  Utensils,
  Bus,
  ShoppingBag,
  Plane,
  Clapperboard,
  HeartPulse,
  Briefcase,
  type LucideIcon,
} from 'lucide-react';
import type { Category } from './types';

export interface CategoryMetaEntry {
  color: string;
  glyph: LucideIcon;
}

export const CATEGORY_META: Record<Category, CategoryMetaEntry> = {
  'Food & Drinks': { color: '#FF8A3D', glyph: Utensils },
  'Transportation': { color: '#3D8BFD', glyph: Bus },
  'Shopping': { color: '#6E6E73', glyph: ShoppingBag },
  'Travel': { color: '#34C759', glyph: Plane },
  'Entertainment': { color: '#FF4D8F', glyph: Clapperboard },
  'Health': { color: '#FF453A', glyph: HeartPulse },
  'Services': { color: '#AF52DE', glyph: Briefcase },
};
