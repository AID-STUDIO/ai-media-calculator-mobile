
import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { createPortal } from 'react-dom';
import * as htmlToImage from 'html-to-image';


// --- TYPES ---
type CalculationMode = 'cost' | 'duration';
type HighlightId = string | null;

interface Option {
  modelId: string; // Official ID if available
  modelName: string;
  maxDurationSec: number;
  resolution: '720p' | '1080p' | '1080p+' | '4K';
  audio: boolean;
  costUnit: 'credits' | 'tokens' | 'compute_seconds' | 'clips' | 'per_second' | 'ratio';
  cost: number | [number, number];
  features?: ('Motion Brush' | 'Keyframe Editor' | 'Storyboard Export' | 'Audio-Video Sync')[];
}

interface Plan {
  planName: string; // Official plan name e.g., "Pro", "API Basic"
  monthlyCost: number; // in USD
  quota: number; // Number of units (credits, tokens, etc.) included
  quotaUnit: 'credits' | 'tokens' | 'compute_seconds' | 'clips' | 'unlimited';
  maxParallel: number; // GUI-based parallel jobs
  maxParallelAPI?: number; // API-based parallel jobs
  avgTimePerClipMin: number;
  overageCost?: { perUnit: number; unit: string; };
  options: Option[];
}

interface Platform {
  platformName: string;
  apiAvailable: 'Yes' | 'No' | 'Limited' | 'Enterprise';
  rateLimit?: string; // e.g., "5 req/min"
  setupDays: number;
  techLevel: 'beginner' | 'intermediate' | 'expert';
  plans: Plan[];
}

interface RecommendationInputs {
  calcMode: CalculationMode;
  deadline: number;
  duration: number;
  budget: number;
  costQuality: number;
  speedCost: number;
  audioNeeds: 'none' | 'basic' | 'advanced';
  expertise: 'beginner' | 'intermediate' | 'expert';
  enableComparison: boolean;
  traditionalCost: number;
  traditionalTime: number;
}

interface ScoredPlatform {
  platformName: string;
  planName: string;
  option: Option;
  score: number;
  totalCost: number;
  rawGenerationTimeDays: number;
  costPerSecondUSD: number;
  qualityScore: number;
  feasible: boolean;
  reasons: string[];
  accountsNeeded: number;
  apiAvailable: Platform['apiAvailable'];
  achievableDuration: number;
  // Fields for detailed breakdown card
  plansAffordable?: number;
  monthlyCost?: number;
}


// --- CONSTANTS ---
const HIGHLIGHT_IDS = {
    CALC_MODE: 'calc-mode',
    DEADLINE: 'deadline',
    DURATION: 'duration',
    BUDGET: 'budget',
    COST_QUALITY: 'cost-quality',
    SPEED_COST: 'speed-cost',
    AUDIO: 'audio',
    EXPERTISE: 'expertise',
    ROI: 'roi',
    TOTAL_COST: 'total-cost',
    RAW_GENERATION_TIME: 'raw-generation-time',
    COST_PER_SEC: 'cost-per-sec',
    QUALITY_SCORE: 'quality-score',
    ACCOUNTS_NEEDED: 'accounts-needed',
    PARALLEL: 'parallel',
    API: 'api',
    PLAN_COST: 'plan-cost'
};


const DETAILED_PLATFORM_DATA: Platform[] = [
    {
    platformName: "Kling AI",
    apiAvailable: "Limited",
    rateLimit: "N/A",
    setupDays: 0.5,
    techLevel: 'beginner',
    plans: [
      {
        planName: "Standard", monthlyCost: 10, quota: 660, quotaUnit: "credits",
        maxParallel: 8, avgTimePerClipMin: 1.5,
        options: [
          { modelId: 'kling-std-5s', modelName: "Standard 5s", maxDurationSec: 5, resolution: "1080p", audio: false, costUnit: "credits", cost: 10, features: ['Motion Brush'] },
          { modelId: 'kling-std-10s', modelName: "Standard 10s", maxDurationSec: 10, resolution: "1080p", audio: false, costUnit: "credits", cost: 20, features: ['Motion Brush'] },
        ]
      },
      {
        planName: "Pro", monthlyCost: 37, quota: 3000, quotaUnit: "credits",
        maxParallel: 8, avgTimePerClipMin: 1.2,
        options: [
          { modelId: 'kling-pro-5s', modelName: "Professional (High-Quality) 5s", maxDurationSec: 5, resolution: "1080p+", audio: true, costUnit: "credits", cost: 35, features: ['Motion Brush', 'Keyframe Editor'] },
          { modelId: 'kling-pro-10s', modelName: "Professional (High-Quality) 10s", maxDurationSec: 10, resolution: "1080p+", audio: true, costUnit: "credits", cost: 70, features: ['Motion Brush', 'Keyframe Editor'] }
        ]
      },
       {
        planName: "Premier", monthlyCost: 92, quota: 8000, quotaUnit: "credits",
        maxParallel: 8, avgTimePerClipMin: 1.0,
        options: [
          { modelId: 'kling-prm-5s', modelName: "Professional (High-Quality) 5s", maxDurationSec: 5, resolution: "1080p+", audio: true, costUnit: "credits", cost: 35, features: ['Motion Brush', 'Keyframe Editor'] },
          { modelId: 'kling-prm-10s', modelName: "Professional (High-Quality) 10s", maxDurationSec: 10, resolution: "1080p+", audio: true, costUnit: "credits", cost: 70, features: ['Motion Brush', 'Keyframe Editor'] }
        ]
      },
    ]
  },
  {
    platformName: "Leonardo AI (Web App)",
    apiAvailable: "No",
    rateLimit: "Daily token limit",
    setupDays: 0.5,
    techLevel: 'beginner',
    plans: [
        {
            planName: "Apprentice", monthlyCost: 10, quota: 8500, quotaUnit: 'tokens',
            maxParallel: 5, avgTimePerClipMin: 1.5,
            options: [
                { modelId: 'leo-web-m1-a', modelName: "Motion 1.0", maxDurationSec: 3, resolution: "720p", audio: false, costUnit: "tokens", cost: 45 },
                { modelId: 'leo-web-m2-a', modelName: "Motion 2.0", maxDurationSec: 5, resolution: "1080p", audio: false, costUnit: "tokens", cost: 200 },
            ]
        },
        {
            planName: "Artisan Unlimited", monthlyCost: 24, quota: 25500, quotaUnit: 'tokens',
            maxParallel: 5, avgTimePerClipMin: 1.2,
            options: [
                { modelId: 'leo-web-m1-art', modelName: "Motion 1.0", maxDurationSec: 3, resolution: "720p", audio: false, costUnit: "tokens", cost: 45 },
                { modelId: 'leo-web-m2-art', modelName: "Motion 2.0", maxDurationSec: 5, resolution: "1080p", audio: false, costUnit: "tokens", cost: 200 },
            ]
        },
        {
            planName: "Maestro Unlimited", monthlyCost: 48, quota: 60000, quotaUnit: 'tokens',
            maxParallel: 5, avgTimePerClipMin: 1.0,
            options: [
                { modelId: 'leo-web-m1-m', modelName: "Motion 1.0", maxDurationSec: 3, resolution: "720p", audio: false, costUnit: "tokens", cost: 45 },
                { modelId: 'leo-web-m2-m', modelName: "Motion 2.0", maxDurationSec: 5, resolution: "1080p", audio: false, costUnit: "tokens", cost: 200 },
            ]
        }
    ]
  },
  {
    platformName: "Leonardo AI (API)",
    apiAvailable: "Yes",
    rateLimit: "Varies by plan",
    setupDays: 0.5,
    techLevel: 'expert',
    plans: [
       {
        planName: "API Basic", monthlyCost: 9, quota: 3500, quotaUnit: "tokens",
        maxParallel: 5, maxParallelAPI: 5, avgTimePerClipMin: 1.5,
        options: [
          { modelId: 'leo-api-motion-1-b', modelName: "Motion 1.0", maxDurationSec: 3, resolution: "720p", audio: false, costUnit: "tokens", cost: 45 },
          { modelId: 'leo-api-motion-2-b', modelName: "Motion 2.0", maxDurationSec: 5, resolution: "1080p", audio: false, costUnit: "tokens", cost: 200 },
        ]
      },
      {
        planName: "API Standard", monthlyCost: 49, quota: 25000, quotaUnit: "tokens",
        maxParallel: 5, maxParallelAPI: 10, avgTimePerClipMin: 1.2,
        options: [
            { modelId: 'leo-api-motion-1-s', modelName: "Motion 1.0", maxDurationSec: 3, resolution: "720p", audio: false, costUnit: "tokens", cost: 45 },
            { modelId: 'leo-api-motion-2-s', modelName: "Motion 2.0", maxDurationSec: 5, resolution: "1080p", audio: false, costUnit: "tokens", cost: 200 },
            { modelId: 'veo-3-leo-std', modelName: "Veo 3 (via API)", maxDurationSec: 8, resolution: "720p", audio: false, costUnit: "tokens", cost: 2500 }
        ]
      },
      {
        planName: "API Pro", monthlyCost: 299, quota: 100000, quotaUnit: "tokens",
        maxParallel: 5, maxParallelAPI: 20, avgTimePerClipMin: 1.0,
        options: [
            { modelId: 'leo-api-motion-1-p', modelName: "Motion 1.0", maxDurationSec: 3, resolution: "720p", audio: false, costUnit: "tokens", cost: 45 },
            { modelId: 'leo-api-motion-2-p', modelName: "Motion 2.0", maxDurationSec: 5, resolution: "1080p", audio: false, costUnit: "tokens", cost: 200 },
            { modelId: 'veo-3-leo-pro', modelName: "Veo 3 (via API)", maxDurationSec: 8, resolution: "720p", audio: false, costUnit: "tokens", cost: 2500 }
        ]
      },
    ]
  },
  {
    platformName: "LTX Studio",
    apiAvailable: "Enterprise",
    rateLimit: "N/A",
    setupDays: 1,
    techLevel: 'intermediate',
    plans: [
        { planName: "Lite (Monthly)", monthlyCost: 15, quota: 8640, quotaUnit: "compute_seconds", maxParallel: 1, avgTimePerClipMin: 4, options: [ { modelId: 'ltx-lite-m', modelName: "Motion Standard", maxDurationSec: 15, resolution: "1080p+", audio: true, costUnit: "ratio", cost: 1 } ] },
        { planName: "Lite (Annual)", monthlyCost: 12, quota: 8640, quotaUnit: "compute_seconds", maxParallel: 1, avgTimePerClipMin: 4, options: [ { modelId: 'ltx-lite-y', modelName: "Motion Standard", maxDurationSec: 15, resolution: "1080p+", audio: true, costUnit: "ratio", cost: 1 } ] },
        { planName: "Standard (Monthly)", monthlyCost: 35, quota: 28800, quotaUnit: "compute_seconds", maxParallel: 1, avgTimePerClipMin: 3.8, options: [ { modelId: 'ltx-std-m', modelName: "Motion Standard (Veo 2)", maxDurationSec: 15, resolution: "1080p+", audio: true, costUnit: "ratio", cost: 1 } ] },
        { planName: "Standard (Annual)", monthlyCost: 28, quota: 28800, quotaUnit: "compute_seconds", maxParallel: 1, avgTimePerClipMin: 3.8, options: [ { modelId: 'ltx-std-y', modelName: "Motion Standard (Veo 2)", maxDurationSec: 15, resolution: "1080p+", audio: true, costUnit: "ratio", cost: 1 } ] },
        { planName: "Pro (Monthly)", monthlyCost: 125, quota: 90000, quotaUnit: "compute_seconds", maxParallel: 10, avgTimePerClipMin: 3, options: [ { modelId: 'ltx-pro-m', modelName: "Pipeline Full (Veo 3)", maxDurationSec: 15, resolution: "1080p+", audio: true, costUnit: "ratio", cost: 1.5, features: ['Storyboard Export'] } ] },
        { planName: "Pro (Annual)", monthlyCost: 100, quota: 90000, quotaUnit: "compute_seconds", maxParallel: 10, avgTimePerClipMin: 3, options: [ { modelId: 'ltx-pro-y', modelName: "Pipeline Full (Veo 3)", maxDurationSec: 15, resolution: "1080p+", audio: true, costUnit: "ratio", cost: 1.5, features: ['Storyboard Export'] } ] },
        { planName: "Enterprise", monthlyCost: 500, quota: 500000, quotaUnit: "compute_seconds", maxParallel: 20, avgTimePerClipMin: 2.5, options: [ { modelId: 'ltx-ent', modelName: "Pipeline Full (Veo 3)", maxDurationSec: 15, resolution: "4K", audio: true, costUnit: "ratio", cost: 2, features: ['Storyboard Export'] } ] }
    ]
  },
  {
    platformName: "OpenAI Sora",
    apiAvailable: "Limited",
    rateLimit: "N/A",
    setupDays: 0.5,
    techLevel: 'beginner',
    plans: [
      {
        planName: "Plus", monthlyCost: 20, quota: 0, quotaUnit: "unlimited",
        maxParallel: 2, avgTimePerClipMin: 1.5,
        options: [
          { modelId: 'sora-plus-10', modelName: "Standard 10s", maxDurationSec: 10, resolution: "720p", audio: false, costUnit: "clips", cost: 0 }
        ]
      },
      {
        planName: "Pro", monthlyCost: 200, quota: 0, quotaUnit: "unlimited",
        maxParallel: 5, maxParallelAPI: 5, avgTimePerClipMin: 0.8,
        options: [
          { modelId: 'sora-pro-20', modelName: "Enhanced Quality 20s", maxDurationSec: 20, resolution: "1080p", audio: false, costUnit: "clips", cost: 0 }
        ]
      }
    ]
  },
  {
    platformName: "Google Veo",
    apiAvailable: "Yes",
    rateLimit: "10 req/min, 20 concurrent",
    setupDays: 1,
    techLevel: 'expert',
    plans: [
      {
        planName: "Ultra Subscription", monthlyCost: 250, quota: 12500, quotaUnit: "credits",
        maxParallel: 5, avgTimePerClipMin: 0.8,
        options: [
          { modelId: 'veo-ultra-fast', modelName: "Veo 3 Fast", maxDurationSec: 8, resolution: "1080p", audio: true, costUnit: "credits", cost: 20, features: ['Audio-Video Sync'] },
          { modelId: 'veo-ultra-qual', modelName: "Veo 3 Quality", maxDurationSec: 8, resolution: "1080p", audio: true, costUnit: "credits", cost: 100, features: ['Audio-Video Sync'] },
        ]
      },
      {
        planName: "Vertex AI API", monthlyCost: 0, quota: 0, quotaUnit: "unlimited",
        maxParallel: 1, maxParallelAPI: 20, avgTimePerClipMin: 1.8,
        options: [
          { modelId: 'veo-api-2.0', modelName: "Veo 2.0 GA", maxDurationSec: 8, resolution: "720p", audio: false, costUnit: "per_second", cost: 0.50 },
          { modelId: 'veo-api-3.0', modelName: "Veo 3.0 Preview", maxDurationSec: 8, resolution: "720p", audio: false, costUnit: "per_second", cost: 0.50 },
          { modelId: 'veo-api-3.0-audio', modelName: "Veo 3.0 with Audio", maxDurationSec: 8, resolution: "720p", audio: true, costUnit: "per_second", cost: 0.75, features: ['Audio-Video Sync'] },
        ]
      }
    ]
  }
];


