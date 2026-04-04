import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Product = {
  id: string;
  asin: string;
  name: string;
  main_category: string;
  sub_category: string;
  created_at: string;
};

export type BSRHistory = {
  id: string;
  product_id: string;
  main_rank: number;
  sub_rank: number;
  recorded_at: string;
};

export type Alert = {
  id: string;
  product_id: string;
  asin: string;
  product_name: string;
  rank_before: number;
  rank_after: number;
  variation_pct: number;
  direction: 'up' | 'down';
  insight: string;
  created_at: string;
};
