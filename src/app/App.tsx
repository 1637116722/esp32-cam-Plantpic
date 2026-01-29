import TimeWeatherHeader from "./components/TimeWeatherHeader";
import BottomNavigation from "./components/BottomNavigation";
import TopLabelHeader from "./components/TopLabelHeader";
import BlankView from "./components/BlankView";
import SearchView, { type Msg } from "./components/SearchView";
import JournalView from "./components/JournalView";
import PhotosView from "./components/PhotosView";
import PlantGrid, { type PlantItem } from "./components/PlantGrid";
import PlantDetailView from "./components/PlantDetailView";
import CategoryFilter from "./components/CategoryFilter";
import AddPlantDialog from "./components/AddPlantDialog";
import ToastNotification, { type ToastMessage } from "./components/ToastNotification";
import { initialPlants } from "./data/plantsData";
import { Leaf } from 'lucide-react';
import { getTimeTheme } from "../utils/timeTheme";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";

// 日誌紀錄介面
export interface JournalRecord {
    id: string;
    plantId: string;
    plantName: string;
    type: 'watering' | 'health';
    startTime: string;
    endTime?: string;
    dateKey: string;
    status: 'pending' | 'completed';
    lowestValue?: number; // 新增：記錄異常期間出現過的最低數值
}

// 天氣資料介面
export interface WeatherData {
    temp: number;
    high: number;
    low: number;
    condition: string;
    humidity?: number;
    lastUpdated?: number; // 新增：上次更新的時間戳
}

