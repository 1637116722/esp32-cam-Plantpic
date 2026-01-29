import { useState, useEffect, useRef, memo } from 'react';
import { Droplet, Camera, RefreshCw, Video, CheckCircle2, AlertCircle, X, Check, Pencil, Trees, Home, AlertTriangle, Trash2, Sparkles, ArrowLeft, Heart } from 'lucide-react';
import { getApiUrl } from "../../utils/apiConfig";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./ui/accordion";
import { PlantItem } from './PlantGrid';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog";

interface PlantDetailViewProps {
  plant: PlantItem;
  onBack: () => void;
  onUpdate: (plant: PlantItem) => void;
  onDelete: (id: string) => void;
  onScroll?: (scrollY: number) => void;
  initialScrollY?: number;
  externalWeather?: {
    temp: number;
    high: number;
    low: number;
    condition: string;
    lastUpdated?: number;
  } | null;
}

interface AnalysisReport {
  text: string;
  moisture?: string;
  sunlight?: string;
  health?: number;
  diseases?: Array<{
    name: string;
    probability: number;
    description?: string;
    treatment: {
      biological?: string | string[];
      chemical?: string | string[];
      prevention?: string | string[];
    };
  }>;
}

const DEFAULT_ANALYSIS: AnalysisReport = {
  text: '分析中...'
};

// 設計常數集中管理
const SCROLL_CONFIG = {
  MAX_SCROLL: 400,        // 滑 400px 就縮完 (580 - 180)
  MAX_HEIGHT: 580,        // 初始高度 (2/3 畫面)
  MIN_HEIGHT: 180,        // 縮小後的最終高度
  MIN_SCALE: 0.55,        // 3D 人物最小縮放
};

// 全局冷卻時間追蹤 (跨組件實例)
let lastAICallTime = 0;
const AI_COOLDOWN = 60000; // 60 秒冷卻

// 基於圖片內容的簡單快取
const analysisCache = new Map<string, any>();

