import { useState, useEffect, useMemo, memo, useRef } from 'react';
import { Sun, Moon, ArrowUp, ArrowDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Character3D } from './Character3D';
import type { PlantItem } from './PlantGrid';

interface TimeWeatherHeaderProps {
  onAdd?: () => void;
  showMiniCharacter?: boolean;
  modelPath?: string;
  plants?: PlantItem[];
  selectedPlant?: PlantItem | null;
  customHeight?: number;
  customScale?: number;
  externalWeather?: {
    temp: number;
    high: number;
    low: number;
    condition: string;
    lastUpdated?: number;
  } | null;
  isExternalLoading?: boolean;
}

const TimeWeatherHeader = memo(function TimeWeatherHeader(props: TimeWeatherHeaderProps) {
  const { 
    onAdd, 
    showMiniCharacter, 
    modelPath, 
    plants = [], 
    selectedPlant, 
    customHeight, 
    customScale = 1, 
    externalWeather, 
    isExternalLoading = false 
  } = props; 

  /* ---------- Weather ---------- */ 
  const [internalWeather, setInternalWeather] = useState<{
    temp: number;
    high: number;
    low: number;
    condition: string;
    lastUpdated?: number;
  } | null>(null); 
  const [isInternalLoading, setIsInternalLoading] = useState(true); 

  const weather = externalWeather ?? internalWeather; 
  const isLoading = externalWeather ? isExternalLoading : isInternalLoading; 

  /* ---------- Time / Night ---------- */ 
  const [isNight, setIsNight] = useState(false); 
  const [timeSeed, setTimeSeed] = useState( 
    Math.floor(Date.now() / (5 * 60 * 1000)) 
  ); 

  // 當天氣更新時，同步更新對話種子
  useEffect(() => {
    if (weather?.lastUpdated) {
      setTimeSeed(Math.floor(weather.lastUpdated / (5 * 60 * 1000)));
    }
  }, [weather?.lastUpdated]);

  /* ---------- Scale related ---------- */ 
  const scrollProgress = useMemo( 
    () => Math.max(0, Math.min(1, (customScale - 0.55) / 0.45)), 
    [customScale] 
  ); 

  const inverseScale = useMemo( 
    () => 1 / (customScale * 1.1), 
    [customScale] 
  ); 

  /* ---------- Time seed ---------- */ 
  // 已移至與天氣同步，不再定時刷新

  /* ---------- Night check ---------- */ 
  useEffect(() => { 
    const update = () => { 
      const h = new Date().getHours(); 
      setIsNight(h >= 18 || h < 6); 
    }; 
    update(); 
    const t = setInterval(update, 60000); 
    return () => clearInterval(t); 
  }, []); 

  /* ---------- AI suggestion ---------- */ 
  const aiSuggestion = useMemo(() => { 
    if (isLoading) return '正在觀察天氣，請稍等一下喔...'; 
    if (!weather) return '今天也要開心地照顧植物喔！'; 

    let text = ''; 

    if (selectedPlant) { 
      const plantOffset = selectedPlant.id 
        .split('') 
        .reduce((a, c) => a + c.charCodeAt(0), 0); 

      const variant = (timeSeed + plantOffset) % 3; 

      const options = [ 
        `${selectedPlant.name} 看起來狀態不錯呢！`, 
        `今天也要多關心一下 ${selectedPlant.name} 喔。`, 
        `${selectedPlant.name} 正在努力成長中 🌱` 
      ]; 

      text = options[variant]; 
    } else { 
      if (plants.length === 0) { 
        text = '你的花園還是空的，快去添加第一棵植物吧！'; 
      } else { 
        text = isNight 
          ? '夜晚是植物休息的時間，早點休息吧！' 
          : '天氣不錯！正是觀察植物生長的好時機呢。'; 
      } 
    } 

    return text.length > 25 ? text.slice(0, 22) + '...' : text; 
  }, [ 
    isLoading, 
    weather, 
    selectedPlant, 
    plants.length, 
    isNight, 
    timeSeed 
  ]); 

  /* ---------- Animation Control ---------- */
  // 保持人物始終活躍，不再根據滑動暫停
  const isCharacterActive = true;

  /* ---------- Weather fetch ---------- */ 
  useEffect(() => { 
    if (externalWeather) return; 

    const fetchWeather = async () => { 
      setIsInternalLoading(true); 
      try { 
        const res = await fetch('https://ipapi.co/json/'); 
        const loc = await res.json(); 

        const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto`; 

        const response = await fetch(url);
        const data = await response.json(); 

        const mapWeatherCode = (code: number) => {
          if (code === 0) return '晴朗';
          if (code <= 3) return '多雲';
          if (code <= 48) return '有霧';
          if (code <= 57) return '毛毛雨';
          if (code <= 67) return '有雨';
          if (code <= 77) return '有雪';
          if (code <= 82) return '陣雨';
          if (code <= 86) return '陣雪';
          if (code <= 99) return '雷陣雨';
          return '晴朗';
        };

        setInternalWeather({ 
          temp: Math.round(data.current.temperature_2m), 
          high: Math.round(data.daily.temperature_2m_max[0]), 
          low: Math.round(data.daily.temperature_2m_min[0]), 
          condition: mapWeatherCode(data.current.weather_code)
        }); 
      } catch { 
        setInternalWeather({ temp: 25, high: 28, low: 20, condition: '晴朗' }); 
      } finally { 
        setIsInternalLoading(false); 
      } 
    }; 

    fetchWeather(); 
    const t = setInterval(fetchWeather, 30 * 60 * 1000);
    return () => clearInterval(t);
  }, [externalWeather]); 

  return (
    <div 
      className="w-full relative overflow-hidden pointer-events-none" 
      style={{ 
        height: customHeight ? `${customHeight}px` : 'auto',
        transformStyle: 'preserve-3d',
        backfaceVisibility: 'hidden',
        willChange: 'height'
      }}
    >
      {/* Background with landscape image */}
      <div 
        className="w-full relative overflow-hidden"
        style={{
          height: customHeight ? `${customHeight}px` : '320px',
          backgroundImage: 'url(/landscape-bg.jpg.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center 15%',
          backgroundRepeat: 'no-repeat',
          willChange: 'height',
          transform: 'translateZ(0)', // 強制硬體加速背景
        }}
      >
        {/* Overlay for better text readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-transparent"></div>
        
        {/* Bottom gradient mask to blend with background color #F6FAF7 */}
        <div 
          className="absolute inset-x-0 bottom-0 h-40 z-10 pointer-events-none"
          style={{
            background: 'linear-gradient(to bottom, transparent, rgba(246, 250, 231, 0.4) 30%, rgba(246, 250, 231, 0.8) 60%, #F6FAF7 100%)'
          }}
        ></div>

        {/* Character 3D - positioned at 1/3 height of the image, blended into background */}
        {showMiniCharacter && modelPath ? (
          <div 
            className="absolute left-1/2 w-64 h-64 pointer-events-none z-20" 
            style={{ 
              top: 0, 
              transform: `translate3d(-50%, calc(${customHeight ? customHeight * 0.62 : 198}px - 50%), 0) scale(${customScale * 1.1})`,
              filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.15))',
              opacity: 0.95,
              transformOrigin: 'center center',
              willChange: 'transform',
              transformStyle: 'preserve-3d',
              backfaceVisibility: 'hidden'
            }}
          >
            <Character3D modelPath={modelPath} isActive={isCharacterActive} />
            
            {/* AI Suggestion Bubble - Improved Mobile Version */}
            <AnimatePresence mode="wait">
              {aiSuggestion && (
                <motion.div 
                  key={selectedPlant ? selectedPlant.id : 'home'}
                  initial={{ opacity: 0, scale: 0.8, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8, y: 10 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  className="absolute left-1/2 top-0 max-w-[180px] w-fit px-2 z-30" 
                  style={{ 
                    x: `${20 - (scrollProgress * 15)}%`,
                    y: `${-scrollProgress * 95 + 35}%`,
                    scale: inverseScale,
                    transformOrigin: 'left bottom',
                    backfaceVisibility: 'hidden',
                    willChange: 'transform',
                    transformStyle: 'preserve-3d'
                  }} 
                >
                  <div className=" 
                    relative 
                    bg-white/95 
                    backdrop-blur-xl 
                    px-4 py-3 
                    rounded-2xl 
                    rounded-bl-md 
                    shadow-[0_12px_30px_rgba(0,0,0,0.18)] 
                    border border-white/70 
                  ">
                    <div className="absolute top-2 right-3 flex gap-1">
                      <div className="w-1 h-1 rounded-full bg-green-400/40 animate-pulse" />
                    </div>
                    <p className="text-[13px] font-semibold text-green-900/90 leading-relaxed">
                      {aiSuggestion}
                    </p>
                    
                    {/* Bubble tail - Arrow pointing to character */}
                    <div className="absolute -bottom-2 left-6 w-5 h-5">
                      <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path 
                          d="M0 0C4 10 10 14 20 14C12 14 6 10 0 0Z" 
                          fill="white" 
                          fillOpacity="0.95" 
                        />
                      </svg>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : null}

        {/* Content */}
        <div className="relative z-10 px-6 pt-12 pb-6">
          <div className="flex items-start justify-between">
            {/* Left: Weather info with dark container for better readability */}
            {isLoading ? (
              <div 
                className="flex flex-col gap-1 p-3 rounded-2xl bg-black/30 backdrop-blur-md border border-white/10 text-white min-w-[120px] animate-pulse pointer-events-none"
                style={{ 
                  transform: `scale(${0.85 + (customScale - 0.55) * 0.33})`, 
                  transformOrigin: 'left top',
                }}
              >
                <div className="h-3 w-12 bg-white/20 rounded mb-1"></div>
                <div className="h-8 w-16 bg-white/20 rounded"></div>
              </div>
            ) : weather && (
              <div 
                className="flex flex-col gap-1 p-3 rounded-2xl bg-black/30 backdrop-blur-md border border-white/10 text-white min-w-[120px] shadow-lg pointer-events-none"
                style={{ 
                  transform: `scale(${0.85 + (customScale - 0.55) * 0.33})`, 
                  transformOrigin: 'left top',
                  opacity: 0.95,
                  willChange: 'transform',
                  transformStyle: 'preserve-3d',
                  backfaceVisibility: 'hidden'
                }}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  {isNight ? (
                    <Moon className="w-3.5 h-3.5 text-yellow-200 fill-yellow-200/20" />
                  ) : (
                    <Sun className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400/20" />
                  )}
                  <div className="text-[10px] font-black uppercase tracking-widest opacity-90">
                    {weather.condition}
                  </div>
                </div>
                <div className="text-3xl font-black tracking-tighter">{weather.temp}°C</div>
                <div className="flex items-center gap-3 mt-1 border-t border-white/10 pt-1">
                  <div className="flex items-center gap-0.5">
                    <ArrowUp className="w-3 h-3 text-red-400 stroke-[3px]" />
                    <span className="text-[10px] font-black">{weather.high}°</span>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <ArrowDown className="w-3 h-3 text-blue-400 stroke-[3px]" />
                    <span className="text-[10px] font-black">{weather.low}°</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

export default TimeWeatherHeader;