export default function App() {
    const [theme, setTheme] = useState(getTimeTheme());
    const intervalRef = useRef<number | null>(null);
    const [activeTab, setActiveTab] = useState<string>("home");
    const [selectedCategory, setSelectedCategory] = useState<string>("my-garden");
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [plants, setPlants] = useState<PlantItem[]>(initialPlants);
    // 初始化時從 localStorage 載入植物資料
    useEffect(() => {
        const savedPlants = localStorage.getItem("plantalk_plants_v1");
        if (savedPlants) {
            try {
                const parsed = JSON.parse(savedPlants);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    setPlants(parsed);
                }
            } catch (e) {
                console.error("Failed to load plants from localStorage", e);
            }
        }
    }, []);

    const [latestPhotos, setLatestPhotos] = useState<Record<string, string>>({});
    const [espStatus, setEspStatus] = useState<Record<string, boolean>>({});

    // 輪詢 ESP 狀態
    useEffect(() => {
        const checkStatus = async () => {
            try {
                const res = await fetch(`https://esp32-cam-relay-oqmh.onrender.com/api/info?t=${Date.now()}`, { cache: 'no-store' });
                if (!res.ok) throw new Error('Network response was not ok');
                const data = await res.json();
                
                // 實時偵測邏輯：
                // 1. 優先檢查 lastHeartbeatTime (任何通訊紀錄)
                // 2. 其次才看 lastUploadTime (照片上傳紀錄)
                // 3. 與伺服器時間對比，避免客戶端時鐘偏差
                const serverTime = data.serverTime ? new Date(data.serverTime).getTime() : Date.now();
                const lastActiveStr = data.lastHeartbeatTime || data.lastUploadTime;
                const lastActiveTime = lastActiveStr ? new Date(lastActiveStr).getTime() : 0;
                
                const isRecentlyActive = (serverTime - lastActiveTime) < 45_000; // 45 秒內有通訊才算在線 (ESP 每 10 秒 poll 一次)
                
                const newStatus: Record<string, boolean> = {};
                plants.forEach(p => {
                    if (p.cameraId) {
                        newStatus[p.id] = isRecentlyActive;
                    }
                });
                setEspStatus(newStatus);
            } catch (e) {
                console.error("Failed to check ESP status", e);
                // 請求失敗（例如 Render 伺服器掛了或網路斷開）
                setEspStatus({});
            }
        };

        checkStatus();
        const timer = setInterval(checkStatus, 15000); // 每 15 秒檢查一次
        return () => clearInterval(timer);
    }, [plants]);

    // 載入最新相片
    useEffect(() => {
        const loadLatestPhotos = () => {
            const raw = localStorage.getItem("photo_gallery_items_v1");
            if (raw) {
                try {
                    const items = JSON.parse(raw);
                    const latest: Record<string, string> = {};
                    // 因為 items 是 [新...舊] 排序，我們從後往前遍歷，
                    // 這樣後面的（較新的）會覆蓋前面的（較舊的），最終留住最新的一張
                    [...items].reverse().forEach((it: any) => {
                        if (it.plantId) {
                            latest[it.plantId] = it.dataUrl;
                        }
                    });
                    setLatestPhotos(latest);
                } catch (e) {
                    console.error("Failed to parse gallery items", e);
                }
            }
        };

        loadLatestPhotos();

        // 背景同步最新照片 (當 App 開啟時，即使不在相簿頁也自動下載最新一張)
        const backgroundSync = async () => {
            // 找出所有有 cameraId 的植物
            const camPlants = plants.filter(p => p.cameraId);
            if (camPlants.length === 0) return;

            try {
                const infoRes = await fetch('https://esp32-cam-relay-oqmh.onrender.com/api/info', { cache: 'no-store' });
                const info = await infoRes.json();
                const lastUploadTime = info.lastUploadTime;
                if (!lastUploadTime) return;

                // 檢查是否已經在相簿中
                const raw = localStorage.getItem("photo_gallery_items_v1");
                const items = raw ? JSON.parse(raw) : [];
                const isAlreadyInGallery = items.some((it: any) => it.capturedAtIso === lastUploadTime);
                
                if (!isAlreadyInGallery) {
                    console.log("發現新照片，正在背景下載...");
                    const imageRes = await fetch(`https://esp32-cam-relay-oqmh.onrender.com/api/image?t=${Date.now()}`, { cache: 'no-store' });
                    if (imageRes.ok) {
                        const blob = await imageRes.blob();
                        const dataUrl = await new Promise<string>((resolve) => {
                            const reader = new FileReader();
                            reader.onload = () => resolve(reader.result as string);
                            reader.readAsDataURL(blob);
                        });

                        // 假設最新照片屬於第一個有相機的植物 (目前邏輯)
                        const targetPlantId = camPlants[0].id;
                        const newItem = {
                            id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
                            capturedAtIso: lastUploadTime,
                            dataUrl,
                            plantId: targetPlantId
                        };

                        // 保存到 localStorage
                        const updatedItems = [newItem, ...items].slice(0, 100); // 限制數量
                        localStorage.setItem("photo_gallery_items_v1", JSON.stringify(updatedItems));
                        
                        // 觸發更新
                        loadLatestPhotos();
                        window.dispatchEvent(new CustomEvent('gallery-updated'));
                    }
                }
            } catch (e) {
                console.error("Background photo sync failed", e);
            }
        };

        // 每 30 秒在背景同步一次
        const syncTimer = setInterval(backgroundSync, 30000);
        backgroundSync(); // 初始執行一次

        // 監聽存儲變化
        const handleStorage = (e: StorageEvent) => {
            if (e.key === "photo_gallery_items_v1") {
                loadLatestPhotos();
            }
        };
        
        // 自定義事件用於同視窗更新
        const handleUpdate = () => loadLatestPhotos();

        window.addEventListener('storage', handleStorage);
        window.addEventListener('gallery-updated', handleUpdate);
        return () => {
            window.removeEventListener('storage', handleStorage);
            window.removeEventListener('gallery-updated', handleUpdate);
            clearInterval(syncTimer);
        };
    }, [plants]); // 依賴 plants 以獲取最新的 camPlants

    // 增強 plants 資料，加入最新照片與連線狀態
    const augmentedPlants = useMemo(() => {
        return plants.map(p => ({
            ...p,
            imageUrl: p.imageUrl, // 保留原始封面
            latestEspPhoto: (p.cameraId && latestPhotos[p.id]) ? latestPhotos[p.id] : undefined,
            // 連線狀態判定：必須是實時在線 (espStatus) 才顯示 CONNECTED
            isConnected: p.cameraId ? !!espStatus[p.id] : undefined
        }));
    }, [plants, latestPhotos, espStatus]);

    // 根據分類篩選植物
    const filteredPlants = useMemo(() => {
        return selectedCategory === 'my-garden'
            ? augmentedPlants
            : augmentedPlants.filter(p => p.type === selectedCategory);
    }, [augmentedPlants, selectedCategory]);
    const [selectedPlant, setSelectedPlant] = useState<PlantItem | null>(null);
    const [homeScrollY, setHomeScrollY] = useState(0);
    const [detailScrollY, setDetailScrollY] = useState(0);
    const isUpdatingFromHmr = useRef(false);
    const homeScrollRef = useRef<HTMLDivElement>(null);
    const isResettingHomeScroll = useRef(false);

    // 天氣狀態
    const [weather, setWeather] = useState<WeatherData | null>(null);
    const [isWeatherLoading, setIsWeatherLoading] = useState(false);

    // 獲取天氣資料
    const fetchWeather = async () => {
        setIsWeatherLoading(true);
        try {
            // 優先使用地理定位，若失敗則使用 IP 定位
            let lat, lon;
            
            try {
                const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
                });
                lat = pos.coords.latitude;
                lon = pos.coords.longitude;
            } catch (e) {
                const locRes = await fetch('https://ipapi.co/json/');
                const locData = await locRes.json();
                lat = locData.latitude;
                lon = locData.longitude;
            }

            if (lat && lon) {
                const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto`;
                const response = await fetch(weatherUrl);
                const data = await response.json();

                if (data && data.current) {
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

                    setWeather({
                        temp: Math.round(data.current.temperature_2m),
                        high: Math.round(data.daily.temperature_2m_max[0]),
                        low: Math.round(data.daily.temperature_2m_min[0]),
                        condition: mapWeatherCode(data.current.weather_code),
                        humidity: Math.round(data.current.relative_humidity_2m),
                        lastUpdated: Date.now()
                    });
                }
            }
        } catch (error) {
            console.error('Failed to fetch weather in App:', error);
            // 更合理的冬天降級方案 (12月)
            const isWinter = new Date().getMonth() === 11 || new Date().getMonth() <= 1;
            setWeather({
                temp: isWinter ? 18 : 25,
                high: isWinter ? 22 : 28,
                low: isWinter ? 14 : 20,
                condition: '晴朗',
                humidity: 60,
                lastUpdated: Date.now()
            });
        } finally {
            setIsWeatherLoading(false);
        }
    };

    // 初始與定時獲取天氣 (每 5 分鐘刷新一次)
    useEffect(() => {
        fetchWeather();
        const timer = setInterval(fetchWeather, 5 * 60 * 1000);
        return () => clearInterval(timer);
    }, []);

    // 移除原有的：當回到主頁或植物詳情關閉時，刷新天氣以保持一致
    // (因為使用者反應不要一直刷新)

    // 日誌紀錄狀態
    const [historyRecords, setHistoryRecords] = useState<JournalRecord[]>(() => {
        const saved = localStorage.getItem('plant_journal_records');
        if (!saved) return [];
        
        const records: JournalRecord[] = JSON.parse(saved);
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const thresholdKey = sevenDaysAgo.toISOString().split('T')[0];
        
        // 遷移與清理：過濾 7 天前的紀錄
        return records.filter(r => r.dateKey >= thresholdKey);
    });

    // 通知狀態
    const [notifications, setNotifications] = useState<ToastMessage[]>([]);

    // 對話紀錄狀態 (僅存在記憶體中，刷新頁面即重置)
    const [chatMessages, setChatMessages] = useState<Msg[]>([
        { role: "assistant", text: "你好，我是植物照護助手。你可以問我任何關於植物栽培、澆水、光照、土壤、施肥等問題。" },
    ]);

    // 背景監控植物狀態並同步日誌
    useEffect(() => {
        const today = new Date();
        const todayKey = today.toISOString().split('T')[0];

        const currentTime = today.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: true 
        });

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        setHistoryRecords(prevRecords => {
            let hasChanged = false;
            let newRecords = [...prevRecords];
            const newNotifications: ToastMessage[] = [];

            plants.forEach(p => {
                const threshold = p.dailyRecommendation?.moisture 
                    ? parseInt(p.dailyRecommendation.moisture) 
                    : 50;
                
                const isThirsty = (p.moisture || 0) < threshold;
                const isUnhealthy = (p.health || 0) < 40;

                // 1. 處理缺水紀錄
                const waterRecordIdx = newRecords.findIndex(r => 
                    r.plantId === p.id && 
                    r.type === 'watering' && 
                    r.status === 'pending' &&
                    r.dateKey === todayKey
                );

                if (isThirsty && waterRecordIdx === -1) {
                    newRecords.push({
                        id: `water-${p.id}-${Date.now()}`,
                        plantId: p.id,
                        plantName: p.name,
                        type: 'watering',
                        startTime: currentTime,
                        dateKey: todayKey,
                        status: 'pending',
                        lowestValue: p.moisture || 0
                    });
                    newNotifications.push({
                        id: `notif-water-${p.id}-${Date.now()}`,
                        plantName: p.name,
                        type: 'watering',
                        message: '水分不足，請及時查看並澆水'
                    });
                    hasChanged = true;
                } else if (waterRecordIdx !== -1) {
                    if (!isThirsty) {
                        newRecords[waterRecordIdx] = {
                            ...newRecords[waterRecordIdx],
                            status: 'completed',
                            endTime: currentTime
                        };
                        newNotifications.push({
                            id: `notif-resolved-water-${p.id}-${Date.now()}`,
                            plantName: p.name,
                            type: 'resolved',
                            message: '已完成澆水，水分恢復正常'
                        });
                        hasChanged = true;
                    } else {
                        const currentMoisture = p.moisture || 0;
                        const lastLowest = newRecords[waterRecordIdx].lowestValue ?? 100;
                        if (currentMoisture < lastLowest) {
                            newRecords[waterRecordIdx].lowestValue = currentMoisture;
                            hasChanged = true;
                        }
                    }
                }

                // 2. 處理健康紀錄
                const healthRecordIdx = newRecords.findIndex(r => 
                    r.plantId === p.id && 
                    r.type === 'health' && 
                    r.status === 'pending' &&
                    r.dateKey === todayKey
                );

                if (isUnhealthy && healthRecordIdx === -1) {
                    newRecords.push({
                        id: `health-${p.id}-${Date.now()}`,
                        plantId: p.id,
                        plantName: p.name,
                        type: 'health',
                        startTime: currentTime,
                        dateKey: todayKey,
                        status: 'pending',
                        lowestValue: p.health || 0
                    });
                    newNotifications.push({
                        id: `notif-health-${p.id}-${Date.now()}`,
                        plantName: p.name,
                        type: 'health',
                        message: '健康狀況異常，請檢查植物狀態'
                    });
                    hasChanged = true;
                } else if (healthRecordIdx !== -1) {
                    if (!isUnhealthy) {
                        newRecords[healthRecordIdx] = {
                            ...newRecords[healthRecordIdx],
                            status: 'completed',
                            endTime: currentTime
                        };
                        newNotifications.push({
                            id: `notif-resolved-health-${p.id}-${Date.now()}`,
                            plantName: p.name,
                            type: 'resolved',
                            message: '健康狀況已恢復正常'
                        });
                        hasChanged = true;
                    } else {
                        const currentHealth = p.health || 0;
                        const lastLowest = newRecords[healthRecordIdx].lowestValue ?? 100;
                        if (currentHealth < lastLowest) {
                            newRecords[healthRecordIdx].lowestValue = currentHealth;
                            hasChanged = true;
                        }
                    }
                }
            });

            if (newNotifications.length > 0) {
                setNotifications(prev => [...prev, ...newNotifications]);
                // 5秒後自動消失
                newNotifications.forEach(n => {
                    setTimeout(() => {
                        setNotifications(prev => prev.filter(item => item.id !== n.id));
                    }, 5000);
                });
            }

            if (hasChanged) {
                localStorage.setItem('plant_journal_records', JSON.stringify(newRecords));
                return newRecords;
            }
            return prevRecords;
        });
    }, [plants]);

    // 當回到主頁時，恢復之前的捲動位置
    useEffect(() => {
        if (selectedPlant === null && activeTab === "home" && homeScrollRef.current) {
            // 恢復到之前的捲動位置，而不是重置為 0
            homeScrollRef.current.scrollTop = homeScrollY;
        }
    }, [selectedPlant, activeTab]);

    // 當 initialPlants (檔案) 改變時，更新 App 狀態 (HMR)
    useEffect(() => {
        // 只有當檔案內容與目前狀態不同時才更新，避免循環
        const currentPlantsStr = JSON.stringify(plants);
        const initialPlantsStr = JSON.stringify(initialPlants);
        
        if (initialPlantsStr !== currentPlantsStr) {
            console.log("File changed, updating state from HMR...");
            isUpdatingFromHmr.current = true;
            setPlants(initialPlants);
            
            // 如果當前有選中的植物，也同步更新它的資料
            if (selectedPlant) {
                const updatedSelected = initialPlants.find(p => p.id === selectedPlant.id);
                if (updatedSelected) {
                    setSelectedPlant(updatedSelected);
                }
            }
        }
    }, [initialPlants]);

    // 捲動控制常數 (與 PlantDetailView 保持一致)
    const MAX_SCROLL = 400;
    const MAX_HEIGHT = 580;
    const MIN_HEIGHT = 180;
    const MIN_SCALE = 0.55;

    // 同步到檔案的函數
    const syncToFile = async (currentPlants: PlantItem[]) => {
        // 同步到 localStorage (所有平台通用)
        localStorage.setItem("plantalk_plants_v1", JSON.stringify(currentPlants));

        // 如果目前狀態與檔案內容一致，則不需要寫入 (避免循環)
        if (JSON.stringify(currentPlants) === JSON.stringify(initialPlants)) {
            return;
        }

        // 同步到伺服器實體檔案 (僅本地開發環境有效)
        if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
            try {
                await fetch('/api/save-plants', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ plants: currentPlants })
                });
            } catch (e) {
                console.error("Failed to sync plants to file:", e);
            }
        }
    };

    // 每當植物列表改變，同步到實體檔案
    useEffect(() => {
        // 如果是從 HMR 過來的更新，不需要再同步回去
        if (isUpdatingFromHmr.current) {
            isUpdatingFromHmr.current = false;
            return;
        }

        // 只有當真的有植物資料時才同步
        if (plants.length > 0) {
            const timer = setTimeout(() => {
                syncToFile(plants);
            }, 1500); // 1.5秒防抖，給使用者充足的輸入時間

            return () => clearTimeout(timer);
        }
    }, [plants]);

    const homeTickingRef = useRef(false);
    const handleHomeScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        if (isResettingHomeScroll.current) return;
        const st = e.currentTarget.scrollTop;
        
        if (!homeTickingRef.current) {
            window.requestAnimationFrame(() => {
                setHomeScrollY(st);
                homeTickingRef.current = false;
            });
            homeTickingRef.current = true;
        }
    }, []);

    // 計算 Header 狀態 (全域統一)
    const currentScrollY = selectedPlant ? detailScrollY : (activeTab === "home" ? homeScrollY : 0);
    const clamped = Math.min(currentScrollY, MAX_SCROLL);
    const progress = clamped / MAX_SCROLL;
    const headerHeight = MAX_HEIGHT - progress * (MAX_HEIGHT - MIN_HEIGHT);
    const headerScale = 1 - progress * (1 - MIN_SCALE);

    const handleDetailScroll = useCallback((y: number) => {
        setDetailScrollY(y);
    }, []);

    const addPlant = useCallback(async (name: string, species: string, type: 'indoor' | 'outdoor', imageUrl?: string, cameraId?: string) => {
        if (!name.trim()) return;
        const id = name.trim().toLowerCase().replace(/\s+/g, "-") + "-" + Date.now();
        
        const newPlant: PlantItem = { 
            id, 
            name: name.trim(), 
            species: species.trim() || (type === 'indoor' ? 'Indoor Plant' : 'Outdoor Plant'),
            type,
            imageUrl, 
            cameraId,
            moisture: 100,
            health: 100
        };
        
        setPlants(prev => [...prev, newPlant]);
    }, []);

    const updatePlant = useCallback((updatedPlant: PlantItem) => {
        setPlants(prev => prev.map(p => p.id === updatedPlant.id ? updatedPlant : p));
        // 只有當原本就在詳情頁面時，才同步更新詳情頁面的選中狀態
        // 這樣可以避免從搜尋頁面背景更新時，意外觸發跳轉
        setSelectedPlant(prev => (prev && prev.id === updatedPlant.id) ? updatedPlant : prev);
    }, []);

    const deletePlant = useCallback((id: string) => {
        setPlants(prev => prev.filter(p => p.id !== id));
        setSelectedPlant(null);
    }, []);

    const handlePlantClick = useCallback((plant: PlantItem) => {
        setDetailScrollY(homeScrollY);
        setSelectedPlant(plant);
    }, [homeScrollY]);
    useEffect(() => {
        const root = document.documentElement;
        root.style.setProperty('--background', theme.bg);
        root.style.setProperty('--foreground', theme.fg);
    }, [theme]);
    useEffect(() => {
        const updateTheme = () => {
            setTheme(getTimeTheme());
        };
        updateTheme();
        if (intervalRef.current !== null) {
            clearInterval(intervalRef.current);
        }
        intervalRef.current = window.setInterval(updateTheme, 60_000);
        return () => {
            if (intervalRef.current !== null) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, []);

    const handleTabChange = (tab: string) => {
        setActiveTab(tab);
        setSelectedPlant(null); // 切換分頁時，自動關閉植物詳情頁面
    };

    const isHeaderVisible = activeTab === "home" || selectedPlant !== null;

    // 判斷是否為手機 App 環境 (Capacitor 或行動裝置瀏覽器)
    const isMobileApp = typeof window !== 'undefined' && 
        (window.location.protocol === 'capacitor:' || 
         /iPhone|iPad|iPod|Android/i.test(navigator.userAgent));

    return (
        <div className="w-full h-screen flex justify-center items-center overflow-hidden" style={{ backgroundColor: theme.bg }}>
            <style>{`
                .no-scrollbar::-webkit-scrollbar {
                    display: none;
                }
                .no-scrollbar {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
                /* 針對手機版隱藏捲軸並確保填滿 */
                html, body {
                    overflow: hidden;
                    width: 100%;
                    height: 100%;
                }
            `}</style>
            
            {/* 桌面端預覽時顯示 iPhone 框架，手機端則全螢幕 */}
            <div
                className={`
                    relative w-full h-full flex flex-col overflow-hidden transition-all duration-500
                    ${!isMobileApp 
                        ? 'aspect-[9/19.5] max-h-[92vh] max-w-[430px] rounded-[50px] shadow-2xl border-[8px] border-gray-800 my-4' 
                        : 'rounded-0 border-0'}
                `}
                style={{ backgroundColor: theme.bg }}
            >
                <div
                    className={`
                        overflow-hidden h-full flex flex-col relative
                        ${!isMobileApp ? 'rounded-[42px]' : 'rounded-0'}
                        bg-[#F6FAF7]
                    `}
                >
                    {/* 全域通知彈窗 */}
                    <ToastNotification 
                        notifications={notifications} 
                        onClose={(id) => setNotifications(prev => prev.filter(n => n.id !== id))}
                        onClick={(id) => {
                            setActiveTab('journal');
                            setNotifications(prev => prev.filter(n => n.id !== id));
                        }}
                    />

                    <AddPlantDialog 
                        open={isAddDialogOpen} 
                        onOpenChange={setIsAddDialogOpen}
                        onAdd={addPlant}
                    />

                    <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
                        {/* 全域 Header - 確保人物與溫度不重新載入 */}
                        <div 
                            className="absolute top-0 left-0 z-30 w-full overflow-visible pointer-events-none transition-opacity duration-300"
                            style={{ 
                                height: `${headerHeight}px`,
                                // 移除整體下移，背景應延伸至頂部，內容在 TimeWeatherHeader 內部避開靈動島
                                paddingTop: '0',
                                opacity: isHeaderVisible ? 1 : 0,
                                visibility: isHeaderVisible ? 'visible' : 'hidden',
                                willChange: 'height, opacity'
                            }}
                        >
                            <TimeWeatherHeader 
                                showMiniCharacter 
                                modelPath="/plant.glb" 
                                externalWeather={weather}
                                isExternalLoading={isWeatherLoading}
                                customHeight={headerHeight}
                                customScale={headerScale}
                                selectedPlant={selectedPlant}
                                plants={plants}
                            />
                        </div>

                        {selectedPlant ? (
                            <PlantDetailView 
                                            plant={augmentedPlants.find(p => p.id === selectedPlant.id) || selectedPlant}
                                             onBack={() => {
                                                 setHomeScrollY(detailScrollY);
                                                 setSelectedPlant(null);
                                                 setDetailScrollY(0);
                                             }}
                                             onUpdate={updatePlant}
                                             onDelete={deletePlant}
                                             onScroll={handleDetailScroll}
                                              initialScrollY={homeScrollY}
                                             externalWeather={weather}
                                         />
                        ) : activeTab === "home" ? (
                            <div className="w-full h-full relative overflow-hidden">
                                {/* Scrollable Content */}
                                <div 
                                    ref={homeScrollRef}
                                    className="w-full h-full overflow-y-auto no-scrollbar"
                                    onScroll={handleHomeScroll}
                                >
                                    {/* Spacer to push content below the absolute header - adjusted for safe area */}
                                    <div style={{ height: `calc(${MAX_HEIGHT}px)` }} className="w-full shrink-0 pointer-events-none" />
                                    
                                    <div className="px-6 space-y-6 relative z-10">
                                        {/* 分類篩選與新增按鈕 */}
                                        <div className="relative z-10 bg-[#F6FAF7] pt-4">
                                            <CategoryFilter 
                                                selectedCategory={selectedCategory}
                                                onCategoryChange={setSelectedCategory}
                                            />
                                            
                                            <div className="flex justify-end pr-0 mt-2 mb-4">
                                                <button
                                                    className="px-4 py-2.5 rounded-full bg-[#6FCF97] text-white text-sm font-bold shadow-[0_8px_20px_rgba(111,207,151,0.2)] hover:bg-[#5bbd85] transition-all active:scale-95 flex items-center gap-2"
                                                    onClick={() => setIsAddDialogOpen(true)}
                                                >
                                                    <Leaf className="w-5 h-5" />
                                                    <span>Add Plant</span>
                                                </button>
                                            </div>
                                        </div>

                                        <div className="w-full">
                                            <PlantGrid
                                                plants={filteredPlants}
                                                onPlantClick={handlePlantClick}
                                            />
                                        </div>
                                    </div>
                                    <div className="h-24" /> {/* Bottom spacer */}
                                </div>
                            </div>
                        ) : (
                            <>
                                {activeTab !== "photos" && (
                                    <TopLabelHeader title={
                                        activeTab === "journal" ? "日誌" :
                                        activeTab === "search" ? "搜尋" :
                                        activeTab === "moments" ? "時光" : ""
                                    } onBack={activeTab !== "journal" && activeTab !== "search" ? () => setActiveTab("home") : undefined} />
                                )}
                                <div className={`flex-1 ${activeTab === "home" ? "overflow-y-auto" : "overflow-hidden flex flex-col"}`}>
                                    {activeTab === "search" ? (
                                        <SearchView 
                                            plants={augmentedPlants} 
                                            messages={chatMessages} 
                                            onMessagesChange={setChatMessages} 
                                            onUpdatePlant={updatePlant}
                                        />
                                    ) : activeTab === "journal" ? (
                                        <JournalView plants={augmentedPlants} historyRecords={historyRecords} />
                                    ) : activeTab === "photos" ? (
                                        <PhotosView plants={augmentedPlants} />
                                    ) : (
                                        <BlankView />
                                    )}
                                </div>
                            </>
                        )}
                    </div>

                    <div className="safe-bottom">
                        <BottomNavigation 
                            activeTab={activeTab} 
                            onChange={handleTabChange} 
                            hasPendingJournal={historyRecords.some(r => r.status === 'pending')}
                        />
                    </div>

                    {/* Add Plant Dialog */}
                    <AddPlantDialog 
                        open={isAddDialogOpen}
                        onOpenChange={setIsAddDialogOpen}
                        onAdd={addPlant}
                    />
                </div>
            </div>
        </div>
    );
}