// --- HOOKS & COMPONENTS ---

const useMediaQuery = (query) => {
    const [matches, setMatches] = useState(false);
    useEffect(() => {
        const media = window.matchMedia(query);
        const updateMatches = () => {
            if (media.matches !== matches) {
                setMatches(media.matches);
            }
        };
        updateMatches();
        media.addEventListener('change', updateMatches);
        return () => media.removeEventListener('change', updateMatches);
    }, [query]);
    return matches;
};


const useRecommendation = (inputs: RecommendationInputs) => {
    const [primaryRecommendation, setPrimaryRecommendation] = useState<ScoredPlatform | null>(null);
    const [sortedPlatforms, setSortedPlatforms] = useState<ScoredPlatform[]>([]);

    const getQualityScore = (option: Option, plan: Plan, platform: Platform) => {
        let score = 0;
        const resolutionScores = { '720p': 7, '1080p': 8, '1080p+': 9, '4K': 10 };
        score += resolutionScores[option.resolution] || 6;

        if (option.audio) score += 0.5;
        
        const planHierarchy = { "Personal": 0, "Lite (Annual)": 0, "Lite (Monthly)": 0, "Plus": 0, "Apprentice": 0, "Standard (Annual)": 0.5, "Standard (Monthly)": 0.5, "Artisan Unlimited": 0.5, "API Basic": 0.5, "Pro (Annual)": 1, "Pro (Monthly)": 1, "Maestro Unlimited": 1, "API Standard": 1, "Premier": 1.5, "Team": 1.5, "API Pro": 1.5, "Vertex AI API": 2, "Ultra Subscription": 2, "Enterprise": 2};
        score += planHierarchy[plan.planName] || 0;

        if (option.features?.includes('Storyboard Export')) score += 1;
        if (option.features?.includes('Keyframe Editor')) score += 0.5;
        if (option.features?.includes('Audio-Video Sync')) score += 1;

        const platformReputation = { "Google Veo": 1.5, "OpenAI Sora": 1, "LTX Studio": 0.5, "Leonardo AI (API)": 0, "Leonardo AI (Web App)": 0, "Kling AI": -0.5 };
        score += platformReputation[platform.platformName] || 0;
        
        return Math.min(10, score);
    };

    const getAverage = (value: number | [number, number]) => {
        return Array.isArray(value) ? (value[0] + value[1]) / 2 : value;
    };

    const calculateTimeRequirement = (durationMinutes: number, option: Option, plan: Plan, platform: Platform, deadline: number, expertise: RecommendationInputs['expertise']) => {
        if (durationMinutes <= 0) return { timeDays: 0, accountsNeeded: 1 };

        const clipsNeeded = Math.ceil(durationMinutes * 60 / option.maxDurationSec);
        
        const canUseAPI = (platform.apiAvailable === 'Yes' || platform.apiAvailable === 'Limited' || platform.apiAvailable === 'Enterprise') && (expertise === 'expert' || expertise === 'intermediate');
        const effectiveMaxParallel = canUseAPI && plan.maxParallelAPI ? plan.maxParallelAPI : plan.maxParallel;
        
        const totalWorkloadMinutes = clipsNeeded * plan.avgTimePerClipMin;
        const totalWorkloadHours = totalWorkloadMinutes / 60;
        
        const singleAccountTimeHours = totalWorkloadHours / effectiveMaxParallel; 
        
        const singleAccountTimeDays = (singleAccountTimeHours / 8) + platform.setupDays; 
        
        let accountsNeeded = 1;
        if (singleAccountTimeDays > deadline) {
            accountsNeeded = Math.ceil(singleAccountTimeDays / deadline);
        }
        
        const actualTimeDays = singleAccountTimeDays / accountsNeeded;
        
        return {
            timeDays: actualTimeDays,
            accountsNeeded
        };
    };

    const calculateCostPerSecondUSD = (option: Option, plan: Plan): number => {
        const avgCostPerUnit = getAverage(option.cost);
        const durationSeconds = option.maxDurationSec;

        if (option.costUnit === 'per_second') {
            return avgCostPerUnit;
        }

        if (plan.quotaUnit === 'unlimited' || plan.quota === 0) return Infinity;
        
        const costPerUnitUSD = plan.monthlyCost / plan.quota;

        switch (option.costUnit) {
            case 'credits':
            case 'tokens':
            case 'clips':
                return (avgCostPerUnit * costPerUnitUSD) / durationSeconds;
            case 'ratio':
                const computeSecondsPerVideoSecond = avgCostPerUnit;
                return computeSecondsPerVideoSecond * costPerUnitUSD;
            default: return Infinity;
        }
    };

    const calculate = useCallback(() => {
        const { calcMode, deadline, duration, budget, costQuality, speedCost, audioNeeds, expertise, enableComparison, traditionalCost, traditionalTime } = inputs;
        const scoredOptions: ScoredPlatform[] = [];

        for (const platform of DETAILED_PLATFORM_DATA) {
            for (const plan of platform.plans) {
                for (const option of plan.options) {
                    
                    const qualityScore = getQualityScore(option, plan, platform);
                    const costPerSecondUSD = calculateCostPerSecondUSD(option, plan);
                    
                    let score = 0;
                    const reasons: string[] = [];
                    let result: Partial<ScoredPlatform> & { plansAffordable?: number } = { achievableDuration: 0, totalCost: 0, rawGenerationTimeDays: 0, accountsNeeded: 1 };
                    
                    if (calcMode === 'cost') {
                        result.achievableDuration = duration;
                        const clipsNeeded = Math.ceil(duration * 60 / option.maxDurationSec);

                        if (plan.quotaUnit === 'unlimited') {
                            if (option.costUnit === 'per_second') { // Pay-per-use model like Veo
                                result.totalCost = duration * 60 * getAverage(option.cost);
                            } else { // Flat-fee unlimited model like Sora
                                result.totalCost = plan.monthlyCost;
                            }
                        } else { // Quota-based plans
                             if (plan.quota > 0) {
                                let totalUnitsNeeded = 0;
                                if(option.costUnit === 'ratio') {
                                    totalUnitsNeeded = (duration * 60) * getAverage(option.cost);
                                } else {
                                    totalUnitsNeeded = clipsNeeded * getAverage(option.cost);
                                }
                                const plansNeeded = Math.ceil(totalUnitsNeeded / plan.quota);
                                result.totalCost = plansNeeded * plan.monthlyCost;
                            } else {
                                result.totalCost = Infinity;
                            }
                        }
                        
                        const timeReq = calculateTimeRequirement(duration, option, plan, platform, deadline, expertise);
                        result.rawGenerationTimeDays = timeReq.timeDays;
                        result.accountsNeeded = timeReq.accountsNeeded;

                        if (timeReq.timeDays > deadline) reasons.push(`Requires ${timeReq.accountsNeeded} accounts`);
                        if (result.totalCost > budget) reasons.push('Over budget');

                    } else { // calcMode === 'duration'
                        result.totalCost = budget;
                        let totalVideoSeconds = 0;

                        if (plan.quotaUnit === 'unlimited') {
                            if (option.costUnit === 'per_second') { // Pay-per-use
                                if(budget > 0 && getAverage(option.cost) > 0) {
                                    totalVideoSeconds = budget / getAverage(option.cost);
                                    result.totalCost = budget;
                                }
                            } else { // Flat-fee unlimited
                                 if(budget >= plan.monthlyCost) {
                                     totalVideoSeconds = Infinity; // Theoretical max
                                     result.totalCost = plan.monthlyCost;
                                 } else {
                                     totalVideoSeconds = 0;
                                 }
                            }
                        } else { // Quota-based
                            if (plan.monthlyCost > 0) {
                                const plansAffordable = Math.floor(budget / plan.monthlyCost);
                                if (plansAffordable > 0) {
                                    result.plansAffordable = plansAffordable;
                                    result.totalCost = plansAffordable * plan.monthlyCost;
                                    const totalQuota = plansAffordable * plan.quota;
                                    const costPerClip = getAverage(option.cost);
                                    if(costPerClip > 0) {
                                        if (option.costUnit === 'ratio') {
                                            totalVideoSeconds = totalQuota / costPerClip;
                                        } else {
                                            totalVideoSeconds = (totalQuota / costPerClip) * option.maxDurationSec;
                                        }
                                    }
                                }
                            }
                        }
                        
                        const canUseAPI = (platform.apiAvailable === 'Yes' || platform.apiAvailable === 'Limited' || platform.apiAvailable === 'Enterprise') && (expertise === 'expert' || expertise === 'intermediate');
                        const effectiveMaxParallel = canUseAPI && plan.maxParallelAPI ? plan.maxParallelAPI : plan.maxParallel;
                        const maxClipsInDeadline = (deadline * 8 * 60) / plan.avgTimePerClipMin * effectiveMaxParallel;
                        const maxDurationFromTime = (maxClipsInDeadline * option.maxDurationSec) / 60;
                        result.achievableDuration = Math.min(totalVideoSeconds / 60, maxDurationFromTime);

                        const timeReq = calculateTimeRequirement(result.achievableDuration, option, plan, platform, deadline, expertise);
                        result.rawGenerationTimeDays = timeReq.timeDays;
                        result.accountsNeeded = timeReq.accountsNeeded;
                        if (timeReq.timeDays > deadline && result.achievableDuration > 0) {
                            reasons.push(`Challenging deadline: needs ${timeReq.accountsNeeded} accounts`);
                        }
                    }
                    
                    result.feasible = (reasons.length === 0) || (reasons.length === 1 && reasons[0].includes('accounts'));

                    if(result.feasible) score += 50;
                    if(result.accountsNeeded > 1 && result.feasible) score -= result.accountsNeeded * 2; 

                    const expertiseMatch = {
                        'beginner': { 'beginner': 20, 'intermediate': 5, 'expert': -10 },
                        'intermediate': { 'beginner': 10, 'intermediate': 20, 'expert': 10 },
                        'expert': { 'beginner': -5, 'intermediate': 10, 'expert': 20 }
                    };
                    score += expertiseMatch[expertise][platform.techLevel] || 0;

                    if (audioNeeds === 'advanced') score += option.audio ? 15 : -25;
                    else if(audioNeeds === 'basic') score += option.audio ? 5 : -5;
                    
                    const effectiveMaxParallel = (platform.apiAvailable === 'Yes' && expertise !== 'beginner' && plan.maxParallelAPI) ? plan.maxParallelAPI : plan.maxParallel;
                    score += (effectiveMaxParallel * 0.5) * (speedCost / 100);
                    
                    const qualityWeight = costQuality / 100;
                    const costScore = costPerSecondUSD > 0 && costPerSecondUSD !== Infinity ? Math.max(0, 1 - (costPerSecondUSD / 5)) * 15 : 15;
                    score += costScore * (1-qualityWeight) + (qualityScore / 10 * 15) * qualityWeight;
                    
                    if(calcMode === 'duration' && result.achievableDuration > 0) {
                        score += Math.min(20, result.achievableDuration / 2);
                    }

                    scoredOptions.push({
                        platformName: platform.platformName,
                        planName: plan.planName,
                        option: option,
                        score,
                        totalCost: result.totalCost,
                        rawGenerationTimeDays: result.rawGenerationTimeDays,
                        costPerSecondUSD,
                        qualityScore,
                        feasible: result.feasible,
                        reasons,
                        accountsNeeded: result.accountsNeeded,
                        apiAvailable: platform.apiAvailable,
                        achievableDuration: result.achievableDuration,
                        plansAffordable: result.plansAffordable,
                        monthlyCost: plan.monthlyCost,
                    });
                }
            }
        }
        
        scoredOptions.sort((a, b) => {
             if (a.feasible !== b.feasible) return a.feasible ? -1 : 1;
             return b.score - a.score;
        });

        setSortedPlatforms(scoredOptions);
        setPrimaryRecommendation(scoredOptions.find(p => p.feasible) || scoredOptions[0] || null);
    }, [inputs]);

    useEffect(() => {
        calculate();
    }, [calculate]);

    return { primaryRecommendation, sortedPlatforms };
};

