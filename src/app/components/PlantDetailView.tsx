import { useState, useEffect, useRef, useMemo, memo } from 'react';
import { 
  ArrowLeft, 
  Droplet, 
  Sparkles, 
  Trash2, 
  AlertTriangle, 
  Home, 
  Trees, 
  Pencil, 
  Check, 
  X, 
  AlertCircle, 
  CheckCircle2,
  Video,
  RefreshCw
} from 'lucide-react';
import { PlantItem } from './PlantGrid';
import TimeWeatherHeader from './TimeWeatherHeader';
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
  } | null;
}

interface AnalysisReport {
  text: string;
}

const DEFAULT_ANALYSIS: AnalysisReport = {
  text: '分析中...'
};

const PlantDetailView = memo(function PlantDetailView({ plant, onBack, onUpdate, onDelete, onScroll, initialScrollY = 0, externalWeather }: PlantDetailViewProps) {
  const CAM_BASE_URL = 'https://esp32-cam-relay-oqmh.onrender.com';
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(plant.name);
  const [editSpecies, setEditSpecies] = useState(plant.species || '');
  const [editType, setEditType] = useState(plant.type);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
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

  const weather = externalWeather;
  const [isDailyLoading, setIsDailyLoading] = useState(false);
  const analysisRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasAutoAnalyzedRef = useRef<string | null>(null);
  const scrollYRef = useRef(0);
  const tickingRef = useRef(false);

  // 設計常數集中管理
  const SCROLL_CONFIG = {
    MAX_SCROLL: 400,        // 滑 400px 就縮完 (580 - 180)
    MAX_HEIGHT: 580,        // 初始高度 (2/3 畫面)
    MIN_HEIGHT: 180,        // 縮小後的最終高度
    MIN_SCALE: 0.55,        // 3D 人物最小縮放
  };

  const { MAX_SCROLL, MAX_HEIGHT, MIN_HEIGHT, MIN_SCALE } = SCROLL_CONFIG;

  // 檢查並生成每日養護建議
  useEffect(() => {
    if (!weather) return;
    if (isDailyLoading) return;

    const today = new Date().toISOString().split('T')[0];
    const needsUpdate = !plant.dailyRecommendation || plant.dailyRecommendation.lastUpdated !== today;

    if (needsUpdate) {
      const fetchDailyCare = async () => {
        setIsDailyLoading(true);
        try {
          const response = await fetch("/api/daily-care", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              plantName: plant.name, 
              species: plant.species,
              weather
            }),
          });
          const data = await response.json();
          if (data.success) {
            onUpdate({
              ...plant,
              dailyRecommendation: {
                moisture: data.moisture,
                sunlight: data.sunlight,
                lastUpdated: today
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
  }, [plant.id, weather?.temp, weather?.condition]);

  // 監測 AI 分析區域是否進入視野
  useEffect(() => {
    if (!showCompleteTip || !analysisRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShowCompleteTip(false);
        }
      },
      { threshold: 0.5 } // 當一半的分析區域可見時隱藏提示
    );

    observer.observe(analysisRef.current);
    return () => observer.disconnect();
  }, [showCompleteTip, showAnalysis]);

  // 當外部 plant 改變時同步內部編輯狀態
  useEffect(() => {
    setEditName(plant.name);
    setEditSpecies(plant.species || '');
    setEditType(plant.type);
    setIsVerified(false);
    setAnalysisError(null);
    setShowCompleteTip(false);
    
    // 如果外部傳入的 plant 帶有分析結果，同步到內部狀態
    if (plant.aiAnalysis) {
      setCurrentAnalysis({ text: plant.aiAnalysis });
      setShowAnalysis(true);
    } else {
      setShowAnalysis(false);
      setCurrentAnalysis(DEFAULT_ANALYSIS);
    }
  }, [plant.id]); // 改為監聽 ID 即可

  const analyzeImageWithHF = async (imageUrl: string | null, plantName: string, species?: string, moisture?: number) => {
    try {
      setAnalysisError(null);
      const response = await fetch("/api/analyze-plant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          imageUrl, 
          plantName, 
          species,
          currentMoisture: moisture, // 傳遞當前濕度
          dailyStandard: plant.dailyRecommendation // 傳遞今日標準
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const message =
          typeof data.error === "string"
            ? data.error
            : "AI 分析發生錯誤，請稍後再試。";
        console.error("Backend Analysis Error:", message);
        setAnalysisError(message);
        return null;
      }

      if (data.error && !data.success) {
        const message =
          typeof data.error === "string"
            ? data.error
            : "AI 分析未成功，請稍後再試。";
        setAnalysisError(message);
        return null;
      }

      if (data.success && data.analysis) {
        return {
          text: data.analysis
        } as AnalysisReport;
      }

      setAnalysisError("AI 分析未成功，請稍後再試。");
    } catch (error) {
      console.error("Fetch Analysis Error:", error);
      setAnalysisError("無法連線至 AI 分析服務，請檢查網路後重試。");
    }
    return null;
  };

  // 當進入頁面時，檢查是否需要自動分析
  useEffect(() => {
    if (hasAutoAnalyzedRef.current === plant.id) return;

    const triggerAutoAnalysis = async () => {
      // 如果已經有分析結果，則直接顯示，不重複觸發 API
      if (plant.aiAnalysis) {
        setCurrentAnalysis({ text: plant.aiAnalysis });
        setShowAnalysis(true);
        hasAutoAnalyzedRef.current = plant.id;
        return;
      }

      // 如果沒有分析結果，且目前不在分析中，則自動觸發
      if (!isAnalyzing && !analysisError) {
        hasAutoAnalyzedRef.current = plant.id;
        handleStartAnalysis();
      }
    };

    triggerAutoAnalysis();
  }, [plant.id]); // 只在植物 ID 改變時觸發

  const handleStartAnalysis = async () => {
    // 即使已經有分析結果，手動點擊按鈕也會強制重新分析
    setIsAnalyzing(true);
    setShowAnalysis(false);
    setAnalysisError(null);
    setShowCompleteTip(false);

    const analysisResult = await analyzeImageWithHF(
      plant.latestEspPhoto || plant.imageUrl || null, 
      plant.name, 
      plant.species,
      plant.moisture ?? 50 // 傳入當前濕度值
    );
    
    if (analysisResult) {
      setCurrentAnalysis(analysisResult);
      setShowAnalysis(true);
      setShowCompleteTip(true); // 顯示完成提示
      // 更新持久化儲存
      onUpdate({
        ...plant,
        aiAnalysis: analysisResult.text
      });
    }

    setIsAnalyzing(false);
  };

  const scrollToAnalysis = () => {
    analysisRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setShowCompleteTip(false);
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

  const isMoistureLow = (() => {
    const match = (plant.dailyRecommendation?.moisture || "50%").match(/\d+/);
    const recommended = match ? parseInt(match[0]) : 50;
    return moisture < recommended;
  })();

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const st = e.currentTarget.scrollTop;
    if (st === scrollYRef.current) return;
    scrollYRef.current = st;
    onScroll?.(st);
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
    <div className="w-full h-full relative bg-[#F6FAF7] overflow-hidden flex flex-col">
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
      <div className="absolute top-0 left-0 w-full z-50 pointer-events-none">
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
        style={{ WebkitOverflowScrolling: 'touch', willChange: 'scroll-position' }}
      >
        <div className="px-6 pb-24 space-y-6">
          {/* Spacer to push content below the absolute header */}
          <div style={{ height: `${MAX_HEIGHT}px` }} className="w-full shrink-0 pointer-events-none" />

          {/* New Plant Info & Actions Card - Removed extra margin-top since spacer is now fixed */}
          <div className="bg-white/90 backdrop-blur-xl rounded-[32px] p-6 shadow-[0_12px_40px_rgba(0,0,0,0.06)] border border-white/50 animate-in fade-in slide-in-from-bottom-4 duration-500 relative z-20">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              {isEditing ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="bg-gray-50 border-2 border-[#6FCF97] rounded-xl px-3 py-1.5 text-lg font-black text-gray-800 outline-none w-full"
                    autoFocus
                  />
                  <div className="flex gap-1">
                    <button onClick={handleSaveEdit} className="p-2 bg-[#6FCF97] text-white rounded-lg"><Check className="w-4 h-4" /></button>
                    <button onClick={handleCancelEdit} className="p-2 bg-gray-100 text-gray-400 rounded-lg"><X className="w-4 h-4" /></button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <h2 className="text-3xl font-black text-gray-800 truncate">{plant.name}</h2>
                    <button onClick={() => setIsEditing(true)} className="p-1.5 text-gray-400 hover:text-[#6FCF97]"><Pencil className="w-4 h-4" /></button>
                  </div>
                  <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mt-1">{plant.species || 'Common Species'}</p>
                  
                  {/* Daily Care Recommendation Section */}
                  <div className="mt-4 flex items-center gap-3">
                    <div className="flex flex-col">
                      <div className="text-[10px] font-black text-blue-500 uppercase tracking-tighter">建議濕度</div>
                      <div className="text-sm font-black text-gray-700">
                        {isDailyLoading ? "..." : (plant.dailyRecommendation?.moisture || "50%")}
                      </div>
                    </div>
                    <div className="w-px h-8 bg-gray-100" />
                    <div className="flex flex-col">
                      <div className="text-[10px] font-black text-orange-500 uppercase tracking-tighter">建議日照</div>
                      <div className="text-sm font-black text-gray-700">
                        {isDailyLoading ? "..." : (plant.dailyRecommendation?.sunlight || "4小時")}
                      </div>
                    </div>
                    <div className="ml-auto">
                      <div className="px-2 py-0.5 rounded-full bg-gray-50 border border-gray-100 text-[9px] font-bold text-gray-400 flex items-center gap-1">
                        <div className="w-1 h-1 rounded-full bg-gray-300" />
                        每日自動刷新
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex flex-col gap-2">
              <button 
                onClick={handleStartAnalysis}
                disabled={isAnalyzing}
                className={`
                  flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl transition-all active:scale-95 shadow-md
                  ${isAnalyzing 
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                    : 'bg-gradient-to-br from-[#6FCF97] to-[#5db885] text-white font-bold'}
                `}
              >
                {isAnalyzing ? <div className="w-4 h-4 border-2 border-gray-300 border-t-white rounded-full animate-spin" /> : <Sparkles className="w-4 h-4" />}
                <span className="text-sm">AI 分析</span>
              </button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button className="flex items-center justify-center gap-2 px-4 py-2 rounded-2xl bg-red-50 text-red-500 hover:bg-red-100 transition-colors font-bold text-sm">
                    <Trash2 className="w-4 h-4" />
                    <span>刪除</span>
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent className="rounded-[32px] border-none">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-xl font-black text-gray-800 flex items-center gap-2">
                      <AlertTriangle className="w-6 h-6 text-red-500" />
                      確認刪除？
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-gray-500 font-medium">
                      刪除後資料將無法復原，你確定要告別「{plant.name}」嗎？
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter className="gap-2">
                    <AlertDialogCancel className="rounded-2xl border-gray-100 font-bold">先不要</AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={() => onDelete(plant.id)}
                      className="bg-red-500 hover:bg-red-600 text-white rounded-2xl font-bold border-none"
                    >
                      確定刪除
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
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
        </div>

        {/* Plant Type & Species Card */}
        <div className="bg-white rounded-[32px] p-6 shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-gray-50/50 group hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)] transition-all duration-500">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div className="w-2 h-6 bg-[#6FCF97] rounded-full" />
              <div className="text-xs font-black text-gray-400 uppercase tracking-widest">Plant Category</div>
            </div>
            {isEditing && (
              <div className="px-2 py-1 bg-green-50 rounded-lg text-[10px] font-black text-[#6FCF97] uppercase tracking-wider animate-pulse">
                Editing
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            {isEditing ? (
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
            ) : (
              <div className="flex items-center gap-5 w-full">
                <div className={`
                  p-4 rounded-[24px] shadow-sm transition-transform group-hover:scale-110 duration-500
                  ${plant.type === 'indoor' ? 'bg-blue-50 text-blue-500 shadow-blue-100/50' : 'bg-orange-50 text-orange-500 shadow-orange-100/50'}
                `}>
                  {plant.type === 'indoor' ? <Home className="w-7 h-7" /> : <Trees className="w-7 h-7" />}
                </div>
                <div>
                  <div className="text-xl font-black text-gray-800 tracking-tight">
                    {plant.type === 'indoor' ? '室內植物' : '室外植物'}
                  </div>
                  <div className="text-xs font-bold text-gray-400/80 mt-0.5">{plant.species || 'General Species'}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Moisture & Health Status */}
        <div className="grid grid-cols-2 gap-4">
          {/* Moisture Card with Water Drop Wave */}
          <div className="bg-white rounded-[32px] p-6 shadow-[0_8px_24px_rgba(0,0,0,0.06)] flex flex-col items-center justify-center relative overflow-hidden">
            <div className="flex items-center gap-1.5 mb-4 z-10">
              <div className="text-sm font-bold text-gray-400 uppercase tracking-widest">Moisture</div>
              {isMoistureLow && (
                <AlertTriangle className="w-4 h-4 text-blue-500 animate-pulse" />
              )}
            </div>
            
            {/* Water Drop Shape Container */}
            <div className="relative w-24 h-32 mb-4 z-10">
              {/* Drop SVG Mask */}
              <svg viewBox="0 0 100 140" className="w-full h-full drop-shadow-lg">
                <defs>
                  <clipPath id="dropClip">
                    <path d="M50 0C50 0 0 45 0 85C0 115 22.5 140 50 140C77.5 140 100 115 100 85C100 45 50 0 50 0Z" />
                  </clipPath>
                </defs>
                
                {/* Background of the drop */}
                <path 
                  d="M50 0C50 0 0 45 0 85C0 115 22.5 140 50 140C77.5 140 100 115 100 85C100 45 50 0 50 0Z" 
                  fill="#E0F2FE" 
                />

                {/* Animated Water Body */}
                <g clipPath="url(#dropClip)">
                  {/* Outer group handles vertical position to avoid CSS animation conflict */}
                   <g style={{ transform: `translateY(${(1 - moisture / 100) * 140 - 10}px)`, transition: 'transform 1s ease-out' }}>
                     {/* Wave Effect Layer - This is the main fill */}
                     <path
                       d="M-50 20 Q0 0 50 20 T150 20 V200 H-50 Z"
                       fill="#2563EB" 
                       className="water-wave"
                       style={{ opacity: 1 }}
                     />
                     {/* Second Wave Layer for depth */}
                     <path
                       d="M-50 20 Q25 40 75 20 T150 20 V200 H-50 Z"
                       fill="#3B82F6"
                       className="water-wave"
                       style={{ 
                         opacity: 0.6,
                         animationDirection: 'reverse',
                         animationDuration: '6s',
                         transform: 'translateY(5px)'
                       }}
                     />
                   </g>
                </g>
                
                {/* Drop Highlight/Reflection */}
                <path 
                  d="M30 85C30 75 35 65 40 60" 
                  stroke="white" 
                  strokeWidth="4" 
                  strokeLinecap="round" 
                  style={{ opacity: 0.4 }}
                />
              </svg>
              
              {/* Percentage Text inside drop */}
              <div className="absolute inset-0 flex items-center justify-center pt-8">
                <span className="text-xl font-black text-white drop-shadow-md">{moisture}%</span>
              </div>
            </div>
          </div>

          {/* Health Card with Heart */}
          <div className="bg-white rounded-[32px] p-6 shadow-[0_8px_24px_rgba(0,0,0,0.06)] flex flex-col items-center justify-center relative overflow-hidden">
            <div className="flex items-center gap-1.5 mb-4 z-10">
              <div className="text-sm font-bold text-gray-400 uppercase tracking-widest">Health</div>
              {health < 40 && (
                <AlertTriangle className="w-4 h-4 text-red-500 animate-pulse" />
              )}
            </div>
            
            <div className="relative w-24 h-24 mb-4 z-10">
              {/* Heart SVG with dynamic fill */}
              <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-lg">
                <defs>
                  <clipPath id="heartClip">
                    <path d="M50 85C50 85 10 60 10 35C10 15 30 10 50 30C70 10 90 15 90 35C90 60 50 85 50 85Z" />
                  </clipPath>
                </defs>
                
                {/* Background of the heart */}
                <path 
                  d="M50 85C50 85 10 60 10 35C10 15 30 10 50 30C70 10 90 15 90 35C90 60 50 85 50 85Z" 
                  fill="#FEE2E2" 
                />

                {/* Animated Health Body */}
                <g clipPath="url(#heartClip)">
                   <g style={{ transform: `translateY(${(1 - health / 100) * 100}px)`, transition: 'transform 1s ease-out' }}>
                     <rect
                       x="0"
                       y="0"
                       width="100"
                       height="100"
                       fill="#EF4444" 
                     />
                   </g>
                </g>
              </svg>

              {/* Percentage Text inside heart */}
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xl font-black text-white drop-shadow-md">{health}%</span>
              </div>
            </div>
          </div>
        </div>

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
            <div className="bg-white rounded-[32px] p-7 shadow-[0_12px_40px_rgba(0,0,0,0.06)] border border-green-50/50 relative overflow-hidden group">
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
                <button 
                  onClick={() => {
                    setShowAnalysis(false);
                    onUpdate({
                      ...plant,
                      aiAnalysis: undefined
                    });
                  }}
                  className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="relative z-10 bg-gray-50/50 rounded-2xl p-6 border border-gray-100/50">
                <div className="text-[15px] text-gray-700 leading-relaxed whitespace-pre-wrap font-medium">
                  {currentAnalysis.text}
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 relative z-10">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  <div className="text-[10px] text-gray-400 font-bold italic">Generated by Hugging Face AI</div>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1 bg-green-50 rounded-full border border-green-100">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                  <span className="text-[10px] font-black text-green-600 uppercase">Analysis Complete</span>
                </div>
              </div>
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
    </div>
  );
});

export default PlantDetailView;

