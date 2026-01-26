import React from "react";
import { Leaf, Droplet, Heart, Video } from "lucide-react";

export interface PlantItem {
  id: string;
  name: string;
  species?: string;
  imageUrl?: string | null;
  moisture?: number; // 0-100
  health?: number;   // 0-100
  type: 'indoor' | 'outdoor';
  aiAnalysis?: string; // 儲存 AI 分析結果
  healthAnalysis?: {
    isHealthy: boolean;
    diseases?: Array<{
      name: string;
      probability: number;
      description?: string;
      cause?: string;
      watering?: string;
      treatment?: any;
    }>;
  }; // 儲存從 Gemini AI 獲取的健康分析結果數據
  cameraId?: string;   // ESP32-CAM 的 ID 或網址
  isConnected?: boolean; // 新增：ESP32 的連線狀態
  latestEspPhoto?: string; // 新增：最新的 ESP32 拍照
  dailyRecommendation?: {
    moisture: string;
    sunlight: string;
    lastUpdated: string; // ISO date string YYYY-MM-DD
    lastUpdatedTs?: number; // 新增：上次更新的時間戳
  };
}

interface PlantGridProps {
  plants: PlantItem[];
  onPlantClick?: (plant: PlantItem) => void;
}

// 統一色系，不同淡度 - 4色循環
const cardColors = [
  '#EAF6EE', // 淡薄荷綠
  '#F3F8ED', // 淡鼠尾草
  '#EDF5F3', // 淡藍綠
  '#F7F2E8', // 淡米色
];

function colorIndexFromId(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return h % cardColors.length;
}

interface PlantCardProps {
  plant: PlantItem;
  bgColor: string;
  onClick?: (plant: PlantItem) => void;
}

const PlantCard = React.memo(function PlantCard({ plant: p, bgColor, onClick }: PlantCardProps) {
  const [isLoaded, setIsLoaded] = React.useState(false);

  return (
    <div
      onClick={() => onClick?.(p)}
      className="relative rounded-3xl overflow-hidden shadow-md cursor-pointer transition-[transform,shadow] duration-300 hover:scale-[1.02] active:scale-95"
      style={{ 
        backgroundColor: bgColor,
        transform: 'translate3d(0,0,0)', // 使用 translate3d 確保 3D 加速
        backfaceVisibility: 'hidden',
        perspective: '1000px',
        willChange: 'transform',
        // @ts-ignore
        contentVisibility: 'auto',
        containIntrinsicSize: '0 200px'
      }}
    >
      {/* 圖片區 */}
      <div 
        className="aspect-[4/3] relative flex items-center justify-center overflow-hidden bg-gray-100"
        style={{ transform: 'translate3d(0,0,0)' }}
      >
        {/* 主要圖片：主頁卡片顯示原始封面圖 */}
        {p.imageUrl ? (
          <img
            src={p.imageUrl}
            alt={p.name}
            loading="lazy"
            decoding="async"
            onLoad={() => setIsLoaded(true)}
            className={`w-full h-full object-cover transition-opacity duration-500 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
            style={{ 
              transform: 'translate3d(0,0,0)',
              backfaceVisibility: 'hidden',
              imageRendering: 'auto'
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Leaf className="w-16 h-16 text-green-600/40" />
          </div>
        )}

        {/* 濕度與健康度標籤 - 移除 backdrop-blur 以提升縮放效能 */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5 pointer-events-none">
          <div className="flex items-center gap-1 bg-blue-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full border border-white/20 shadow-sm">
            <Droplet className="w-2.5 h-2.5 fill-current" /> {p.moisture ?? 50}%
          </div>
          <div className="flex items-center gap-1 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full border border-white/20 shadow-sm">
            <Heart className="w-2.5 h-2.5 fill-current" /> {p.health ?? 50}%
          </div>
        </div>
      </div>

      {/* 文字區 */}
      <div className="px-4 py-3 bg-white/90">
        <div className="flex items-center gap-1.5 mb-0.5">
          <div className="text-gray-800 text-base font-semibold truncate flex-1">
            {p.name}
          </div>
          {p.cameraId && (
            <div 
              className={`flex items-center gap-1 text-white text-[8px] font-black px-1.5 py-0.5 rounded-md shadow-sm shrink-0 transition-colors duration-500 ${
                p.isConnected ? 'bg-green-500' : 'bg-red-500/80'
              }`}
              style={{ transform: 'translate3d(0,0,0)' }}
            >
              <div className={`w-1 h-1 rounded-full bg-white ${p.isConnected ? 'animate-pulse' : ''}`} />
              <span>{p.isConnected ? 'CONNECTED' : 'OFFLINE'}</span>
              <span className="ml-0.5 opacity-80">({p.cameraId})</span>
            </div>
          )}
        </div>
        <div className="text-gray-600 text-xs font-medium truncate" title={p.species || "植物"}>
          {p.species || "植物"}
        </div>
      </div>
    </div>
  );
});

export default React.memo(function PlantGrid({ plants, onPlantClick }: PlantGridProps) {
  return (
    <div className="w-full px-0 pb-6 pt-4">
      <div className="grid grid-cols-2 gap-3 px-3">
        {plants.map((p) => (
          <PlantCard 
            key={p.id} 
            plant={p} 
            bgColor={cardColors[colorIndexFromId(p.id)]} 
            onClick={onPlantClick} 
          />
        ))}
      </div>
    </div>
  );
});