const Portal = ({ children }) => {
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);
    return mounted ? createPortal(children, document.body) : null;
};


const HighlightWrapper = ({ children, highlightId, activeHighlightId }: { children?: React.ReactNode; highlightId: HighlightId; activeHighlightId: HighlightId; }) => {
    const isHighlighted = highlightId && highlightId === activeHighlightId;
    return React.createElement('div', {
        className: `transition-all duration-300 ${isHighlighted ? 'ring-2 ring-violet-500/80 ring-offset-2 ring-offset-slate-100 rounded-md shadow-lg' : ''}`
    }, children);
};

const DownloadIcon = () => React.createElement('svg', { xmlns: "http://www.w3.org/2000/svg", width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement('path', { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }),
    React.createElement('polyline', { points: "7 10 12 15 17 10" }),
    React.createElement('line', { x1: "12", y1: "15", x2: "12", y2: "3" })
);

const InfoTooltip = ({ content, highlightId = null, onHighlight = (_id: HighlightId) => {} }) => {
    const [isOpen, setIsOpen] = useState(false);
    const triggerRef = useRef(null);
    const [position, setPosition] = useState({ top: 0, left: 0 });

    const handleOpen = (e) => {
        e.stopPropagation();
        if (!triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        setPosition({
            top: rect.top + window.scrollY - 8,
            left: rect.left + window.scrollX + rect.width / 2,
        });
        setIsOpen(true);
        if (highlightId) {
            onHighlight(highlightId);
        }
    };

    const handleClose = useCallback(() => {
        setIsOpen(false);
        onHighlight(null);
    }, [onHighlight]);

    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (event) => {
            if (triggerRef.current && triggerRef.current.contains(event.target)) return;
            handleClose();
        };
        const handleEscapeKey = (event) => { if (event.key === 'Escape') handleClose(); };

        document.addEventListener('mousedown', handleClickOutside);
        window.addEventListener('scroll', handleClose, true);
        document.addEventListener('keydown', handleEscapeKey);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('scroll', handleClose, true);
            document.removeEventListener('keydown', handleEscapeKey);
        };
    }, [isOpen, handleClose]);

    if (!content) return null;

    return React.createElement(
        'div',
        { className: "relative inline-block ml-1.5 align-middle" },
        React.createElement(
            'button',
            {
                ref: triggerRef,
                type: 'button',
                onClick: (e) => { e.stopPropagation(); isOpen ? handleClose() : handleOpen(e); },
                className: "cursor-help text-blue-400 hover:text-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-full",
                'aria-label': 'More information',
            },
            React.createElement('svg', { xmlns: "http://www.w3.org/2000/svg", width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" },
                React.createElement('circle', { cx: "12", cy: "12", r: "10" }),
                React.createElement('path', { d: "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" }),
                React.createElement('line', { x1: "12", y1: "17", x2: "12.01", y2: "17" })
            )
        ),
        isOpen && createPortal(
            React.createElement(
                'div',
                {
                    role: "tooltip",
                    style: {
                        position: 'absolute',
                        top: `${position.top}px`,
                        left: `${position.left}px`,
                        transform: 'translate(-50%, -100%)',
                    },
                    className: "w-72 bg-slate-800 text-white text-sm rounded-lg p-3 shadow-lg z-50 transition-opacity duration-300 animate-fade-in-up"
                },
                content,
                 React.createElement('div', { className: "absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-slate-800" })
            ),
            document.body
        ),
        React.createElement('style', null, `@keyframes fade-in-up { 0% { opacity: 0; transform: translate(-50%, -90%); } 100% { opacity: 1; transform: translate(-50%, -100%); } } .animate-fade-in-up { animation: fade-in-up 0.2s ease-out; }`)
    );
};


