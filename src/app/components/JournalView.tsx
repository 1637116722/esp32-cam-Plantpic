import { useState, useMemo, useEffect, useRef } from 'react';
import { Leaf, Droplets, Bug, AlertTriangle } from 'lucide-react';
import { PlantItem } from './PlantGrid';
import { JournalRecord } from '../App';

interface JournalViewProps {
  plants: PlantItem[];
  historyRecords: JournalRecord[];
}

export default function JournalView({ plants, historyRecords }: JournalViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeftState = useRef(0);

  // 日期選擇器的捲動位置控制
  useEffect(() => {
    if (todayRef.current && scrollRef.current) {
      const container = scrollRef.current;
      const todayEl = todayRef.current;
      const scrollLeft = todayEl.offsetLeft - (container.offsetWidth / 2) + (todayEl.offsetWidth / 2);
      container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
    }
  }, []);

  // 滑鼠拖動捲動邏輯
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    isDragging.current = true;
    startX.current = e.pageX - scrollRef.current.offsetLeft;
    scrollLeftState.current = scrollRef.current.scrollLeft;
  };

  const handleMouseLeave = () => {
    isDragging.current = false;
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX.current) * 1.2; // 調整滑鼠捲動速度從 2 降至 1.2
    scrollRef.current.scrollLeft = scrollLeftState.current - walk;
  };

  // 觸控捲動邏輯 (手機端)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!scrollRef.current) return;
    isDragging.current = true;
    startX.current = e.touches[0].pageX - scrollRef.current.offsetLeft;
    scrollLeftState.current = scrollRef.current.scrollLeft;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current || !scrollRef.current) return;
    const x = e.touches[0].pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX.current) * 1.0; // 調整觸控捲動速度從 1.5 降至 1.0
    scrollRef.current.scrollLeft = scrollLeftState.current - walk;
  };

  const handleTouchEnd = () => {
    isDragging.current = false;
  };
  
  // 計算日期（今天往前 7 天，往後 3 天，共 11 天）
  const weekDays = useMemo(() => {
    const days: Array<{ day: string; date: string; dateKey: string; isToday: boolean; hasPending: boolean }> = [];
    const today = new Date();
    
    // 從今天往前 7 天到往後 3 天
    for (let i = -7; i <= 3; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
      const dayNumber = date.getDate().toString().padStart(2, '0');
      const dateKey = date.toISOString().split('T')[0];
      
      // 檢查該日期是否有未完成任務
      const hasPendingTasks = historyRecords.some(r => r.dateKey === dateKey && r.status === 'pending');
      
      days.push({
        day: dayName,
        date: dayNumber,
        dateKey: dateKey,
        isToday: i === 0,
        hasPending: hasPendingTasks
      });
    }
    
    return days;
  }, [historyRecords]);
  const todayKey = weekDays.find(d => d.isToday)?.dateKey || '';
  const [selectedDate, setSelectedDate] = useState(todayKey);

  // 任務統計與提示邏輯
  const stats = useMemo(() => {
    const records = historyRecords.filter(r => r.dateKey === selectedDate);
    const watering = records.filter(r => r.type === 'watering');
    const health = records.filter(r => r.type === 'health');

    const tips = [
      "今日植物狀態完美！試著觀察葉片背後是否有新芽萌發？",
      "您的花園非常健康。今天適合幫葉片擦拭灰塵，讓它們呼吸更順暢。",
      "沒有待辦任務。靜下心來，聽聽植物在陽光下生長的聲音吧。",
      "一切正常！記得檢查一下排水孔是否有阻塞，保持通風良好。",
      "植物們都在微笑。這是一個適合紀錄它們生長高度的好日子。"
    ];

    return {
      records,
      wateringTotal: watering.length,
      wateringPending: watering.filter(r => r.status === 'pending').length,
      healthTotal: health.length,
      healthPending: health.filter(r => r.status === 'pending').length,
      randomTip: tips[Math.floor(Math.random() * tips.length)]
    };
  }, [selectedDate, historyRecords]);

  // 計算任務與紀錄數據
  const journalData = useMemo(() => {
    const isPast = selectedDate < todayKey;
    const isFuture = selectedDate > todayKey;
    
    // 獲取該日期的所有紀錄
    const records = stats.records;

    if (isPast) {
      return {
        records,
        total: records.length,
        isPast: true,
        isFuture: false,
        isToday: false
      };
    }

    if (isFuture) {
      return {
        records: [],
        total: 0,
        isPast: false,
        isFuture: true,
        isToday: false
      };
    }

    // 今天：顯示所有當天的紀錄（包含已完成與未完成）
    return {
      records,
      total: records.length,
      isPast: false,
      isFuture: false,
      isToday: true
    };
  }, [selectedDate, todayKey, stats]);

  // 格式化選中的日期顯示
  const displayDateInfo = useMemo(() => {
    const dateObj = new Date(selectedDate);
    return {
      formatted: dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      dayName: dateObj.toLocaleDateString('en-US', { weekday: 'long' })
    };
  }, [selectedDate]);

  return (
    <div className="w-full h-full flex flex-col bg-[#F6FAF7] overflow-hidden">
      {/* ================= Day Selector ================= */}
      <div 
        ref={scrollRef}
        className="px-6 py-4 flex gap-3 overflow-x-auto no-scrollbar active:cursor-grabbing shrink-0 bg-white/30 border-b border-green-50"
        onMouseDown={handleMouseDown}
        onMouseLeave={handleMouseLeave}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {weekDays.map((d) => (
          <button
            key={d.dateKey}
            ref={d.isToday ? todayRef : null}
            onClick={() => setSelectedDate(d.dateKey)}
            className={`
              flex flex-col items-center justify-center min-w-[56px] h-[72px] rounded-2xl transition-all duration-300 relative
              ${selectedDate === d.dateKey 
                ? 'bg-green-600 text-white shadow-lg shadow-green-200 scale-105' 
                : 'bg-white text-gray-400 hover:bg-green-50'}
            `}
          >
            {/* 日曆右上角小感嘆號 */}
            {d.hasPending && (
              <div className="absolute top-1.5 right-1.5 animate-pulse">
                <AlertTriangle className={`w-2.5 h-2.5 ${selectedDate === d.dateKey ? 'text-yellow-300 fill-yellow-300/30' : 'text-yellow-500 fill-yellow-500/20'}`} />
              </div>
            )}
            <span className={`text-[10px] font-black uppercase tracking-tighter mb-1 ${selectedDate === d.dateKey ? 'text-green-100' : 'text-gray-400'}`}>
              {d.day}
            </span>
            <span className="text-lg font-black tracking-tight">
              {d.date}
            </span>
            {d.isToday && selectedDate !== d.dateKey && (
              <div className="w-1 h-1 rounded-full bg-green-500 mt-1" />
            )}
          </button>
        ))}
      </div>

      {/* ================= Header (Title & Stats) ================= */}
      <div className="px-6 pt-4 pb-4 bg-white/50 backdrop-blur-md border-b border-green-50 shrink-0">
        <div className="flex justify-between items-end mb-4">
          <div>
            <div className="text-[10px] text-green-600 font-black uppercase tracking-[0.2em] mb-1 opacity-60">
              {displayDateInfo.formatted}
            </div>
            <div className="text-2xl font-black text-green-900 tracking-tight">
              {selectedDate === todayKey ? "Today's Log" : displayDateInfo.dayName}
            </div>
          </div>
          <div className="flex gap-2">
            <div className="w-10 h-10 rounded-2xl bg-white border border-green-100 flex items-center justify-center shadow-sm">
              <Leaf className="w-5 h-5 text-green-600" />
            </div>
          </div>
        </div>

        {/* 任務統計概覽 */}
        <div className="grid grid-cols-2 gap-3 mt-2">
          {/* Watering Stat */}
          <div className={`
            rounded-2xl p-3 border transition-all duration-300 relative
            ${stats.wateringPending > 0 
              ? 'bg-blue-50 border-blue-200 shadow-sm' 
              : 'bg-blue-50/30 border-blue-100/50'}
          `}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Droplets className={`w-3.5 h-3.5 ${stats.wateringPending > 0 ? 'text-blue-500' : 'text-blue-400'}`} />
                <span className={`text-[10px] font-black uppercase tracking-wider ${stats.wateringPending > 0 ? 'text-blue-600' : 'text-blue-400'}`}>
                  Watering
                </span>
              </div>
              {stats.wateringPending > 0 && (
                <AlertTriangle className="w-5 h-5 text-yellow-500 fill-yellow-500/20" />
              )}
            </div>
            <div className="flex items-baseline gap-1">
              <span className={`text-lg font-black ${stats.wateringPending > 0 ? 'text-blue-900' : 'text-blue-800/60'}`}>
                {stats.wateringPending}
              </span>
              <span className={`text-[10px] font-bold ${stats.wateringPending > 0 ? 'text-blue-400' : 'text-blue-300'}`}>
                / {stats.wateringTotal} pending
              </span>
            </div>
          </div>

          {/* Health Stat */}
          <div className={`
            rounded-2xl p-3 border transition-all duration-300 relative
            ${stats.healthPending > 0 
              ? 'bg-red-50 border-red-200 shadow-sm' 
              : 'bg-red-50/30 border-red-100/50'}
          `}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Bug className={`w-3.5 h-3.5 ${stats.healthPending > 0 ? 'text-red-500' : 'text-red-400'}`} />
                <span className={`text-[10px] font-black uppercase tracking-wider ${stats.healthPending > 0 ? 'text-red-600' : 'text-red-400'}`}>
                  Health
                </span>
              </div>
              {stats.healthPending > 0 && (
                <AlertTriangle className="w-5 h-5 text-yellow-500 fill-yellow-500/20" />
              )}
            </div>
            <div className="flex items-baseline gap-1">
              <span className={`text-lg font-black ${stats.healthPending > 0 ? 'text-red-900' : 'text-red-800/60'}`}>
                {stats.healthPending}
              </span>
              <span className={`text-[10px] font-bold ${stats.healthPending > 0 ? 'text-red-400' : 'text-red-300'}`}>
                / {stats.healthTotal} pending
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ================= Content Area ================= */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-6 relative">
        <style dangerouslySetInnerHTML={{ __html: `
          .custom-scrollbar::-webkit-scrollbar {
            width: 6px;
            display: block;
          }
          .custom-scrollbar::-webkit-scrollbar-track {
            background: transparent;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background: rgba(111, 207, 151, 0.2);
            border-radius: 20px;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background: rgba(111, 207, 151, 0.4);
          }
        `}} />
        {/* ================= Future Date Placeholder ================= */}
        {journalData.isFuture && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#F6FAF7]/40 backdrop-blur-md">
            <div className="w-20 h-20 rounded-full bg-white/50 flex items-center justify-center text-4xl mb-4 shadow-xl border border-white">
              📅
            </div>
            <div className="text-xl font-black text-gray-800 mb-2">Upcoming Schedule</div>
            <p className="text-sm font-bold text-gray-400 uppercase tracking-widest text-center px-10">
              Future tasks will appear as the date approaches
            </p>
          </div>
        )}

        {/* ================= Records List ================= */}
        <div className="space-y-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest">
              {journalData.isToday ? "Today's Status" : journalData.isPast ? "Historical Logs" : "Schedule"}
            </h3>
            <span className="text-[10px] font-bold text-green-500 bg-green-50 px-2 py-0.5 rounded-full uppercase">
              {journalData.isToday ? 'Live' : 'Archive'}
            </span>
          </div>

          {journalData.records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-10 text-center">
              <div className="w-20 h-20 bg-white rounded-[32px] flex items-center justify-center text-4xl mb-6 shadow-xl shadow-green-100/50 border border-green-50 animate-bounce">
                🌿
              </div>
              <h3 className="text-xl font-black text-green-900 mb-2">
                All Plants are Happy!
              </h3>
              <p className="text-sm font-medium text-green-600/70 leading-relaxed italic">
                "{stats.randomTip}"
              </p>
              <div className="mt-8 flex gap-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-green-200" />
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {journalData.records.map((record) => (
                <div 
                  key={record.id}
                  className={`
                    bg-white rounded-[28px] p-5 border transition-all hover:scale-[1.01] shadow-sm
                    ${record.type === 'watering' ? 'border-blue-50' : 'border-red-50'}
                  `}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`
                        w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg
                        ${record.type === 'watering' ? 'bg-blue-500 shadow-blue-100' : 'bg-red-500 shadow-red-100'}
                      `}>
                        {record.type === 'watering' ? <Droplets className="w-6 h-6" /> : <Bug className="w-6 h-6" />}
                      </div>
                      <div>
                        <div className="text-lg font-black text-gray-900 leading-tight">
                          {record.plantName}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`text-[10px] font-black uppercase tracking-wider ${record.type === 'watering' ? 'text-blue-500' : 'text-red-500'}`}>
                            {record.type === 'watering' ? 'Thirst detected' : 'Health warning'}
                          </span>
                          {record.lowestValue !== undefined && (
                            <>
                              <div className="w-1 h-1 rounded-full bg-gray-300" />
                              <span className="text-[10px] font-black text-red-500 uppercase tracking-tighter">
                                Lowest: {record.lowestValue}%
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className={`
                      px-3 py-1 rounded-full text-[10px] font-black
                      ${record.status === 'completed' ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'}
                    `}>
                      {record.status === 'completed' ? 'RESOLVED' : 'PENDING'}
                    </div>
                  </div>

                  <div className="flex items-center gap-6 bg-gray-50/50 rounded-2xl p-3 border border-gray-100">
                    <div className="flex-1">
                      <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Started At</div>
                      <div className="text-sm font-black text-gray-700 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                        {record.startTime}
                      </div>
                    </div>
                    
                    <div className="w-px h-8 bg-gray-200" />
                    
                    <div className="flex-1">
                      <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Resolved At</div>
                      <div className="text-sm font-black text-gray-700 flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${record.endTime ? 'bg-green-400' : 'bg-gray-300'}`} />
                        {record.endTime || '--:--'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
