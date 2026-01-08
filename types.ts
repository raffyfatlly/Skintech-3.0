
export interface SkinMetrics {
  overallScore: number; // 0-100 (Higher is Better)
  skinAge?: number; 
  
  // Group 1: Breakout
  acneActive: number; // Higher = Clearer
  blackheads: number; // Higher = Clearer
  acneMarks: number;  // Higher = Clearer (PIH/PIE)
  
  // Group 2: Tone
  darkSpots: number;  // Higher = Clearer (Sun/Melasma)
  redness: number;    // Higher = Calm
  darkCircles: number;// Higher = Bright
  
  // Group 3: Texture (Group Name)
  pores: number;      // Higher = Refined/Invisible
  oiliness: number;   // Higher = Balanced (Not greasy)
  hydration: number;  // Higher = Plump/Hydrated
  scars: number;      // Higher = Smooth/No Scars (Pitted)
  skinTags: number;   // Higher = Clear/No Tags
  
  // Group 4: Aging
  wrinkles: number;   // Higher = Smooth/No Lines
  firmness: number;   // Higher = Lifted/Tight
  
  // Analysis
  analysisSummary?: string | { 
      headline: string; 
      generalCondition?: string; 
      points: { subtitle: string; content: string }[] 
  }; 
  observations?: Record<string, string>;
  timestamp: number;
}

export enum SkinType {
  OILY = 'OILY',
  DRY = 'DRY',
  COMBINATION = 'COMBINATION',
  SENSITIVE = 'SENSITIVE',
  NORMAL = 'NORMAL',
  UNKNOWN = 'UNKNOWN'
}

export interface UserPreferences {
  goals: string[];
  sensitivity: 'NOT_SENSITIVE' | 'MILD' | 'VERY_SENSITIVE';
  complexity: 'SIMPLE' | 'MODERATE' | 'ADVANCED';
  sunscreenFrequency: 'DAILY' | 'SUNNY' | 'RARELY';
  lifestyle: string[];
  buyingPriority: string;
  isPregnant?: boolean;
  hasEczema?: boolean;
  onMedication?: boolean;
}

export interface UsageStats {
  buyingAssistantViews: number;
  manualScans: number;
  routineGenerations: number;
  simulatorViews?: number;
}

export interface UserProfile {
  name: string;
  age: number;
  skinType: SkinType;
  hasScannedFace: boolean;
  biometrics: SkinMetrics;
  scanHistory?: SkinMetrics[];
  faceImage?: string | null;
  simulatedSkinImage?: string | null;
  simulatedSkinPlan?: any;
  isAnonymous?: boolean;
  preferences?: UserPreferences;
  isPremium?: boolean;
  usage?: UsageStats;
  wishlist?: Product[];
  lastUpdated?: number;
}

export interface IngredientRisk {
  ingredient: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  reason: string;
}

export interface Benefit {
  ingredient: string;
  target: keyof SkinMetrics;
  description: string;
  relevance: 'HIGH' | 'MAINTENANCE';
}

export interface Product {
  id: string;
  name: string;
  brand?: string;
  ingredients: string[];
  dateScanned: number;
  risks: IngredientRisk[];
  benefits: Benefit[];
  suitabilityScore: number;
  estimatedPrice?: number;
  type: 'CLEANSER' | 'TONER' | 'SERUM' | 'MOISTURIZER' | 'SPF' | 'TREATMENT' | 
        'FOUNDATION' | 'CONCEALER' | 'POWDER' | 'PRIMER' | 'SETTING_SPRAY' | 'BLUSH' | 'BRONZER' | 'UNKNOWN';
  sources?: string[];
  usageTips?: string;
  expertReview?: string;
}

export interface RecommendedProduct {
    name: string;
    brand: string;
    price: string;
    reason: string;
    rating: number;
    tier?: string;
}

export interface ShelfConflict {
  productA: string;
  productB: string;
  conflictReason: string;
  severity: 'CAUTION' | 'DANGER';
}

export interface ShelfAuditReport {
    timestamp: number;
    flags: {
        productId: string;
        productName: string;
        productType: string;
        issue: string;
        severity: 'CRITICAL' | 'CAUTION';
        advice: 'PAUSE' | 'LIMIT' | 'MONITOR' | 'LESS_FREQ' | 'BUFFER' | 'RESUME';
        smartUsage: string;
    }[];
}

export enum AppView {
  LANDING = 'LANDING',
  ONBOARDING = 'ONBOARDING',
  DASHBOARD = 'DASHBOARD',
  FACE_SCANNER = 'FACE_SCANNER',
  PRODUCT_SCANNER = 'PRODUCT_SCANNER',
  PRODUCT_SEARCH = 'PRODUCT_SEARCH',
  SMART_SHELF = 'SMART_SHELF',
  PROFILE_SETUP = 'PROFILE_SETUP',
  BUYING_ASSISTANT = 'BUYING_ASSISTANT',
  ROUTINE_BUILDER = 'ROUTINE_BUILDER', 
  SKIN_SIMULATOR = 'SKIN_SIMULATOR',
  AI_ASSISTANT = 'AI_ASSISTANT'
}