const CollapsibleSection = ({ title, icon, badgeText, defaultOpen = false, children, exportFileName = null, tooltip, highlightId, activeHighlightId, onHighlight }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const exportRef = useRef(null);
  
  const handleExport = useCallback(async (e) => {
    e.stopPropagation();
    if (!exportRef.current || !isOpen) return;
    try {
        const dataUrl = await htmlToImage.toPng(exportRef.current, { quality: 1, backgroundColor: '#ffffff', pixelRatio: 2 });
        const link = document.createElement('a');
        link.download = `${exportFileName || 'export'}.png`;
        link.href = dataUrl;
        link.click();
    } catch (error) { console.error('Export failed:', error); }
  }, [isOpen, exportFileName]);

  return React.createElement(
    'div',
    { className: "bg-white rounded-xl shadow-sm border border-slate-200/80 mb-5" },
    React.createElement(
        'div',
        { className: "w-full text-left bg-gradient-to-r from-blue-900 to-blue-600 text-white p-5 pl-16 font-semibold text-lg relative flex justify-between items-center cursor-pointer", onClick: () => setIsOpen(!isOpen) },
        React.createElement('span', { className: "absolute left-5 top-1/2 -translate-y-1/2 text-2xl opacity-90" }, icon),
        React.createElement(HighlightWrapper, { highlightId, activeHighlightId },
          React.createElement(
            'div', { className: "flex-grow flex items-center" },
            title,
            React.createElement('span', { className: "ml-3 inline-block bg-white/20 backdrop-blur-sm text-white text-xs font-medium px-3 py-1 rounded-full" }, badgeText),
            React.createElement(InfoTooltip, { content: tooltip, highlightId, onHighlight })
          )
        ),
        exportFileName && React.createElement('button', { onClick: handleExport, title: `Export ${title} as PNG`, className: "text-white p-2 rounded-full hover:bg-white/20 transition-colors flex-shrink-0 mx-4" }, React.createElement(DownloadIcon, null)),
        React.createElement('button', { className: `text-2xl transform transition-transform duration-500 ${isOpen ? 'rotate-180' : 'rotate-0'}` }, '▼')
      
    ),
    React.createElement('div', { className: `transition-all duration-500 ease-in-out grid ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}` },
      React.createElement('div', { ref: exportRef, className: "overflow-hidden" },
        React.createElement('div', { className: "p-4 sm:p-6 md:p-8" }, children)
      )
    )
  );
};


const InputField = ({ label, id, type, value, onChange, min, max, displayValue, disabled = false, tooltip = null, highlightId, activeHighlightId, onHighlight }) => (
    React.createElement('div', { className: `mb-6 ${disabled ? 'opacity-50' : ''}` },
      React.createElement(HighlightWrapper, { highlightId, activeHighlightId },
        React.createElement('div', { className: "flex items-center mb-2" },
            React.createElement('label', { htmlFor: id, className: "block text-blue-900 font-semibold" }, label),
            React.createElement(InfoTooltip, { content: tooltip, highlightId, onHighlight })
        ),
        React.createElement('input', { id, name: id, type, value, onChange, min, max, disabled, className: "w-full px-4 py-2 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition disabled:bg-slate-100" }),
        displayValue && React.createElement('div', { className: "text-center text-sm text-slate-600 bg-slate-100 py-1.5 px-3 mt-2 rounded-md font-medium" }, displayValue)
      )
    )
);

const SliderField = ({ label, id, value, onChange, labels, displayValue, tooltip = null, highlightId, activeHighlightId, onHighlight }) => (
    React.createElement('div', { className: "mb-6" },
      React.createElement(HighlightWrapper, { highlightId, activeHighlightId },
        React.createElement('div', { className: "flex items-center mb-2" },
            React.createElement('label', { htmlFor: id, className: "block text-blue-900 font-semibold" }, label),
             React.createElement(InfoTooltip, { content: tooltip, highlightId, onHighlight })
        ),
        React.createElement('input', { id, name: id, type: "range", value, onChange, min: "0", max: "100", className: "w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" }),
        React.createElement('div', { className: "flex justify-between text-xs text-slate-500 mt-1" }, labels.map(l => React.createElement('span', {key: l}, l))),
        React.createElement('div', { className: "text-center text-sm text-slate-600 bg-slate-100 py-1.5 px-3 mt-2 rounded-md font-medium" }, displayValue)
      )
    )
);

const SelectField = ({ label, id, value, onChange, options, tooltip = null, highlightId, activeHighlightId, onHighlight }) => (
    React.createElement('div', { className: "mb-6" },
      React.createElement(HighlightWrapper, { highlightId, activeHighlightId },
        React.createElement('div', { className: "flex items-center mb-2" },
            React.createElement('label', { htmlFor: id, className: "block text-blue-900 font-semibold" }, label),
             React.createElement(InfoTooltip, { content: tooltip, highlightId, onHighlight })
        ),
        React.createElement('select', { id, name: id, value, onChange, className: "w-full px-4 py-2 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white" },
            options.map(opt => React.createElement('option', { key: opt.value, value: opt.value }, opt.label))
        )
      )
    )
);

const PrimaryRecommendation = ({ platform, inputs, activeHighlightId, onHighlight }: { platform: ScoredPlatform | null, inputs: RecommendationInputs, activeHighlightId: HighlightId, onHighlight: (id: HighlightId) => void }) => {
    if (!platform) {
        return React.createElement('div', { className: "bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-500 rounded-xl p-5 text-center" },
            React.createElement('div', { className: "text-lg font-bold text-blue-900" }, "Calculating..."),
        );
    }
    
    if (!platform.feasible) {
         return React.createElement('div', { className: "bg-gradient-to-br from-red-50 to-red-100 border-2 border-red-500 rounded-xl p-5 text-center" },
            React.createElement('div', { className: "text-lg font-bold text-red-900" }, "Constraints Too Tight"),
            React.createElement('div', { className: "text-3xl font-bold text-red-600 my-2" }, "Adjust Parameters"),
            React.createElement('div', { className: "text-sm text-red-800" }, `Consider ${inputs.calcMode === 'cost' ? 'extending deadline or increasing budget' : 'increasing budget or extending deadline'}`)
        );
    }
    
    const isCostMode = inputs.calcMode === 'cost';
    const showBreakdown = !isCostMode && platform.accountsNeeded > 1 && platform.plansAffordable && platform.monthlyCost;

    const BreakdownDetail = ({label, value, tooltipText, highlightId}) => (
        React.createElement(HighlightWrapper, {highlightId, activeHighlightId},
            React.createElement('div', {className: "flex justify-between items-center text-sm py-1.5 border-b border-blue-200/50"},
                React.createElement('span', {className: 'text-blue-800 font-medium flex items-center'},
                    label,
                    React.createElement(InfoTooltip, {content: tooltipText, highlightId, onHighlight})
                ),
                React.createElement('span', {className: 'font-bold text-blue-900'}, value)
            )
        )
    );

    if (showBreakdown) {
         return React.createElement('div', { className: "bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-500 rounded-xl p-5" },
            React.createElement('div', { className: "text-xs font-semibold text-blue-600 uppercase tracking-wider" }, platform.platformName),
            React.createElement('div', { className: "text-xl font-bold text-blue-900 mb-3" }, `${platform.planName} - ${platform.option.modelName}`),
            React.createElement(BreakdownDetail, { label: "Budget", value: `$${inputs.budget.toLocaleString()}`, tooltipText: "Your total available budget.", highlightId: HIGHLIGHT_IDS.BUDGET }),
            React.createElement(BreakdownDetail, { label: "Plan Cost", value: `$${platform.monthlyCost.toLocaleString()}/mo`, tooltipText: "The cost of a single subscription for this plan.", highlightId: HIGHLIGHT_IDS.PLAN_COST }),
            React.createElement(BreakdownDetail, { label: "Subscriptions Purchased", value: platform.plansAffordable.toLocaleString(), tooltipText: "The number of monthly subscriptions that can be purchased within your budget.", highlightId: HIGHLIGHT_IDS.PLAN_COST }),
            React.createElement(BreakdownDetail, { label: "Total Potential Content", value: `${Math.round(platform.achievableDuration).toLocaleString()} min`, tooltipText: "The theoretical maximum amount of video you can generate with the purchased subscriptions, before considering time constraints.", highlightId: HIGHLIGHT_IDS.DURATION }),
            React.createElement(HighlightWrapper, { highlightId: HIGHLIGHT_IDS.ACCOUNTS_NEEDED, activeHighlightId },
                React.createElement('div', {className: 'mt-4 p-3 bg-red-100 border border-red-300 rounded-lg text-center'},
                    React.createElement('div', {className: 'font-bold text-red-800 text-lg flex items-center justify-center'}, `⚠️ ${platform.accountsNeeded} Accounts Needed`, React.createElement(InfoTooltip, {content: "This is the number of parallel accounts/users required to produce the content within your deadline. It indicates a potential operational bottleneck.", highlightId: HIGHLIGHT_IDS.ACCOUNTS_NEEDED, onHighlight})),
                    React.createElement('p', {className: 'text-sm text-red-700'}, `To produce this content within your ${inputs.deadline}-day deadline, parallel work across this many accounts is required.`)
                )
            )
        );
    }
    
    return React.createElement('div', { className: "bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-500 rounded-xl p-5" },
        React.createElement('div', { className: "text-xs font-semibold text-blue-600 uppercase tracking-wider" }, platform.platformName),
        React.createElement('div', { className: "text-xl font-bold text-blue-900" }, `${platform.planName} - ${platform.option.modelName}`),
        React.createElement(HighlightWrapper, { highlightId: isCostMode ? HIGHLIGHT_IDS.TOTAL_COST : HIGHLIGHT_IDS.DURATION, activeHighlightId },
            React.createElement('div', { className: "text-4xl font-bold text-amber-500 my-2" }, isCostMode ? `$${Math.round(platform.totalCost).toLocaleString()}` : `${Math.round(platform.achievableDuration).toLocaleString()} min`)
        ),
        React.createElement('p', { className: "text-sm text-blue-800 font-medium" }, isCostMode ? `Best match for your project` : `Max content for $${inputs.budget.toLocaleString()}` )
    );
};

const MetricCard = ({label, value, highlightId, activeHighlightId, onHighlight, tooltip }) => (
    React.createElement(HighlightWrapper, { highlightId, activeHighlightId },
      React.createElement('div', { className: "bg-slate-100 rounded-lg p-3 text-center" },
          React.createElement('div', { className: "text-xl sm:text-2xl font-bold text-blue-700" }, value),
          React.createElement('div', { className: "text-xs sm:text-sm text-slate-600 mt-1 flex items-center justify-center" }, label, React.createElement(InfoTooltip, {content: tooltip, highlightId, onHighlight}))
      )
    )
);