const PlantDetailView = memo(function PlantDetailView({ plant, onBack, onUpdate, onDelete, onScroll, initialScrollY = 0, externalWeather }: PlantDetailViewProps) {
  const CAM_BASE_URL = 'https://esp32-cam-relay-oqmh.onrender.com';
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(plant.name);
  const [editSpecies, setEditSpecies] = useState(plant.species || '');
  const [editType, setEditType] = useState(plant.type);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isPhotoAnalyzing, setIsPhotoAnalyzing] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [currentAnalysis, setCurrentAnalysis] = useState<AnalysisReport>(DEFAULT_ANALYSIS);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [showCompleteTip, setShowCompleteTip] = useState(false);
  const [camImageKey, setCamImageKey] = useState(Date.now());
  const [camImageSrc, setCamImageSrc] = useState<string>('');
  const [camTimestamp, setCamTimestamp] = useState<string>('');
  const [isCamLoading, setIsCamLoading] = useState(false);
  const camObjectUrlRef = useRef<string | null>(null);
  const lastCamHashRef = useRef<string | null>(null);
  const camRefreshSeqRef = useRef(0);

  const [showPhotoCompleteTip, setShowPhotoCompleteTip] = useState(false);

  const weather = externalWeather;
  const [isDailyLoading, setIsDailyLoading] = useState(false);
  const photoAnalysisRef = useRef<HTMLDivElement>(null);
  const analysisRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasAutoAnalyzedRef = useRef<string | null>(null);
  const scrollYRef = useRef(0);
  const tickingRef = useRef(false);

  const { MAX_HEIGHT } = SCROLL_CONFIG;

  const parseJsonResponse = async (response: Response) => {
    try {
      const text = await response.text();
      if (!text) {
        return { success: false, error: "伺服器回傳內容為空" };
      }
      
      // 如果回傳內容包含 HTML 標籤，說明可能是 Vercel 路由錯誤或 404
      if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
        console.error("API returned HTML instead of JSON:", text.substring(0, 200));
        return { 
          success: false, 
          error: "伺服器連線異常 (API 路由錯誤)，請確保已將專案部署至 Vercel 並檢查 VERCEL_URL。" 
        };
      }

      try {
        return JSON.parse(text);
      } catch (e) {
        console.error("JSON parse error:", e, "Text:", text.substring(0, 200));
        return { 
          success: false, 
          error: `資料格式解析失敗 (HTTP ${response.status})。可能是 Vercel 尚未部署完成或 VERCEL_URL 設定錯誤。` 
        };
      }
    } catch (e) {
      console.error("parseJsonResponse error:", e);
      return { success: false, error: "無法讀取伺服器回傳內容，請檢查網路連線。" };
    }
  };

  const parseAnalysisText = (text: string) => {
    if (!text) return [];
    
    // 尋找 AI 生成的報告內容，通常在 --- 之後
    let reportContent = text;
    if (text.includes('---')) {
      reportContent = text.split('---').pop() || text;
    }

    const sections: { title: string; content: string }[] = [];
    
    // 增強的正則表達式：
    // 1. 支援 "**標題**:" 或 "**標題**" (Gemini 常用)
    // 2. 支援 "數字. **標題**:" (SearchView 常用)
    // 3. 支援單獨一行的 "標題" (Markdown 標題或粗體)
    const sectionRegex = /(?:\d+\.\s*)?\*\*([^*:\n]+)\*\*[:：]?\s*([\s\S]*?)(?=(?:\d+\.\s*)?\*\*|$)/g;
    
    let match;
    while ((match = sectionRegex.exec(reportContent)) !== null) {
      const title = match[1].trim();
      let content = match[2].trim();
      
      // 清理內容：移除開頭可能遺留的冒號或多餘換行
      content = content.replace(/^[:：]\s*/, '').trim();
      
      if (title && content && !title.includes('AI 深度報告')) {
        sections.push({ title, content });
      }
    }
    
    // 如果解析失敗（沒找到任何章節），嘗試更簡單的分段方式
    if (sections.length === 0) {
      const simpleRegex = /(?:🌿|🔍|💧|☀️|🏥|💡|🛠️)\s*([^*:\n]+)[:：]?\s*([\s\S]*?)(?=(?:🌿|🔍|💧|☀️|🏥|💡|🛠️)|$)/g;
      while ((match = simpleRegex.exec(reportContent)) !== null) {
        const title = match[1].trim();
        const content = match[2].trim();
        if (title && content) {
          sections.push({ title, content });
        }
      }
    }
    
    if (sections.length === 0) {
      // 移除可能存在的品種標題
      const cleanedText = reportContent.replace(/^\*\*品種：.*?\*\*\n\n?/, '').trim();
      return [{ title: "養護建議", content: cleanedText }];
    }
    
    return sections;
  };

  // 檢查並生成每日養護建議
  useEffect(() => {
    if (!weather) return;
    if (isDailyLoading) return;

    const today = new Date().toISOString().split('T')[0];
    
    // 判斷是否需要更新：
    // 1. 還沒有建議資料
    // 2. 日期不是今天
    const needsUpdate = !plant.dailyRecommendation || 
                       plant.dailyRecommendation.lastUpdated !== today;

    if (needsUpdate) {
      const fetchDailyCare = async () => {
        // 檢查冷卻時間
        const now = Date.now();
        if (now - lastAICallTime < AI_COOLDOWN) {
          console.log('AI 正在冷卻中，跳過每日建議刷新');
          return;
        }
        
        lastAICallTime = now;
        setIsDailyLoading(true);
        try {
          const apiUrl = getApiUrl("/api/daily-care");
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              plantName: plant.name, 
              species: plant.species,
              weather
            }),
          });
          const data = await parseJsonResponse(response);

          if (data.success) {
            onUpdate({
              ...plant,
              dailyRecommendation: {
                moisture: data.moisture,
                sunlight: data.sunlight,
                lastUpdated: today,
                lastUpdatedTs: Date.now()
              }
            });
          }
        } catch (e) {
          console.error("Failed to fetch daily care:", e);
        } finally {
          setIsDailyLoading(false);
        }
      };
      fetchDailyCare();
    }
  }, [plant.id]); // 僅監聽 ID，實現每日僅刷新一次

  const [isAnalysisExpanded, setIsAnalysisExpanded] = useState(false);

  // 監測 AI 分析區域與照片分析區域是否進入視野
  useEffect(() => {
    if ((!showCompleteTip || !analysisRef.current) && (!showPhotoCompleteTip || !photoAnalysisRef.current)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            if (entry.target === analysisRef.current) {
              setShowCompleteTip(false);
            } else if (entry.target === photoAnalysisRef.current) {
              setShowPhotoCompleteTip(false);
            }
          }
        });
      },
      { threshold: 0.5 }
    );

    if (analysisRef.current) observer.observe(analysisRef.current);
    if (photoAnalysisRef.current) observer.observe(photoAnalysisRef.current);
    
    return () => observer.disconnect();
  }, [showCompleteTip, showPhotoCompleteTip]);

  // 當外部 plant 改變時同步內部編輯狀態
  useEffect(() => {
    setEditName(plant.name);
    setEditSpecies(plant.species || '');
    setEditType(plant.type);
    setAnalysisError(null);
    setShowCompleteTip(false);
    
    // 如果外部傳入的 plant 帶有分析結果，同步到內部狀態
    if (plant.aiAnalysis) {
      setCurrentAnalysis({ text: plant.aiAnalysis });
      setShowAnalysis(true);
      // 不要重置 isAnalysisExpanded，保留使用者狀態
    } else {
      setShowAnalysis(false);
      setCurrentAnalysis(DEFAULT_ANALYSIS);
      setIsAnalysisExpanded(false);
    }
  }, [plant.id]); // 改為監聽 ID 即可

  const analyzeImageWithGemini = async (imageUrl: string | null, plantName: string, species?: string, moisture?: number, imageSource?: string, includeImage: boolean = true, healthAnalysis?: any) => {
    const cacheKey = `${plant.id}-${includeImage ? imageUrl : 'text-only'}`;
    if (analysisCache.has(cacheKey)) {
      console.log('使用 AI 分析快取結果');
      return analysisCache.get(cacheKey);
    }

    try {
      setAnalysisError(null);
      
      let finalImageUrl = imageUrl;
      // 如果是本地 Blob URL，必須先轉換為 Base64
      if (includeImage && imageUrl && imageUrl.startsWith('blob:')) {
        try {
          const res = await fetch(imageUrl);
          const blob = await res.blob();
          finalImageUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
        } catch (e) {
          console.error("Blob to Base64 conversion failed:", e);
          throw new Error("無法處理本地圖片，請嘗試重新上傳。");
        }
      }

      // 步驟 1: 呼叫 Gemini API 進行深度分析與報告生成
      const apiUrl = getApiUrl("/api/analyze-plant");
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          imageUrl: includeImage ? finalImageUrl : null, 
          plantName, 
          species, 
          currentMoisture: moisture,
          imageSource,
          healthAnalysis // 傳遞健康診斷資訊
        }),
      });

      const data = await parseJsonResponse(response);

      if (data && !data.error) {
        const result = {
          text: data.analysis || data.generated_text || "分析完成",
          moisture: data.moisture || "50%",
          sunlight: data.sunlight || "4小時",
          health: data.health !== undefined ? data.health : undefined,
          diseases: data.diseases
        } as AnalysisReport;
        
        analysisCache.set(cacheKey, result);
        return result;
      }

      setAnalysisError(data.error || "Gemini 分析暫時不可用，請稍後再試。");
    } catch (error) {
      console.error("Fetch Analysis Error:", error);
      setAnalysisError("無法連線至 Gemini 分析服務，請檢查網路後重試。");
    }
    return null;
  };

  useEffect(() => {
    hasAutoAnalyzedRef.current = plant.id;
  }, [plant.id]);

  const handleStartAnalysis = async () => {
    // 檢查冷卻時間
    const now = Date.now();
    if (now - lastAICallTime < AI_COOLDOWN) {
      const waitTime = Math.ceil((AI_COOLDOWN - (now - lastAICallTime)) / 1000);
      setAnalysisError(`AI 休息中，請在 ${waitTime} 秒後再試`);
      return;
    }

    // 即使已經有分析結果，手動點擊按鈕也會強制重新分析
    setIsAnalyzing(true);
    lastAICallTime = now;
    setShowAnalysis(false);
    setAnalysisError(null);
    setShowCompleteTip(false);

    try {
      const analysisResult = await analyzeImageWithGemini(
        null, 
        plant.name, 
        plant.species,
        plant.moisture ?? 50, // 傳入當前濕度值
        'none',
        false,
        plant.healthAnalysis // 傳入健康診斷結果
      );
      
      if (analysisResult) {
        setCurrentAnalysis({ text: analysisResult.text });
        setShowAnalysis(true);
        // setShowCompleteTip(true); // 取消顯示完成提示
        
        // 更新持久化儲存，同時更新每日建議
        const updatedPlant: PlantItem = {
          ...plant,
          aiAnalysis: analysisResult.text
        };

        // 如果 AI 分析有提供更精確的建議數值，則更新它
        if (analysisResult.moisture || analysisResult.sunlight) {
          updatedPlant.dailyRecommendation = {
            ...plant.dailyRecommendation,
            moisture: analysisResult.moisture || plant.dailyRecommendation?.moisture || "50%",
            sunlight: analysisResult.sunlight || plant.dailyRecommendation?.sunlight || "4小時",
            lastUpdated: new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-'),
            lastUpdatedTs: Date.now()
          };
        }

        onUpdate(updatedPlant);
      }
    } catch (e: any) {
      console.error("AI Analysis Error:", e);
      setAnalysisError(e.message || "無法連線至 Gemini 分析服務，請檢查網路後重試。");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handlePhotoAnalysis = async () => {
    if (isPhotoAnalyzing) return;
    setAnalysisError(null);
    const activeImageUrl = plant.latestEspPhoto || plant.imageUrl || null;
    if (!activeImageUrl) {
      setAnalysisError('目前沒有可用的照片，請先上傳或拍攝。');
      return;
    }
    setIsPhotoAnalyzing(true);
    setShowPhotoCompleteTip(false);
    
    try {
      let finalImageUrl = activeImageUrl;
      
      // 如果是本地 Blob URL，必須先轉換為 Base64，否則 Vercel 伺服器無法存取
      if (activeImageUrl.startsWith('blob:')) {
        try {
          const res = await fetch(activeImageUrl);
          const blob = await res.blob();
          finalImageUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
        } catch (e) {
          console.error("Blob to Base64 conversion failed:", e);
          throw new Error("無法處理本地圖片，請嘗試重新上傳。");
        }
      }

      const apiUrl = getApiUrl("/api/identify-plant");
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          imageUrl: finalImageUrl,
          moisture: plant.moisture || 50,
          plantName: plant.name,
          species: plant.species
        })
      });
      
      const data = await parseJsonResponse(response);
      if (data.success) {
        const updatedPlant: PlantItem = {
          ...plant,
          healthAnalysis: {
            isHealthy: data.isHealthy ?? true,
            diseases: data.diseases || []
          }
        };
        if (data.healthScore !== undefined) {
          updatedPlant.health = data.healthScore;
        }
        if (data.species) {
          updatedPlant.species = data.species;
        }
        onUpdate(updatedPlant);
        setShowPhotoCompleteTip(true);
      } else {
        setAnalysisError(data.error || "照片分析暫時不可用，請稍後再試。");
      }
    } catch (error: any) {
      console.error("Photo Analysis Error:", error);
      const errorMsg = error.message || "無法連線至照片分析服務，請檢查網路後重試。";
      setAnalysisError(errorMsg);
    } finally {
      setIsPhotoAnalyzing(false);
    }
  };

  const scrollToAnalysis = () => {
    analysisRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setShowCompleteTip(false);
  };

  const scrollToPhotoAnalysis = () => {
    photoAnalysisRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setShowPhotoCompleteTip(false);
  };

  const handleSaveEdit = () => {
    if (!editName.trim()) return;
    onUpdate({ 
      ...plant, 
      name: editName.trim(), 
      species: editSpecies.trim(),
      type: editType
    });
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditName(plant.name);
    setEditSpecies(plant.species || '');
    setEditType(plant.type);
    setIsEditing(false);
  };

  const hashBlob = async (blob: Blob): Promise<string> => {
    if (!('crypto' in window) || !('subtle' in crypto)) return '';
    const buffer = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    const bytes = new Uint8Array(digest);
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  };

  const applyCamBlob = async (blob: Blob, uploadedAtIso: string | null) => {
    const hash = await hashBlob(blob);
    if (hash && lastCamHashRef.current === hash) return false;

    if (hash) lastCamHashRef.current = hash;
    if (camObjectUrlRef.current) URL.revokeObjectURL(camObjectUrlRef.current);
    const url = URL.createObjectURL(blob);
    camObjectUrlRef.current = url;
    setCamImageSrc(url);
    if (uploadedAtIso) {
      const uploadDate = new Date(uploadedAtIso);
      setCamTimestamp(uploadDate.toLocaleTimeString('zh-TW', { hour12: false }));
    }
    return true;
  };

  const handleRefreshCam = async () => {
    setIsCamLoading(true);
    try {
      const refreshSeq = ++camRefreshSeqRef.current;

      const baseInfoRes = await fetch(`${CAM_BASE_URL}/api/info`, { cache: 'no-store' });
      const baseInfo = await baseInfoRes.json();
      const baseUploadTime: string | null = baseInfo.lastUploadTime ?? null;

      const requestRes = await fetch(`${CAM_BASE_URL}/api/request-photo`, { cache: 'no-store' });
      const requestData = await requestRes.json();
      const requestId: string | null = requestData.requestId ?? null;
      const requestTime: string | null = requestData.time ?? null;

      while (camRefreshSeqRef.current === refreshSeq) {
        const infoRes = await fetch(`${CAM_BASE_URL}/api/info`, { cache: 'no-store' });
        const info = await infoRes.json();

        const lastUploadTime: string | null = info.lastUploadTime ?? null;
        const lastUploadRequestId: string | null = info.lastUploadRequestId ?? null;

        const hasNewRequestedPhoto = (() => {
          if (!lastUploadTime) return false;
          if (baseUploadTime && lastUploadTime === baseUploadTime) return false;
          if (requestId && lastUploadRequestId && lastUploadRequestId === requestId) return true;
          if (requestTime) return new Date(lastUploadTime).getTime() >= new Date(requestTime).getTime();
          return true;
        })();

        if (hasNewRequestedPhoto && lastUploadTime) {
          const imageRes = await fetch(`${CAM_BASE_URL}/api/image?t=${Date.now()}`, { cache: 'no-store' });
          if (imageRes.ok) {
            const blob = await imageRes.blob();
            const applied = await applyCamBlob(blob, lastUploadTime);
            if (applied) {
              setCamImageKey(Date.now());
              setIsCamLoading(false);
              return;
            }
          }
        }

        await new Promise((r) => setTimeout(r, 2000));
      }
    } catch (error) {
      console.error('Failed to request new photo:', error);
    }
    setIsCamLoading(false);
  };

  useEffect(() => {
    const refreshSeq = ++camRefreshSeqRef.current;
    const loadInitial = async () => {
      try {
        const infoRes = await fetch(`${CAM_BASE_URL}/api/info`, { cache: 'no-store' });
        const info = await infoRes.json();
        const lastUploadTime: string | null = info.lastUploadTime ?? null;
        if (!lastUploadTime) return;
        const imageRes = await fetch(`${CAM_BASE_URL}/api/image?t=${Date.now()}`, { cache: 'no-store' });
        if (!imageRes.ok) return;
        const blob = await imageRes.blob();
        if (camRefreshSeqRef.current !== refreshSeq) return;
        await applyCamBlob(blob, lastUploadTime);
      } catch (error) {
        console.error('Initial cam load failed:', error);
      }
    };
    
    if (plant.cameraId) {
      loadInitial();
    }

    return () => {
      if (camObjectUrlRef.current) {
        URL.revokeObjectURL(camObjectUrlRef.current);
        camObjectUrlRef.current = null;
      }
    };
  }, [plant.cameraId]);

  const moisture = plant.moisture ?? 50;
  const health = plant.health ?? 50;

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const st = e.currentTarget.scrollTop;
    
    if (!tickingRef.current) {
      window.requestAnimationFrame(() => {
        onScroll?.(st);
        tickingRef.current = false;
      });
      tickingRef.current = true;
    }
  };

  // 當進入頁面或植物改變時，同步捲動位置 (僅在初始或切換植物時執行一次)
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = initialScrollY;
      scrollYRef.current = initialScrollY;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plant.id]); 

  return (
    <div className="w-full h-full relative bg-[#F6FAF7] overflow-hidden flex flex-col pt-[env(safe-area-inset-top)]">
      <style>{`
        @keyframes wave {
          0% { transform: translateX(-12px) skewY(-1deg); }
          50% { transform: translateX(12px) skewY(1deg); }
          100% { transform: translateX(-12px) skewY(-1deg); }
        }
        .water-wave {
          animation: wave 4s ease-in-out infinite;
          transform-origin: center;
        }
      `}</style>

      {/* Hero Section placeholder - Only Back Button fixed at top */}
      <div className="absolute top-[env(safe-area-inset-top)] left-0 w-full z-50 pointer-events-none">
        <div className="px-6 pt-4 pointer-events-auto">
          <button
            onClick={onBack}
            className="p-2.5 rounded-full bg-white/40 backdrop-blur-xl transition-all hover:bg-white/60 active:scale-90 shadow-lg border border-white/20"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
        </div>
      </div>

      {/* Scrollable Content Container */}
      <div 
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto no-scrollbar relative z-10"
      >
        <div className="px-6 pb-24 space-y-6">
          {/* Spacer to push content below the absolute header */}
          <div style={{ height: `${MAX_HEIGHT}px` }} className="w-full shrink-0 pointer-events-none" />

          {/* Large Status Cards (Added back as requested) */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-[32px] p-6 shadow-sm border border-gray-50 flex flex-col items-center justify-center space-y-4">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Moisture</span>
              <div className="relative w-28 h-32 flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-full h-full overflow-visible filter drop-shadow-xl -translate-y-2">
                  <defs>
                    <linearGradient id="waterGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#60A5FA" />
                      <stop offset="100%" stopColor="#2563EB" />
                    </linearGradient>
                    <clipPath id="dropletClip">
                      <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" />
                    </clipPath>
                    <filter id="waveShadow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur in="SourceAlpha" stdDeviation="0.8" />
                      <feOffset dx="0" dy="1" result="offsetblur" />
                      <feFlood floodColor="#3B82F6" floodOpacity="0.3" />
                      <feComposite in2="offsetblur" operator="in" />
                      <feMerge>
                        <feMergeNode />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>

                  {/* Glassy Background */}
                  <path 
                    d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" 
                    fill="#F0F9FF"
                    stroke="#DBEAFE"
                    strokeWidth="0.5"
                  />

                  {/* Water Level */}
                   <g clipPath="url(#dropletClip)" filter="url(#waveShadow)">
                     <rect 
                       x="0" 
                       y={22 - (20 * Math.min(moisture, 100) / 100)}
                       width="24" 
                       height="24" 
                       fill="url(#waterGradient)"
                       className="transition-all duration-1000 ease-out"
                     >
                       <animate 
                         attributeName="x" 
                         from="-2" 
                         to="0" 
                         dur="3s" 
                         repeatCount="indefinite" 
                       />
                     </rect>
                     {/* Surface highlight line with wave effect */}
                     <path 
                       d={`M 0 ${22 - (20 * Math.min(moisture, 100) / 100)} Q 6 ${21.5 - (20 * Math.min(moisture, 100) / 100)} 12 ${22 - (20 * Math.min(moisture, 100) / 100)} T 24 ${22 - (20 * Math.min(moisture, 100) / 100)}`}
                       fill="none"
                       stroke="#93C5FD"
                       strokeWidth="0.5"
                       className="transition-all duration-1000 ease-out opacity-80"
                     >
                       <animate 
                         attributeName="d" 
                         values={`
                           M 0 ${22 - (20 * Math.min(moisture, 100) / 100)} Q 6 ${21.5 - (20 * Math.min(moisture, 100) / 100)} 12 ${22 - (20 * Math.min(moisture, 100) / 100)} T 24 ${22 - (20 * Math.min(moisture, 100) / 100)};
                           M 0 ${22 - (20 * Math.min(moisture, 100) / 100)} Q 6 ${22.5 - (20 * Math.min(moisture, 100) / 100)} 12 ${22 - (20 * Math.min(moisture, 100) / 100)} T 24 ${22 - (20 * Math.min(moisture, 100) / 100)};
                           M 0 ${22 - (20 * Math.min(moisture, 100) / 100)} Q 6 ${21.5 - (20 * Math.min(moisture, 100) / 100)} 12 ${22 - (20 * Math.min(moisture, 100) / 100)} T 24 ${22 - (20 * Math.min(moisture, 100) / 100)}
                         `}
                         dur="4s" 
                         repeatCount="indefinite" 
                       />
                     </path>
                   </g>

                  {/* Reflection Highlight for 3D effect */}
                  <path 
                    d="M15 8c0 0-1.5 2-1.5 4" 
                    stroke="white" 
                    strokeWidth="1.5" 
                    strokeLinecap="round" 
                    opacity="0.4"
                    fill="none"
                  />
                </svg>

                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className={`text-lg font-black transition-colors duration-300 ${moisture > 45 ? 'text-white/95 drop-shadow-md' : 'text-blue-500'}`}>
                    {moisture}%
                  </span>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-[32px] p-6 shadow-sm border border-gray-50 flex flex-col items-center justify-center space-y-4">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Health</span>
              <div className="relative w-28 h-32 flex items-center justify-center">
                <Heart className={`w-24 h-24 ${health >= 80 ? 'text-red-500 fill-red-500' : 'text-red-400 fill-red-400'} animate-pulse translate-y-2`} strokeWidth={0} />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="text-lg font-black text-white drop-shadow-md">{health}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* New Plant Info & Actions Card */}
          <div className="bg-white/95 backdrop-blur-xl rounded-[40px] p-8 shadow-[0_20px_50px_rgba(0,0,0,0.08)] border border-white/60 animate-in fade-in slide-in-from-bottom-6 duration-700 relative z-20">
            {isEditing ? (
              <div className="mb-8">
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="bg-gray-50 border-2 border-[#6FCF97] rounded-2xl px-4 py-2 text-xl font-black text-gray-800 outline-none w-full shadow-inner"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button onClick={handleSaveEdit} className="p-3 bg-[#6FCF97] text-white rounded-xl shadow-md hover:shadow-lg transition-all active:scale-90"><Check className="w-5 h-5" /></button>
                    <button onClick={handleCancelEdit} className="p-3 bg-gray-100 text-gray-400 rounded-xl hover:bg-gray-200 transition-all active:scale-90"><X className="w-5 h-5" /></button>
                  </div>
                </div>
                <input
                  type="text"
                  value={editSpecies}
                  onChange={(e) => setEditSpecies(e.target.value)}
                  placeholder="品種名稱 (選填)"
                  className="mt-3 bg-gray-50/50 border border-gray-100 rounded-xl px-4 py-2 text-sm font-bold text-gray-500 outline-none w-full mb-4"
                />

                <div className="flex w-full gap-3 p-1.5 bg-gray-50/50 rounded-2xl border border-gray-100/50">
                  <button
                    onClick={() => setEditType('indoor')}
                    className={`
                      flex-1 flex items-center justify-center gap-2.5 py-3 rounded-xl transition-all duration-300
                      ${editType === 'indoor' 
                        ? 'bg-white text-[#6FCF97] shadow-md font-black scale-[1.02]' 
                        : 'text-gray-400 hover:text-gray-600'}
                    `}
                  >
                    <Home className="w-5 h-5" />
                    <span className="text-sm">室內</span>
                  </button>
                  <button
                    onClick={() => setEditType('outdoor')}
                    className={`
                      flex-1 flex items-center justify-center gap-2.5 py-3 rounded-xl transition-all duration-300
                      ${editType === 'outdoor' 
                        ? 'bg-white text-[#6FCF97] shadow-md font-black scale-[1.02]' 
                        : 'text-gray-400 hover:text-gray-600'}
                    `}
                  >
                    <Trees className="w-5 h-5" />
                    <span className="text-sm">室外</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-row justify-between items-start mb-8">
                <div className="flex-1 min-w-0 pr-4">
                  <div className="flex items-center gap-3 group">
                    <h2 className="text-3xl font-black text-gray-800 leading-tight truncate">{plant.name}</h2>
                    <button 
                      onClick={() => setIsEditing(true)} 
                      className="p-1.5 text-gray-300 hover:text-[#6FCF97] hover:bg-green-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1.5 leading-relaxed truncate flex items-center gap-2">
                    {plant.type === 'indoor' ? <Home className="w-3 h-3" /> : <Trees className="w-3 h-3" />}
                    <span className="scale-90 origin-left">{plant.species || 'Common Species'}</span>
                  </p>
                </div>
                <div className={`shrink-0 px-4 py-2 rounded-2xl flex items-center gap-2 shadow-sm border ${
                  health >= 80 ? 'bg-green-50 border-green-100 text-green-600' : 
                  health >= 50 ? 'bg-orange-50 border-orange-100 text-orange-600' : 
                  'bg-red-50 border-red-100 text-red-600'
                }`}>
                  <Heart className={`w-4 h-4 ${
                    health >= 80 ? 'fill-green-500 text-green-500 animate-pulse' : 
                    health >= 50 ? 'fill-orange-500 text-orange-500' : 
                    'fill-red-500 text-red-500 animate-bounce'
                  }`} />
                  <span className="text-[13px] font-black tracking-tight">健康 {health}%</span>
                </div>
              </div>
            )}

            {/* 數據卡片區域 */}
            <div className="flex flex-row gap-4 mb-8">
              {/* 濕度卡片 */}
              <div className="flex-1 bg-blue-50/50 p-5 rounded-[28px] border border-blue-100/30 hover:bg-blue-50 transition-colors group flex flex-col justify-between min-h-[140px]">
                <div>
                  <div className="flex items-center gap-2 text-blue-500 font-black mb-3 text-xs uppercase tracking-widest opacity-80 h-6">
                    <Droplet className="w-4 h-4 fill-current group-hover:scale-125 transition-transform duration-300" /> 濕度
                  </div>
                  <div className="text-xl font-black text-blue-900 leading-tight h-14 flex items-center">
                    {plant.dailyRecommendation?.moisture || "50-70%"}
                  </div>
                </div>
                <div className="text-[10px] font-bold text-blue-400 mt-3 uppercase tracking-wider flex items-center gap-1.5 h-4">
                  <div className="w-1 h-1 rounded-full bg-blue-300" />
                  當前狀態: {moisture}%
                </div>
              </div>

              {/* 日照卡片 */}
              <div className="flex-1 bg-orange-50/50 p-5 rounded-[28px] border border-orange-100/30 hover:bg-orange-50 transition-colors group flex flex-col justify-between min-h-[140px]">
                <div>
                  <div className="flex items-center gap-2 text-orange-500 font-black mb-3 text-xs uppercase tracking-widest opacity-80 h-6">
                    <span className="text-base group-hover:rotate-12 transition-transform duration-300">☀️</span> 日照
                  </div>
                  <div className="text-xl font-black text-orange-900 leading-tight h-14 flex items-center">
                    {plant.dailyRecommendation?.sunlight || "明亮散射光"}
                  </div>
                </div>
                <div className="text-[10px] font-bold text-orange-400 mt-3 uppercase tracking-wider flex items-center gap-1.5 h-4">
                  <div className="w-1 h-1 rounded-full bg-orange-300" />
                  建議 {plant.dailyRecommendation?.sunlight?.match(/\d+/)?.[0] || '6'} 小時
                </div>
              </div>
            </div>

            {/* 按鈕組：主要動作（更新照片/分析） */}
            <div className="space-y-4">
              <button 
                onClick={handlePhotoAnalysis}
                disabled={isPhotoAnalyzing}
                className={`
                  w-full h-14 rounded-[24px] flex flex-row justify-center items-center gap-3 shadow-[0_10px_25px_rgba(111,207,151,0.25)] transition-all active:scale-[0.97] hover:shadow-[0_15px_30px_rgba(111,207,151,0.35)]
                  ${isPhotoAnalyzing 
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                    : 'bg-gradient-to-r from-[#6FCF97] to-[#4CAF50] text-white font-black text-lg'}
                `}
              >
                {isPhotoAnalyzing ? (
                  <div className="w-6 h-6 border-3 border-gray-300 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Camera className="w-5 h-5" />
                    <span className="tracking-tight">📸 照片診斷分析</span>
                  </>
                )}
              </button>

              <div className="flex flex-row gap-3">
                <button 
                  onClick={handleStartAnalysis}
                  disabled={isAnalyzing}
                  className={`
                    flex-[3] h-12 rounded-[20px] flex items-center justify-center gap-2.5 transition-all active:scale-95 border border-gray-100
                    ${isAnalyzing 
                      ? 'bg-gray-50 text-gray-300' 
                      : 'bg-gray-50 text-gray-600 font-black text-sm hover:bg-gray-100 hover:text-gray-800'}
                  `}
                >
                  {isAnalyzing ? (
                    <div className="w-4 h-4 border-2 border-gray-200 border-t-gray-400 rounded-full animate-spin" />
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-[#6FCF97]" />
                      <span>啟動 AI 深度報告</span>
                    </>
                  )}
                </button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button className="flex-1 h-12 rounded-[20px] bg-red-50 flex items-center justify-center text-red-500 hover:bg-red-100 transition-all active:scale-90 border border-red-100/50">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="rounded-[40px] border-none p-8">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-2xl font-black text-gray-800 flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-2xl bg-red-50 flex items-center justify-center">
                          <AlertTriangle className="w-6 h-6 text-red-500" />
                        </div>
                        確認刪除？
                      </AlertDialogTitle>
                      <AlertDialogDescription className="text-gray-500 font-bold text-base leading-relaxed">
                        這將會永久移除「{plant.name}」的所有紀錄，包含 AI 診斷報告與照片。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="mt-8 gap-3">
                      <AlertDialogCancel className="flex-1 h-14 rounded-2xl border-2 border-gray-100 font-black text-gray-400 hover:bg-gray-50 transition-colors">取消</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={() => onDelete(plant.id)}
                        className="flex-1 h-14 bg-red-500 hover:bg-red-600 text-white rounded-2xl font-black text-lg shadow-lg shadow-red-200 border-none"
                      >
                        確定刪除
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>

            {/* AI 建議刷新狀態提示 */}
            <div className="mt-6 flex items-center justify-center gap-2 py-2 bg-gray-50/50 rounded-full border border-gray-100/30">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shadow-[0_0_8px_rgba(74,207,151,0.4)]" />
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Daily AI Advice Updated</span>
            </div>
          </div>

          {/* ESP32-CAM Section */}
          {plant.cameraId && (
            <div className="mt-6 pt-6 border-t border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                    <Video className="w-4 h-4 text-green-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-gray-800">ESP32-CAM 遠端快照</h3>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div className={`flex items-center gap-1 text-white text-[8px] font-black px-1.5 py-0.5 rounded-md shadow-sm transition-colors ${
                        plant.isConnected ? 'bg-green-500' : 'bg-red-500/80'
                      }`}>
                        <div className={`w-1 h-1 rounded-full bg-white ${plant.isConnected ? 'animate-pulse' : ''}`} />
                        <span>{plant.isConnected ? 'CONNECTED' : 'OFFLINE'}</span>
                      </div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{plant.cameraId}</p>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={handleRefreshCam}
                  disabled={isCamLoading}
                  className="p-2 rounded-xl bg-gray-50 text-gray-400 hover:text-green-500 hover:bg-green-50 transition-all active:scale-90"
                >
                  <RefreshCw className={`w-4 h-4 ${isCamLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
              
              <div className="relative aspect-video rounded-2xl overflow-hidden bg-gray-900 shadow-inner group">
                <img 
                  src={camImageSrc || plant.latestEspPhoto || `${CAM_BASE_URL}/api/image?t=${camImageKey}`}
                  alt="ESP32-CAM Feed"
                  className={`w-full h-full object-cover transition-opacity duration-500 ${isCamLoading ? 'opacity-50' : 'opacity-100'}`}
                  onError={(e) => {
                    if (plant.latestEspPhoto) {
                      (e.target as HTMLImageElement).src = plant.latestEspPhoto;
                    } else {
                      (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1592150621344-c7a43183c48b?q=80&w=2069&auto=format&fit=crop';
                    }
                  }}
                />
                
                {/* Overlay status */}
                <div className="absolute top-3 left-3 flex items-center gap-2">
                  <div className="px-2 py-1 rounded-lg bg-black/40 backdrop-blur-md border border-white/10 flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#6FCF97]" />
                    <span className="text-[10px] font-black text-white uppercase tracking-widest">Snapshot</span>
                  </div>
                </div>
                
                {isCamLoading && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <RefreshCw className="w-8 h-8 text-white animate-spin" />
                  </div>
                )}
                
                {/* Camera control hint */}
                <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 to-transparent opacity-100 transition-opacity">
                  <div className="flex justify-between items-end">
                    <p className="text-white text-[10px] font-medium opacity-80">影像來源: Render Cloud Server</p>
                    {camTimestamp && (
                      <div className="text-right">
                        <p className="text-[10px] font-black text-[#6FCF97] uppercase tracking-tighter">Last Captured</p>
                        <p className="text-xs font-black text-white">{camTimestamp}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

        {/* 健康分析結果：顯示在圖示下方 */}
        {plant.healthAnalysis && (
          <div ref={photoAnalysisRef} className="mt-6 space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-1.5 h-4 rounded-full ${plant.healthAnalysis.isHealthy ? 'bg-green-400' : 'bg-red-400'}`} />
              <div className="flex-1 flex items-center justify-between">
                <div className="text-xs font-black text-gray-400 uppercase tracking-widest">照片分析結果</div>
                {plant.health !== undefined && (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 bg-gray-50 rounded-full">
                    <Heart className={`w-3 h-3 ${plant.health > 80 ? 'text-green-400' : plant.health > 50 ? 'text-orange-400' : 'text-red-400'}`} fill="currentColor" />
                    <span className="text-[10px] font-black text-gray-600">健康度 {plant.health}%</span>
                  </div>
                )}
              </div>
            </div>
            {plant.healthAnalysis.isHealthy ? (
              <div className="bg-white border border-green-50 rounded-[24px] p-6 text-center shadow-sm">
                <p className="text-sm font-bold text-gray-500 leading-relaxed">
                  目前未偵測到明顯病害或風險，請持續觀察日照與澆水狀況。
                </p>
              </div>
            ) : plant.healthAnalysis.diseases && plant.healthAnalysis.diseases.length > 0 ? (
              <Accordion type="multiple" className="space-y-4">
                {plant.healthAnalysis.diseases.map((disease: any, idx: number) => (
                  <AccordionItem 
                    key={idx} 
                    value={`disease-${idx}`}
                    className="bg-white border border-red-50 rounded-[24px] px-5 shadow-[0_4px_20px_rgba(0,0,0,0.03)] border-b-0"
                  >
                    <AccordionTrigger className="hover:no-underline py-5">
                      <div className="flex items-start justify-between w-full pr-2 gap-3">
                        <span className="text-base font-black text-gray-800 text-left flex-1">{disease.name}</span>
                        <span className="text-[10px] font-black px-2 py-1 bg-red-50 text-red-500 rounded-full shrink-0 mt-0.5">
                          {(disease.probability * 100).toFixed(1)}% 匹配度
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-5 pt-0">
                      {disease.cause && (
                        <div className="mb-4">
                          <div className="text-[10px] font-black text-red-400 uppercase mb-1">病因</div>
                          <p className="text-sm text-gray-600 leading-relaxed font-bold">{disease.cause}</p>
                        </div>
                      )}
                      {disease.watering && (
                        <div className="mb-4">
                          <div className="text-[10px] font-black text-blue-400 uppercase mb-1">水分建議</div>
                          <p className="text-sm text-gray-600 leading-relaxed font-bold">{disease.watering}</p>
                        </div>
                      )}
                      {disease.treatment && (
                        <div className="space-y-3">
                          {typeof disease.treatment === 'string' ? (
                            <div>
                              <div className="text-[10px] font-black text-green-500 uppercase mb-1">救治建議</div>
                              <p className="text-sm text-gray-600 leading-relaxed font-bold">{disease.treatment}</p>
                            </div>
                          ) : (
                            <>
                              {disease.treatment.biological && (
                                <div>
                                  <div className="text-[10px] font-black text-green-500 uppercase mb-1">生物防治</div>
                                  <p className="text-sm text-gray-600 leading-relaxed">
                                    {Array.isArray(disease.treatment.biological) ? disease.treatment.biological.join('、') : disease.treatment.biological}
                                  </p>
                                </div>
                              )}
                              {disease.treatment.chemical && (
                                <div>
                                  <div className="text-[10px] font-black text-blue-500 uppercase mb-1">化學防治</div>
                                  <p className="text-sm text-gray-600 leading-relaxed">
                                    {Array.isArray(disease.treatment.chemical) ? disease.treatment.chemical.join('、') : disease.treatment.chemical}
                                  </p>
                                </div>
                              )}
                              {disease.treatment.prevention && (
                                <div>
                                  <div className="text-[10px] font-black text-orange-500 uppercase mb-1">預防措施</div>
                                  <p className="text-sm text-gray-600 leading-relaxed">
                                    {Array.isArray(disease.treatment.prevention) ? disease.treatment.prevention.join('、') : disease.treatment.prevention}
                                  </p>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            ) : (
              <div className="bg-white border border-gray-100 rounded-[24px] p-6 text-center shadow-sm">
                <p className="text-sm font-bold text-gray-400 leading-relaxed">
                  雖然檢測到健康風險，但目前無法確定具體的病名。<br/>
                  建議檢查光照、水分與通風狀況。
                </p>
              </div>
            )}
          </div>
        )}

        {analysisError && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5" />
            <div className="text-xs text-red-700 leading-relaxed">
              {analysisError}
            </div>
          </div>
        )}

        {/* AI Analysis Result Section */}
        {showAnalysis && (
          <div ref={analysisRef} className="space-y-4 animate-in fade-in slide-in-from-bottom-6 duration-700 pb-12">
            <div 
              onClick={() => !isAnalysisExpanded && setIsAnalysisExpanded(true)}
              className={`
                bg-white rounded-[32px] p-7 shadow-[0_12px_40px_rgba(0,0,0,0.06)] border border-green-50/50 relative overflow-hidden group transition-all duration-500
                ${!isAnalysisExpanded ? 'cursor-pointer hover:shadow-[0_15px_45px_rgba(111,207,151,0.1)] active:scale-[0.98]' : ''}
              `}
            >
              {/* Background Glow */}
              <div className="absolute -right-10 -top-10 w-32 h-32 bg-green-50 rounded-full blur-3xl opacity-60 group-hover:opacity-100 transition-opacity" />
              
              <div className="flex items-center justify-between mb-6 relative z-10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#6FCF97] to-[#5db885] flex items-center justify-center shadow-[0_4px_12px_rgba(111,207,151,0.2)]">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-gray-800">AI 養護分析報告</h3>
                    <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Smart Care Report</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsAnalysisExpanded(!isAnalysisExpanded);
                    }}
                    className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-400"
                  >
                    {isAnalysisExpanded ? <X className="w-4 h-4" /> : <Sparkles className="w-4 h-4 text-[#6FCF97]" />}
                  </button>
                  {isAnalysisExpanded && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowAnalysis(false);
                        onUpdate({
                          ...plant,
                          aiAnalysis: undefined
                        });
                      }}
                      className="p-2 rounded-xl hover:bg-red-50 transition-colors text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {!isAnalysisExpanded ? (
                <div className="relative z-10 flex items-center justify-between">
                  <p className="text-sm font-bold text-gray-500 line-clamp-1 flex-1 pr-4">
                    {currentAnalysis.text.split('\n')[0].replace(/\*|\#/g, '') || '點擊展開查看完整的養護建議...'}
                  </p>
                  <div className="text-[10px] font-black text-[#6FCF97] uppercase tracking-widest bg-green-50 px-2 py-1 rounded-lg">
                    點擊展開
                  </div>
                </div>
              ) : (
                <>
                  <div className="relative z-10">
                    <div className="space-y-6">
                      {parseAnalysisText(currentAnalysis.text).map((section, idx) => (
                        <div key={idx} className="space-y-2">
                          <h4 className="text-base font-black text-gray-800 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#6FCF97]" />
                            {section.title}
                          </h4>
                          <div className="text-sm text-gray-600 leading-relaxed font-bold pl-3.5 border-l-2 border-green-50/50 whitespace-pre-wrap">
                            {section.content}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-6 relative z-10 border-t border-gray-100 mt-8">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                      <div className="text-[10px] text-gray-400 font-bold italic">Generated by Gemini AI</div>
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-green-50 rounded-full border border-green-100">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                      <span className="text-[10px] font-black text-green-600 uppercase">Analysis Complete</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>

    {/* Floating AI Analysis Completion Tip */}
      {showCompleteTip && (
        <div className="fixed bottom-24 left-0 right-0 flex justify-center z-50 animate-in slide-in-from-bottom-4 duration-300 pointer-events-none">
          <button 
            onClick={scrollToAnalysis}
            className="bg-[#6FCF97] text-white px-4 py-2 rounded-full text-xs font-black shadow-[0_4px_12px_rgba(111,207,151,0.3)] flex items-center gap-1.5 active:scale-95 transition-all hover:bg-[#5db885] animate-bounce pointer-events-auto"
          >
            <Sparkles className="w-3.5 h-3.5" />
            AI 分析完成 ✨
          </button>
        </div>
      )}

      {/* Floating Photo Analysis Completion Tip */}
      {showPhotoCompleteTip && (
        <div className="fixed bottom-36 left-0 right-0 flex justify-center z-50 animate-in slide-in-from-bottom-4 duration-300 pointer-events-none">
          <button 
            onClick={scrollToPhotoAnalysis}
            className="bg-[#4A90E2] text-white px-4 py-2 rounded-full text-xs font-black shadow-[0_4px_12px_rgba(74,144,226,0.3)] flex items-center gap-1.5 active:scale-95 transition-all hover:bg-[#357ABD] animate-bounce pointer-events-auto"
          >
            <Camera className="w-3.5 h-3.5" />
            照片分析完成 ✨
          </button>
        </div>
      )}

    </div>
  );
});

export default PlantDetailView;

