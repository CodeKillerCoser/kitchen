
export interface Ingredient {
  name: string;
  amount: string; 
}

export interface Recipe {
  id: string;
  name: string;
  tcmBenefit: string;
  tcmDrink: string;
  tcmTaboos: string; // Added: TCM contraindications
  calories: string;
  nutritionSummary: string; 
  prepTime: string;
  cookTime: string;
  difficulty: string;
  efficiencyTag: string;
  ingredients: Ingredient[];
  steps: string[]; 
  cuisineStyle: string;
}

export interface DailyMenu {
  day: string;
  lunch: Recipe;
  dinner: Recipe;
  preparationTip: string;
  weekendPrepOperations?: string[]; 
}

export interface ShoppingCategory {
  category: string;
  items: Ingredient[];
}

export interface WeeklyPlan {
  theme: string;
  philosophy: string;
  groceryList: ShoppingCategory[];
  menu: DailyMenu[];
}

export type TabType = 'planner' | 'favorites' | 'shopping' | 'about';
export type WeeklyFocus = 
  | 'tasty' 
  | 'brain_power' 
  | 'skin_beauty' 
  | 'digestive' 
  | 'stress_relief' 
  | 'post_workout' 
  | 'weight_loss' 
  | 'late_night'
  | 'tcm_authentic'
  | 'seasonal_health'
  | 'energy_boost'
  | 'family_friendly'
  | 'gut_health'
  | 'sleep_well'
  | 'eye_care'
  | 'auto';