const ProjectMetrics = ({ platform, inputs, activeHighlightId, onHighlight }: { platform: ScoredPlatform | null, inputs: RecommendationInputs, activeHighlightId: HighlightId, onHighlight: (id: HighlightId) => void }) => {
    const isCostMode = inputs.calcMode === 'cost';
    
    const timeTooltipContent = React.createElement('div', {className: 'text-left text-xs leading-relaxed'},
        React.createElement('p', {className: 'mb-2'}, "An estimate of the pure machine time required to generate all clips in an ideal, non-stop scenario."),
        React.createElement('p', {className: 'font-bold'}, "Includes:"),
        React.createElement('ul', {className: 'list-disc list-inside pl-1 mb-2'},
            React.createElement('li', null, "Platform's processing speed."),
            React.createElement('li', null, "Parallel work capabilities (via GUI or API).")
        ),
        React.createElement('p', {className: 'font-bold'}, "Excludes:"),
        React.createElement('ul', {className: 'list-disc list-inside pl-1 mb-3'},
            React.createElement('li', null, "Human labor (QA, reviews, project management)."),
            React.createElement('li', null, "Editing, revisions, and assembly time.")
        ),
        React.createElement('hr', {className: 'border-slate-600 my-2'}),
        React.createElement('p', {className: 'italic'}, "*Use this to compare the raw processing speed of different platforms.")
    );

    const metrics = [
        { label: isCostMode ? "Total Cost" : "Budget Spent", value: platform && platform.feasible ? `$${Math.round(platform.totalCost).toLocaleString()}` : '$--', highlightId: HIGHLIGHT_IDS.TOTAL_COST, tooltip: "The final estimated cost for the recommended solution, including all necessary subscriptions." },
        { label: "Raw Generation Time (days)", value: platform && platform.feasible ? `${Math.round(platform.rawGenerationTimeDays * 10) / 10}` : '--', highlightId: HIGHLIGHT_IDS.RAW_GENERATION_TIME, tooltip: timeTooltipContent },
        { label: isCostMode ? "Cost per Video Second" : "Achievable Duration", value: platform && platform.feasible ? (isCostMode ? `$${platform.costPerSecondUSD.toFixed(2)}/s` : `${Math.round(platform.achievableDuration)} min`) : (isCostMode ? '$--/s' : '-- min'), highlightId: isCostMode ? HIGHLIGHT_IDS.COST_PER_SEC : HIGHLIGHT_IDS.DURATION, tooltip: isCostMode ? "The normalized cost to produce one second of video with this option. A key metric for comparing cost-efficiency." : "The total minutes of video content you can generate with your budget using this option." },
        { label: "Quality Score", value: platform && platform.feasible ? `${platform.qualityScore.toFixed(1)}/10` : '--/10', highlightId: HIGHLIGHT_IDS.QUALITY_SCORE, tooltip: "An objective score based on resolution, features, and plan tier. Higher is better." },
    ];
    
    return React.createElement('div', { className: "grid grid-cols-2 md:grid-cols-4 gap-4 mt-5" },
       metrics.map(metric => React.createElement(MetricCard, { key: metric.label, ...metric, activeHighlightId, onHighlight }))
    );
};


const ROIAnalysisSummary = ({ platform, inputs }) => {
    if (!platform || !platform.feasible) return null;

    const SavingsCard = ({ title, value, colorClass }) => (
        React.createElement('div', {className: "text-center"},
            React.createElement('p', {className: 'text-xs text-slate-500 uppercase font-semibold'}, title),
            React.createElement('p', {className: `text-2xl font-bold ${colorClass}`}, `${Math.round(value)}%`)
        )
    );

    const costDifference = inputs.traditionalCost - platform.totalCost;
    const timeDifference = inputs.traditionalTime - platform.rawGenerationTimeDays;

    let costCard, timeCard;

    if (costDifference >= 0) {
        const costSavings = inputs.traditionalCost > 0 ? (costDifference / inputs.traditionalCost) * 100 : 0;
        costCard = React.createElement(SavingsCard, {title: "Cost Savings", value: costSavings, colorClass: "text-emerald-600"});
    } else {
        const costIncrease = inputs.traditionalCost > 0 ? (Math.abs(costDifference) / inputs.traditionalCost) * 100 : Infinity;
        costCard = React.createElement(SavingsCard, {title: "Cost Increase", value: costIncrease, colorClass: "text-red-600"});
    }

    if (timeDifference >= 0) {
        const timeSavings = inputs.traditionalTime > 0 ? (timeDifference / inputs.traditionalTime) * 100 : 0;
        timeCard = React.createElement(SavingsCard, {title: "Time Savings", value: timeSavings, colorClass: "text-blue-600"});
    } else {
        const timeIncrease = inputs.traditionalTime > 0 ? (Math.abs(timeDifference) / inputs.traditionalTime) * 100 : Infinity;
        timeCard = React.createElement(SavingsCard, {title: "Time Increase", value: timeIncrease, colorClass: "text-orange-600"});
    }

    return React.createElement('div', {className: "mt-6 p-4 bg-slate-50 border-2 border-slate-200 rounded-lg"},
        React.createElement('h4', {className: "text-sm font-bold text-blue-900 mb-3 text-center"}, "ROI Analysis Summary"),
        React.createElement('div', {className: "grid grid-cols-2 divide-x divide-slate-200"},
            React.createElement('div', {className: 'pr-4'},
                React.createElement('p', {className: 'font-semibold text-slate-700 text-center text-sm mb-2'}, 'Traditional'),
                React.createElement('p', {className: 'text-center text-lg'}, `$${inputs.traditionalCost.toLocaleString()}`),
                React.createElement('p', {className: 'text-center text-xs text-slate-500'}, `${inputs.traditionalTime} days`)
            ),
             React.createElement('div', {className: 'pl-4'},
                React.createElement('p', {className: 'font-semibold text-slate-700 text-center text-sm mb-2'}, 'AI Recommended'),
                React.createElement('p', {className: 'text-center text-lg text-emerald-600 font-bold'}, `$${Math.round(platform.totalCost).toLocaleString()}`),
                React.createElement('p', {className: 'text-center text-xs text-slate-500'}, `${Math.round(platform.rawGenerationTimeDays * 10) / 10} days`)
            )
        ),
        React.createElement('div', {className: 'grid grid-cols-2 mt-4 pt-4 border-t border-slate-200'},
            costCard,
            timeCard
        )
    );
};

const ResultsTableRow = ({ platform, rank, calcMode, activeHighlightId, onHighlight }: { platform: ScoredPlatform, rank: number, calcMode: CalculationMode, activeHighlightId: HighlightId, onHighlight: (id: HighlightId) => void }) => {
    const rankColors = { 1: 'bg-emerald-100 text-emerald-800', 2: 'bg-blue-100 text-blue-800', 3: 'bg-amber-100 text-amber-800' };
    const isCostMode = calcMode === 'cost';

    const operationalFactorsContent = platform.accountsNeeded > 1 
        ? React.createElement(HighlightWrapper, {highlightId: HIGHLIGHT_IDS.ACCOUNTS_NEEDED, activeHighlightId},
             React.createElement('span', {className: 'text-orange-600 font-semibold flex items-center'},
                `${platform.accountsNeeded} accounts needed`,
                React.createElement(InfoTooltip, {content: `Requires ${platform.accountsNeeded} parallel accounts to meet deadline due to processing limits.`, highlightId: HIGHLIGHT_IDS.ACCOUNTS_NEEDED, onHighlight})
            )) 
        : (platform.feasible ? React.createElement('span', {className: "text-slate-400"}, "N/A") : null);

    const suitabilityText = platform.feasible 
        ? (platform.accountsNeeded > 1 ? React.createElement(Tag, {text: "Challenging", color: 'blue'}) : React.createElement(Tag, {text: "Suitable", color: 'green'}))
        : React.createElement(HighlightWrapper, {highlightId: HIGHLIGHT_IDS.DEADLINE, activeHighlightId}, React.createElement('span', { className: 'text-red-600 font-semibold' }, platform.reasons.join(', ')));

    return React.createElement('tr', null,
        React.createElement('td', { 'data-label': 'Rank', className: "p-3 text-center" }, React.createElement('span', { className: `inline-block px-2.5 py-1 rounded-full font-bold text-xs ${rankColors[rank] || 'bg-slate-100 text-slate-800'}` }, `#${rank}`)),
        React.createElement('td', { 'data-label': 'Platform / Plan / Model', className: "p-3 font-semibold text-slate-800" }, `${platform.platformName} - ${platform.planName} - ${platform.option.modelName}`),
        calcMode === 'cost' && React.createElement('td', { 'data-label': 'Total Cost', className: "p-3 font-bold" }, React.createElement(HighlightWrapper, { highlightId: HIGHLIGHT_IDS.TOTAL_COST, activeHighlightId}, `$${Math.round(platform.totalCost).toLocaleString()}`)),
        calcMode === 'duration' && React.createElement('td', { 'data-label': 'Achievable Duration', className: "p-3 font-bold" }, React.createElement(HighlightWrapper, { highlightId: HIGHLIGHT_IDS.DURATION, activeHighlightId}, `${Math.round(platform.achievableDuration)} min`)),
        React.createElement('td', { 'data-label': 'Raw Generation Time (days)', className: "p-3" }, React.createElement(HighlightWrapper, { highlightId: HIGHLIGHT_IDS.RAW_GENERATION_TIME, activeHighlightId }, `${Math.round(platform.rawGenerationTimeDays * 10) / 10} days`)),
        isCostMode && React.createElement('td', { 'data-label': 'Cost/Sec (USD)', className: "p-3" }, React.createElement(HighlightWrapper, { highlightId: HIGHLIGHT_IDS.COST_PER_SEC, activeHighlightId }, `$${platform.costPerSecondUSD.toFixed(2)}`)),
        React.createElement('td', { 'data-label': 'Quality', className: "p-3" }, React.createElement(HighlightWrapper, { highlightId: HIGHLIGHT_IDS.QUALITY_SCORE, activeHighlightId }, `${platform.qualityScore.toFixed(1)}/10`)),
        React.createElement('td', { 'data-label': 'Suitability', className: "p-3" }, suitabilityText),
        React.createElement('td', { 'data-label': 'Operational Factors', className: "p-3 text-xs" }, operationalFactorsContent )
    );
};

const ResultsTable = ({ platforms, calcMode, activeHighlightId, onHighlight }: { platforms: ScoredPlatform[], calcMode: CalculationMode, activeHighlightId: HighlightId, onHighlight: (id: HighlightId) => void }) => {
    const isCostMode = calcMode === 'cost';
    const timeTooltipContent = React.createElement('div', {className: 'text-left text-xs leading-relaxed'},
        React.createElement('p', {className: 'mb-2'}, "An estimate of the pure machine time required to generate all clips in an ideal, non-stop scenario."),
        React.createElement('p', {className: 'font-bold'}, "Includes:"),
        React.createElement('ul', {className: 'list-disc list-inside pl-1 mb-2'},
            React.createElement('li', null, "Platform's processing speed."),
            React.createElement('li', null, "Parallel work capabilities (via GUI or API).")
        ),
        React.createElement('p', {className: 'font-bold'}, "Excludes:"),
        React.createElement('ul', {className: 'list-disc list-inside pl-1 mb-3'},
            React.createElement('li', null, "Human labor (QA, reviews, project management)."),
            React.createElement('li', null, "Editing, revisions, and assembly time.")
        ),
        React.createElement('hr', {className: 'border-slate-600 my-2'}),
        React.createElement('p', {className: 'italic'}, "*Use this to compare the raw processing speed of different platforms.")
    );
    
    const headers = [
        {title: "Rank", tooltip: "Overall ranking based on your selected priorities."},
        {title: "Platform / Plan / Model", tooltip: "The specific combination of platform, subscription plan, and generation model."},
        ...(isCostMode ? [{title: "Total Cost", tooltip: "The final estimated cost for the project.", highlightId: HIGHLIGHT_IDS.TOTAL_COST}] : [{title: "Achievable Duration", tooltip: "The maximum minutes of video you can generate.", highlightId: HIGHLIGHT_IDS.DURATION }]),
        {title: "Raw Generation Time (days)", tooltip: timeTooltipContent, highlightId: HIGHLIGHT_IDS.RAW_GENERATION_TIME},
        ...(isCostMode ? [{title: "Cost/Sec (USD)", tooltip: "Normalized cost per second of generated video.", highlightId: HIGHLIGHT_IDS.COST_PER_SEC}] : []),
        {title: "Quality", tooltip: "Objective score based on resolution, features, etc.", highlightId: HIGHLIGHT_IDS.QUALITY_SCORE},
        {title: "Suitability", tooltip: "Indicates if the option is feasible within your constraints."},
        {title: "Operational Factors", tooltip: "Highlights operational factors like the need for multiple accounts.", highlightId: HIGHLIGHT_IDS.ACCOUNTS_NEEDED},
    ];
    return React.createElement('div', { className: "overflow-x-auto" },
        React.createElement('table', { className: "w-full text-sm responsive-table" },
            React.createElement(TableHeader, { headers, onHighlight, activeHighlightId }),
            React.createElement('tbody', { className: 'bg-white' }, platforms.slice(0, 15).map((p, i) => React.createElement(ResultsTableRow, { key: `${p.platformName}-${p.planName}-${p.option.modelId}`, platform: p, rank: i + 1, calcMode, activeHighlightId, onHighlight })))
        )
    )
};

const CalculatorSection = ({ activeHighlightId, onHighlight }) => {
    const [inputs, setInputs] = useState<RecommendationInputs>({
        calcMode: 'cost', deadline: 7, duration: 10, budget: 1000, costQuality: 50, speedCost: 50,
        audioNeeds: 'none', expertise: 'beginner', enableComparison: false, traditionalCost: 10000, traditionalTime: 14,
    });
    
    const parametersRef = useRef(null);
    const resultsTableRef = useRef(null);
    const { primaryRecommendation, sortedPlatforms } = useRecommendation(inputs);

    const handleExport = useCallback(async (ref, fileName) => {
        if (!ref.current) return;
        try {
            const dataUrl = await htmlToImage.toPng(ref.current, { quality: 1, backgroundColor: '#f8fafc', pixelRatio: 2 });
            const link = document.createElement('a');
            link.download = `${fileName}.png`;
            link.href = dataUrl;
            link.click();
        } catch (error) { console.error('Export failed:', error); }
    }, []);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        
        if (name === 'calcMode') {
            return setInputs(prev => ({...prev, calcMode: value, enableComparison: value === 'cost' ? prev.enableComparison : false }));
        }

        if (type === 'checkbox') {
             return setInputs(prev => ({ ...prev, [name]: checked }));
        }

        setInputs(prev => ({ ...prev, [name]: type === 'number' || type === 'range' ? Number(value) : value }));
    };

    const getDisplayValue = (key: keyof RecommendationInputs) => {
        switch (key) {
            case 'deadline': return `${inputs.deadline} days available`;
            case 'duration': return `${inputs.duration} minutes of content`;
            case 'budget': return `$${inputs.budget.toLocaleString()} maximum budget`;
            case 'costQuality':
                if (inputs.costQuality < 30) return 'Cost-focused approach';
                if (inputs.costQuality > 70) return 'Quality-focused approach';
                return 'Balanced approach';
            case 'speedCost':
                if (inputs.speedCost < 30) return 'Cost-optimized timeline';
                if (inputs.speedCost > 70) return 'Speed-optimized timeline';
                return 'Balanced timing';
            case 'traditionalCost': return `Cost: $${inputs.traditionalCost.toLocaleString()}`;
            case 'traditionalTime': return `Time: ${inputs.traditionalTime} days`;
            default: return '';
        }
    };
    
    const isCostMode = inputs.calcMode === 'cost';
    const mainTitle = isCostMode ? "Optimal Platform Recommendation" : "Maximum Content for your Budget";

    return React.createElement('div', null,
        React.createElement('div', { className: "grid grid-cols-1 lg:grid-cols-5 gap-8" },
            React.createElement('div', { ref: parametersRef, className: "lg:col-span-2 bg-white/70 backdrop-blur-sm border border-slate-200 shadow-lg rounded-xl p-6 h-fit" },
                React.createElement('div', { className: "flex justify-between items-start mb-4" },
                    React.createElement('h3', { className: "text-2xl font-bold text-blue-900" }, "Project Parameters"),
                     React.createElement('button', { onClick: () => handleExport(parametersRef, 'project-parameters'), title: "Export Parameters", className: "text-blue-600 p-2 rounded-full hover:bg-blue-100" }, React.createElement(DownloadIcon, null))
                ),
                 React.createElement(HighlightWrapper, {highlightId: HIGHLIGHT_IDS.CALC_MODE, activeHighlightId},
                    React.createElement('div', { className: "mb-6"},
                        React.createElement('div', {className: 'flex items-center mb-2'},
                            React.createElement('label', { className: "block text-blue-900 font-semibold" }, "Calculation Mode"),
                            React.createElement(InfoTooltip, { content: "Choose your goal. 'Calculate Cost' finds the cheapest way to create a video of a specific length. 'Calculate Duration' finds the maximum video length you can create for a given budget.", highlightId: HIGHLIGHT_IDS.CALC_MODE, onHighlight })
                        ),
                        React.createElement('div', {className: "flex gap-2 bg-slate-200 p-1 rounded-lg"},
                          React.createElement('button', { onClick: () => handleChange({target: {name: 'calcMode', value: 'cost'}}), className: `w-full p-2 rounded-md text-sm font-semibold transition-colors ${isCostMode ? 'bg-blue-600 text-white shadow' : 'bg-transparent text-slate-600 hover:bg-slate-300'}`}, "Calculate Cost"),
                          React.createElement('button', { onClick: () => handleChange({target: {name: 'calcMode', value: 'duration'}}), className: `w-full p-2 rounded-md text-sm font-semibold transition-colors ${!isCostMode ? 'bg-blue-600 text-white shadow' : 'bg-transparent text-slate-600 hover:bg-slate-300'}`}, "Calculate Duration")
                        )
                    )
                ),
                React.createElement(InputField, { label: "Project Deadline (Days)", id: "deadline", type: "number", value: inputs.deadline, onChange: handleChange, min: 1, max: 365, displayValue: getDisplayValue('deadline'), tooltip: "Enter the total number of days you have to complete the project. This impacts feasibility and the need for parallel processing.", highlightId: HIGHLIGHT_IDS.DEADLINE, activeHighlightId, onHighlight }),
                React.createElement(InputField, { label: "Total Content Duration (Minutes)", id: "duration", type: "number", value: inputs.duration, onChange: handleChange, min: 1, max: 300, displayValue: getDisplayValue('duration'), disabled: !isCostMode, tooltip: "The total length of the final video. Disabled in 'Calculate Duration' mode.", highlightId: HIGHLIGHT_IDS.DURATION, activeHighlightId, onHighlight }),
                React.createElement(InputField, { label: "Budget Limit ($)", id: "budget", type: "number", value: inputs.budget, onChange: handleChange, min: 50, max: 20000, displayValue: getDisplayValue('budget'), tooltip: "Your maximum total budget in USD.", highlightId: HIGHLIGHT_IDS.BUDGET, activeHighlightId, onHighlight }),
                React.createElement(SliderField, { label: "Cost vs Quality Priority", id: "costQuality", value: inputs.costQuality, onChange: handleChange, labels: ['Min Cost', 'Balanced', 'Max Quality'], displayValue: getDisplayValue('costQuality'), tooltip: "'Min Cost' prioritizes the cheapest options. 'Max Quality' prioritizes the best-looking output (e.g., 4K).", highlightId: HIGHLIGHT_IDS.COST_QUALITY, activeHighlightId, onHighlight }),
                React.createElement(SliderField, { label: "Speed vs Cost Priority", id: "speedCost", value: inputs.speedCost, onChange: handleChange, labels: ['Lowest Cost', 'Balanced', 'Fastest'], displayValue: getDisplayValue('speedCost'), tooltip: "'Lowest Cost' favors cheaper, slower options. 'Fastest' prioritizes options with high parallel processing, which may increase cost.", highlightId: HIGHLIGHT_IDS.SPEED_COST, activeHighlightId, onHighlight }),
                React.createElement(SelectField, { label: "Audio Requirements", id: "audioNeeds", value: inputs.audioNeeds, onChange: handleChange, options: [{ value: 'none', label: 'No audio needed' }, { value: 'basic', label: 'Basic audio overlay' }, { value: 'advanced', label: 'Integrated audio generation' }], tooltip: "Specify your audio needs. 'Integrated' prioritizes platforms that can generate audio along with the video.", highlightId: HIGHLIGHT_IDS.AUDIO, activeHighlightId, onHighlight }),
                React.createElement(SelectField, { label: "Technical Expertise Level", id: "expertise", value: inputs.expertise, onChange: handleChange, options: [{ value: 'beginner', label: 'Beginner (GUI only)' }, { value: 'intermediate', label: 'Intermediate (Some API)' }, { value: 'expert', label: 'Expert (Full technical)' }], tooltip: "Your comfort level with technical tools. 'Expert' will favor API-driven platforms for maximum speed and control.", highlightId: HIGHLIGHT_IDS.EXPERTISE, activeHighlightId, onHighlight }),
                React.createElement('div', { className: `my-6 pt-6 border-t-2 border-slate-200/80 transition-opacity ${!isCostMode ? 'opacity-50 pointer-events-none' : ''}` },
                  React.createElement(HighlightWrapper, {highlightId: HIGHLIGHT_IDS.ROI, activeHighlightId},
                    React.createElement('div', { className: "flex items-center mb-4 bg-slate-50 p-3 rounded-lg border border-slate-200" },
                         React.createElement('input', { type: "checkbox", id: "enableComparison", name: "enableComparison", checked: isCostMode && inputs.enableComparison, onChange: handleChange, disabled: !isCostMode }),
                        React.createElement('label', { htmlFor: "enableComparison", className: "ml-3 block text-sm font-medium text-slate-700" }, "Enable Comparison"),
                        React.createElement(InfoTooltip, { content: isCostMode ? "Enable this to compare the AI recommendation against a traditional workflow to quantify the return on investment (ROI)." : "Comparison is only available in 'Calculate Cost' mode as it requires a fixed project scope for an accurate ROI calculation.", highlightId: HIGHLIGHT_IDS.ROI, onHighlight })
                    )
                  ),
                    (isCostMode && inputs.enableComparison) && React.createElement('div', { className: "space-y-4 pl-2 border-l-2 border-blue-200 ml-2 mt-4" },
                        React.createElement(InputField, { label: "Traditional Cost ($)", id: "traditionalCost", type: "number", value: inputs.traditionalCost, onChange: handleChange, min: 0, max: 100000, displayValue: getDisplayValue('traditionalCost'), highlightId: HIGHLIGHT_IDS.ROI, activeHighlightId, onHighlight, disabled: !isCostMode }),
                        React.createElement(InputField, { label: "Traditional Time (Days)", id: "traditionalTime", type: "number", value: inputs.traditionalTime, onChange: handleChange, min: 0, max: 365, displayValue: getDisplayValue('traditionalTime'), highlightId: HIGHLIGHT_IDS.ROI, activeHighlightId, onHighlight, disabled: !isCostMode }),
                        React.createElement(ROIAnalysisSummary, { platform: primaryRecommendation, inputs })
                    )
                )
            ),
            React.createElement('div', { className: "lg:col-span-3" },
                React.createElement('div', { className: 'flex items-center mb-6' },
                    React.createElement(HighlightWrapper, {highlightId: isCostMode ? HIGHLIGHT_IDS.TOTAL_COST : HIGHLIGHT_IDS.DURATION, activeHighlightId},
                      React.createElement('h3', { className: "text-2xl font-bold text-blue-900" }, mainTitle)
                    ),
                    React.createElement(InfoTooltip, { content: "This is the top-ranked suitable option based on your parameters. See the table below for other alternatives.", highlightId: isCostMode ? HIGHLIGHT_IDS.TOTAL_COST : HIGHLIGHT_IDS.DURATION, onHighlight })
                ),
                React.createElement(PrimaryRecommendation, { platform: primaryRecommendation, inputs: inputs, activeHighlightId, onHighlight }),
                React.createElement(ProjectMetrics, { platform: primaryRecommendation, inputs: inputs, activeHighlightId, onHighlight })
            )
        ),
         React.createElement('div', { ref: resultsTableRef, className: "bg-white rounded-lg overflow-hidden mt-8 border border-slate-200" },
             React.createElement('div', { className: "flex justify-between items-center p-4 bg-slate-50 text-blue-900 font-bold" },
                React.createElement('h4', {className: 'flex items-center'}, "Detailed Platform Comparison", React.createElement(InfoTooltip, {content: "A ranked list of the top 15 most suitable options. Options marked in gray were not feasible within your constraints.", onHighlight, highlightId: null})),
                React.createElement('button', { onClick: () => handleExport(resultsTableRef, 'project-results-table'), title: "Export Table", className: "text-blue-600 p-2 rounded-full hover:bg-slate-200" }, React.createElement(DownloadIcon, null))
             ),
             React.createElement(ResultsTable, { platforms: sortedPlatforms, calcMode: inputs.calcMode, activeHighlightId, onHighlight })
         )
    );
};

const getAverage = (value) => (Array.isArray(value) ? (value[0] + value[1]) / 2 : value);
const Table = ({ children }) => React.createElement('div', { className: "overflow-x-auto rounded-lg border border-slate-200/80 shadow-md my-6" }, React.createElement('table', { className: "w-full text-sm text-left text-slate-600 responsive-table" }, children));
const TableHeader = ({ headers, onHighlight, activeHighlightId }) => (
    React.createElement('thead', null,
        React.createElement('tr', { className: "bg-gradient-to-r from-blue-800 to-blue-500 text-white text-xs uppercase" }, headers.map(h => React.createElement('th', { key: h.title, className: "p-3 font-semibold tracking-wider" },
            React.createElement(HighlightWrapper, { highlightId: h.highlightId, activeHighlightId },
                React.createElement('span', {className: 'flex items-center'}, h.title, React.createElement(InfoTooltip, {content: h.tooltip, highlightId: h.highlightId, onHighlight}))
            )
        )))
    )
);

const Tag = ({ text, color, icon = null }) => {
    const colors = { green: 'bg-emerald-100 text-emerald-800', red: 'bg-red-100 text-red-800', blue: 'bg-blue-100 text-blue-800', gray: 'bg-slate-200 text-slate-700' };
    return React.createElement('span', { className: `inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${colors[color]}` }, 
        icon && React.createElement('span', {className: 'mr-1.5'}, icon),
        text
    );
};

const PlatformCostAnalysisTable = ({ activeHighlightId, onHighlight }) => {
    const headers = [
        {title: 'Platform', tooltip: "The video generation platform."},
        {title: 'Example Plan', tooltip: "A representative subscription plan for comparison.", highlightId: HIGHLIGHT_IDS.PLAN_COST},
        {title: 'Example Cost per Clip*', tooltip: 'Cost per clip in native units (e.g., credits). Excludes monthly plan cost.', highlightId: HIGHLIGHT_IDS.COST_PER_SEC},
        {title: 'Max Clip Length', tooltip: "The maximum duration of a single generated video clip in seconds.", highlightId: HIGHLIGHT_IDS.DURATION},
        {title: 'Top Quality', tooltip: "The highest resolution available on the platform.", highlightId: HIGHLIGHT_IDS.QUALITY_SCORE},
        {title: 'Audio Support', tooltip: "Whether the platform can generate or integrate audio.", highlightId: HIGHLIGHT_IDS.AUDIO},
        {title: 'Parallel Processing', tooltip: "The platform's ability to process multiple jobs simultaneously, via GUI or API.", highlightId: HIGHLIGHT_IDS.PARALLEL}
    ];
    
    return React.createElement(Table, null,
        React.createElement(TableHeader, { headers, onHighlight, activeHighlightId }),
        React.createElement('tbody', { className: "bg-white" },
            DETAILED_PLATFORM_DATA.map(p => {
                const examplePlan = p.plans.find(plan => plan.planName.includes("Pro")) || p.plans[p.plans.length - 1];
                if (!examplePlan) return null;
                const allCosts = examplePlan.options.map(o => getAverage(o.cost));
                return React.createElement('tr', { key: p.platformName },
                    React.createElement('td', { 'data-label': 'Platform', className: "p-3 font-bold text-slate-800" }, p.platformName),
                    React.createElement('td', { 'data-label': 'Example Plan', className: "p-3" }, `${examplePlan.planName} (${examplePlan.monthlyCost > 0 ? `$${examplePlan.monthlyCost}` : 'Pay-per-use'})`),
                    React.createElement('td', { 'data-label': 'Example Cost per Clip*', className: "p-3 font-semibold text-emerald-700" }, `${Math.min(...allCosts)}-${Math.max(...allCosts)} ${examplePlan.options[0]?.costUnit || 'units'}`),
                    React.createElement('td', { 'data-label': 'Max Clip Length', className: "p-3" }, `${Math.max(...p.plans.flatMap(plan => plan.options.map(o => o.maxDurationSec)))}s`),
                    React.createElement('td', { 'data-label': 'Top Quality', className: "p-3" }, React.createElement(Tag, {text: p.plans.some(plan => plan.options.some(o => o.resolution === "4K")) ? "4K" : "1080p+", color: 'blue'})),
                    React.createElement('td', { 'data-label': 'Audio Support', className: "p-3" }, p.plans.some(plan => plan.options.some(o => o.audio)) ? React.createElement(Tag, {text: "Yes", color: "green", icon: '🎵'}) : React.createElement(Tag, {text: "No", color: "gray"})),
                    React.createElement('td', { 'data-label': 'Parallel Processing', className: "p-3" }, p.apiAvailable === 'Yes' ? 'GUI & API' : 'GUI Only')
                )
            })
        )
    );
};

const TimeBatchingAnalysis = ({ activeHighlightId, onHighlight }) => {
    const timeTooltipContent = React.createElement('div', {className: 'text-left text-xs leading-relaxed'},
        React.createElement('p', {className: 'mb-2'}, "An estimate of the pure machine time required to generate all clips in an ideal, non-stop scenario."),
        React.createElement('p', {className: 'font-bold'}, "Includes:"),
        React.createElement('ul', {className: 'list-disc list-inside pl-1 mb-2'},
            React.createElement('li', null, "Platform's processing speed."),
            React.createElement('li', null, "Parallel work capabilities (via GUI or API).")
        ),
        React.createElement('p', {className: 'font-bold'}, "Excludes:"),
        React.createElement('ul', {className: 'list-disc list-inside pl-1 mb-3'},
            React.createElement('li', null, "Human labor (QA, reviews, project management)."),
            React.createElement('li', null, "Editing, revisions, and assembly time.")
        ),
        React.createElement('hr', {className: 'border-slate-600 my-2'}),
        React.createElement('p', {className: 'italic'}, "*Use this to compare the raw processing speed of different platforms.")
    );

    const headers = [
        {title: 'Platform', tooltip: "The video generation platform."},
        {title: 'Avg. Time / Clip', tooltip: "Estimated real-world time to generate and review one clip.", highlightId: HIGHLIGHT_IDS.RAW_GENERATION_TIME},
        {title: 'Max Parallel Jobs', tooltip: "Maximum number of simultaneous generation jobs. Higher is faster for large projects.", highlightId: HIGHLIGHT_IDS.PARALLEL},
        {title: 'Speed-up Strategy', tooltip: "The best method to accelerate production: using the API for batching or creating multiple accounts for parallel GUI work.", highlightId: HIGHLIGHT_IDS.ACCOUNTS_NEEDED},
    ];
    return React.createElement(React.Fragment, null,
        React.createElement(Table, null,
            React.createElement(TableHeader, { headers, onHighlight, activeHighlightId }),
            React.createElement('tbody', { className: "bg-white" },
                 DETAILED_PLATFORM_DATA.map(p => {
                    const representativePlan = p.plans.find(plan => plan.planName.includes('Pro')) || p.plans.find(p => p.maxParallelAPI) || p.plans[0];
                    return React.createElement('tr', { key: p.platformName },
                        React.createElement('td', { 'data-label': 'Platform', className: "p-3 font-bold text-slate-800" }, p.platformName),
                        React.createElement('td', { 'data-label': 'Avg. Time / Clip', className: "p-3" }, `${representativePlan.avgTimePerClipMin} min`),
                        React.createElement('td', { 'data-label': 'Max Parallel Jobs', className: "p-3" }, p.apiAvailable === 'Yes' && representativePlan.maxParallelAPI ? `${representativePlan.maxParallel} (GUI) / ${representativePlan.maxParallelAPI} (API)`: representativePlan.maxParallel),
                        React.createElement('td', { 'data-label': 'Speed-up Strategy', className: "p-3" }, p.apiAvailable === 'Yes' ? 'API Batching' : 'Multiple Accounts')
                    )
                 })
             )
        )
    );
};

const DetailedPlatformBreakdowns = ({ activeHighlightId, onHighlight }) => {
    const isMobile = useMediaQuery('(max-width: 960px)');

    const headers = [
        {title: 'Plan', tooltip: "Subscription plan details.", highlightId: HIGHLIGHT_IDS.PLAN_COST},
        {title: 'Model Name', tooltip: "The specific generation model."},
        {title: 'Max Duration', tooltip: "Max seconds per clip.", highlightId: HIGHLIGHT_IDS.DURATION},
        {title: 'Resolution', tooltip: "Output video resolution.", highlightId: HIGHLIGHT_IDS.QUALITY_SCORE},
        {title: 'Audio', tooltip: "Audio generation capability.", highlightId: HIGHLIGHT_IDS.AUDIO},
        {title: 'Cost Per Clip', tooltip: "This is the cost as defined by the platform. The calculator uses this number, along with the plan's subscription price, to determine the final, real-world cost in USD.", highlightId: HIGHLIGHT_IDS.COST_PER_SEC},
    ];

    if (isMobile) {
        return React.createElement('div', null,
            DETAILED_PLATFORM_DATA.map(platform => (
                React.createElement('div', { key: platform.platformName, className: "mb-8" },
                    React.createElement('h4', { className: "text-xl font-bold text-blue-800 mb-2 border-b-2 border-blue-200 pb-1" }, platform.platformName),
                    React.createElement(Table, null,
                        React.createElement(TableHeader, { headers, onHighlight, activeHighlightId }),
                        React.createElement('tbody', { className: "bg-white" },
                            platform.plans.flatMap((plan) =>
                                plan.options.map((option) => (
                                    React.createElement('tr', { key: option.modelId },
                                        React.createElement('td', { 'data-label': "Plan", className: "p-3 font-semibold align-top" }, `${plan.planName} (${plan.monthlyCost > 0 ? `$${plan.monthlyCost}/mo` : 'Pay-per-use'}) ${plan.quota > 0 ? `- ${plan.quota.toLocaleString()} ${plan.quotaUnit}` : ''}`),
                                        React.createElement('td', { 'data-label': "Model Name", className: "p-3" }, option.modelName),
                                        React.createElement('td', { 'data-label': "Max Duration", className: "p-3" }, `${option.maxDurationSec}s`),
                                        React.createElement('td', { 'data-label': "Resolution", className: "p-3" }, React.createElement(Tag, {text: option.resolution, color: 'blue'})),
                                        React.createElement('td', { 'data-label': "Audio", className: "p-3" }, option.audio ? React.createElement(Tag, { text: "Yes", color: "green", icon: '🎵' }) : React.createElement(Tag, { text: "No", color: "gray" })),
                                        React.createElement('td', { 'data-label': "Cost Per Clip", className: "p-3" }, `${getAverage(option.cost)} ${option.costUnit}`)
                                    )
                                ))
                            )
                        )
                    )
                )
            ))
        );
    }
    
    // Desktop view
    return React.createElement('div', null,
        DETAILED_PLATFORM_DATA.map(platform => (
            React.createElement('div', { key: platform.platformName, className: "mb-8" },
                React.createElement('h4', { className: "text-xl font-bold text-blue-800 mb-2 border-b-2 border-blue-200 pb-1" }, platform.platformName),
                React.createElement(Table, null,
                    React.createElement(TableHeader, { headers, onHighlight, activeHighlightId }),
                    React.createElement('tbody', { className: "bg-white" },
                        platform.plans.map((plan, planIndex) => (
                           plan.options.map((option, optionIndex) => (
                                React.createElement('tr', { key: option.modelId },
                                    optionIndex === 0 && React.createElement('td', { rowSpan: plan.options.length, className: "p-3 font-semibold align-top border-r border-slate-200/80" },
                                        `${plan.planName} (${plan.monthlyCost > 0 ? `$${plan.monthlyCost}/mo` : 'Pay-per-use'}) ${plan.quota > 0 ? `- ${plan.quota.toLocaleString()} ${plan.quotaUnit}` : ''}`
                                    ),
                                    React.createElement('td', { className: "p-3" }, option.modelName),
                                    React.createElement('td', { className: "p-3" }, `${option.maxDurationSec}s`),
                                    React.createElement('td', { className: "p-3" }, React.createElement(Tag, {text: option.resolution, color: 'blue'})),
                                    React.createElement('td', { className: "p-3" }, option.audio ? React.createElement(Tag, { text: "Yes", color: "green", icon: '🎵' }) : React.createElement(Tag, { text: "No", color: "gray" })),
                                    React.createElement('td', { className: "p-3" }, `${getAverage(option.cost)} ${option.costUnit}`)
                                )
                            ))
                        ))
                    )
                )
            )
        ))
    );
};

const Header = () => {
    return React.createElement('header', { className: "bg-gradient-to-br from-blue-900 to-blue-600 text-white p-6 md:p-10 rounded-xl shadow-2xl mb-8 relative overflow-hidden" },
        React.createElement('div', { className: "absolute inset-0 bg-grid-pattern opacity-10" }),
        React.createElement('div', { className: "relative z-10 text-center" },
            React.createElement('h1', { className: "text-3xl md:text-5xl font-bold mb-2 tracking-tight" }, "AI Video Production Analysis"),
            React.createElement('p', { className: "text-lg md:text-xl text-blue-200" }, "Cost-Time-Benefit Analysis | July 2025"),
        ),
        React.createElement('style', null, `.bg-grid-pattern { background-image: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="1"/></pattern></defs><rect width="100%" height="100%" fill="url(%23grid)"/></svg>'); }`)
    )
};

const App = () => {
  const [activeHighlightId, setActiveHighlightId] = useState<HighlightId>(null);
  
  const handleHighlight = useCallback((id: HighlightId) => {
    setActiveHighlightId(prevId => prevId === id ? null : id);
  }, []);

  return React.createElement(
    'div',
    { className: "min-h-screen bg-gradient-to-br from-slate-50 to-slate-200" },
    React.createElement(
      'main',
      { className: "max-w-7xl mx-auto p-4 md:p-8" },
      React.createElement(Header, null),
      React.createElement(CollapsibleSection, {
        title: "Interactive Cost & Time Calculator", icon: "🧮", badgeText: "Decision Tool", defaultOpen: true,
        tooltip: "This is the main tool. Set your project parameters here to get a tailored recommendation.",
        highlightId: null,
        activeHighlightId,
        onHighlight: handleHighlight,
        children: React.createElement(CalculatorSection, { activeHighlightId, onHighlight: handleHighlight })
      }),
      React.createElement(CollapsibleSection, {
        title: "High-Level Cost Analysis", icon: "📊", badgeText: "Quick Comparison", exportFileName: "cost-analysis-table",
        tooltip: "A quick overview of the costs and capabilities of different platforms to get a feel for the market.",
        highlightId: HIGHLIGHT_IDS.COST_PER_SEC, activeHighlightId, onHighlight: handleHighlight,
        children: React.createElement(PlatformCostAnalysisTable, { activeHighlightId, onHighlight: handleHighlight })
      }),
      React.createElement(CollapsibleSection, {
        title: "Time & Batching Analysis", icon: "⏱️", badgeText: "For Tight Deadlines", exportFileName: "time-batching-table",
        tooltip: "Analyzes how different platforms handle speed and large volumes of work, crucial for projects with tight deadlines.",
        highlightId: HIGHLIGHT_IDS.RAW_GENERATION_TIME, activeHighlightId, onHighlight: handleHighlight,
        children: React.createElement(TimeBatchingAnalysis, { activeHighlightId, onHighlight: handleHighlight })
      }),
      React.createElement(CollapsibleSection, {
        title: "Detailed Platform & Model Breakdowns", icon: "📋", badgeText: "Full Data", exportFileName: "detailed-breakdown-table",
        tooltip: "The complete raw data for every platform, plan, and model used by the calculator. Use this to see the underlying numbers.",
        highlightId: null,
        activeHighlightId,
        onHighlight: handleHighlight,
        children: React.createElement(DetailedPlatformBreakdowns, { activeHighlightId, onHighlight: handleHighlight })
      })
    )
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(React.StrictMode, null, React.createElement(App, null)));
