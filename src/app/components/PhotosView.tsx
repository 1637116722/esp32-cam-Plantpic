import { useEffect, useMemo, useRef, useState } from "react";
import type { PlantItem } from "./PlantGrid";
import { RefreshCw, Images, Trash2, ChevronLeft, ChevronRight, X } from "lucide-react";

type GalleryItem = {
  id: string;
  capturedAtIso: string;
  dataUrl: string;
  plantId?: string;
};

const CAM_BASE_URL = "https://esp32-cam-relay-oqmh.onrender.com";
const STORAGE_KEY_ITEMS = "photo_gallery_items_v1";
const STORAGE_KEY_INTERVAL = "photo_gallery_interval_minutes_v1";
const STORAGE_KEY_RETENTION = "photo_gallery_retention_hours_v1";

// 新增 Alert Dialog 組件
function DeleteConfirmDialog({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title = "確定要刪除嗎？",
  description = "此操作無法復原。"
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onConfirm: () => void;
  title?: string;
  description?: string;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-[32px] w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-4">
            <Trash2 className="w-8 h-8 text-red-500" />
          </div>
          <h3 className="text-xl font-black text-gray-800 mb-2">{title}</h3>
          <p className="text-sm font-bold text-gray-400 mb-8">{description}</p>
          
          <div className="flex gap-3 w-full">
            <button
              onClick={onClose}
              className="flex-1 py-4 rounded-2xl bg-gray-100 text-gray-500 font-black active:scale-95 transition-all"
            >
              取消
            </button>
            <button
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className="flex-1 py-4 rounded-2xl bg-red-500 text-white font-black shadow-lg shadow-red-200 active:scale-95 transition-all"
            >
              確定刪除
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const intervalOptions = [
  { value: 1, label: "每 1 分鐘" },
  { value: 5, label: "每 5 分鐘" },
  { value: 10, label: "每 10 分鐘" },
  { value: 30, label: "每 30 分鐘" },
  { value: 60, label: "每 60 分鐘" },
];

const retentionOptions = [
  { value: 1, label: "保留 1 小時" },
  { value: 6, label: "保留 6 小時" },
  { value: 12, label: "保留 12 小時" },
  { value: 24, label: "保留 24 小時" },
  { value: 72, label: "保留 3 天" },
  { value: 168, label: "保留 7 天" },
];

const safeParseJson = <T,>(raw: string | null): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export default function PhotosView({ plants }: { plants: PlantItem[] }) {
  const cameraPlants = useMemo(() => plants.filter((p) => p.cameraId), [plants]);
  const [selectedPlantId, setSelectedPlantId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string, type: 'single' | 'all' } | null>(null);
  
  const [intervalMinutes, setIntervalMinutes] = useState<number>(() => {
    const saved = Number(localStorage.getItem(STORAGE_KEY_INTERVAL));
    return Number.isFinite(saved) && saved > 0 ? saved : 5;
  });
  const [retentionHours, setRetentionHours] = useState<number>(() => {
    const saved = Number(localStorage.getItem(STORAGE_KEY_RETENTION));
    return Number.isFinite(saved) && saved > 0 ? saved : 24;
  });
  const [items, setItems] = useState<GalleryItem[]>(() => {
    const saved = safeParseJson<GalleryItem[]>(localStorage.getItem(STORAGE_KEY_ITEMS));
    return Array.isArray(saved) ? saved : [];
  });
  const [isCapturing, setIsCapturing] = useState(false);
  const lastHashRef = useRef<string | null>(null);
  const captureSeqRef = useRef(0);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_INTERVAL, String(intervalMinutes));
  }, [intervalMinutes]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_RETENTION, String(retentionHours));
  }, [retentionHours]);

  const prune = (list: GalleryItem[]) => {
    const cutoff = Date.now() - retentionHours * 60 * 60 * 1000;
    return list.filter((x) => new Date(x.capturedAtIso).getTime() >= cutoff);
  };

  useEffect(() => {
    const pruned = prune(items);
    localStorage.setItem(STORAGE_KEY_ITEMS, JSON.stringify(pruned));
    // 觸發自定義事件通知 App.tsx 更新主頁照片
    window.dispatchEvent(new CustomEvent('gallery-updated'));
    
    if (pruned.length !== items.length) {
      setItems(pruned);
    }
  }, [items, retentionHours]);

  const blobToDataUrl = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  const hashBlob = async (blob: Blob): Promise<string> => {
    if (!("crypto" in window) || !("subtle" in crypto)) return "";
    const buffer = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    const bytes = new Uint8Array(digest);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  };

  const captureOnce = async (plantId?: string) => {
    if (isCapturing) return;
    setIsCapturing(true);
    const captureSeq = ++captureSeqRef.current;

    try {
      const baseInfoRes = await fetch(`${CAM_BASE_URL}/api/info`, { cache: "no-store" });
      const baseInfo = await baseInfoRes.json();
      const baseUploadTime: string | null = baseInfo.lastUploadTime ?? null;

      const requestRes = await fetch(`${CAM_BASE_URL}/api/request-photo`, { cache: "no-store" });
      const requestData = await requestRes.json();
      const requestId: string | null = requestData.requestId ?? null;
      const requestTime: string | null = requestData.time ?? null;

      while (captureSeqRef.current === captureSeq) {
        const infoRes = await fetch(`${CAM_BASE_URL}/api/info`, { cache: "no-store" });
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
          const imageRes = await fetch(`${CAM_BASE_URL}/api/image?t=${Date.now()}`, { cache: "no-store" });
          if (!imageRes.ok) {
            await new Promise((r) => setTimeout(r, 2000));
            continue;
          }

          const blob = await imageRes.blob();
          const hash = await hashBlob(blob);
          if (hash && lastHashRef.current === hash) {
            await new Promise((r) => setTimeout(r, 2000));
            continue;
          }

          if (hash) lastHashRef.current = hash;
          const dataUrl = await blobToDataUrl(blob);

          const item: GalleryItem = {
            id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
            capturedAtIso: lastUploadTime,
            dataUrl,
            plantId,
          };

          setItems((prev) => [item, ...prune(prev)]);
          setIsCapturing(false);
          return;
        }

        await new Promise((r) => setTimeout(r, 2000));
      }
    } catch {
      setIsCapturing(false);
    }

    setIsCapturing(false);
  };

  useEffect(() => {
    if (!selectedPlantId) return;

    const timer = window.setInterval(() => {
      captureOnce(selectedPlantId);
    }, intervalMinutes * 60 * 1000);

    return () => window.clearInterval(timer);
  }, [intervalMinutes, selectedPlantId]);

  const clearAll = () => {
    setDeleteTarget({ id: selectedPlantId!, type: 'all' });
  };

  const deleteSingle = (id: string) => {
    setDeleteTarget({ id, type: 'single' });
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;

    if (deleteTarget.type === 'all') {
      setItems((prev) => prev.filter(it => it.plantId !== deleteTarget.id));
    } else {
      setItems((prev) => prev.filter(it => it.id !== deleteTarget.id));
    }
    setDeleteTarget(null);
  };

  const selectedPlant = useMemo(() => {
    return cameraPlants.find((p) => p.id === selectedPlantId);
  }, [cameraPlants, selectedPlantId]);

  const filteredItems = useMemo(() => {
    return items.filter(it => it.plantId === selectedPlantId);
  }, [items, selectedPlantId]);

  // 如果沒有選中植物，顯示植物列表
  if (!selectedPlantId) {
    return (
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden px-6">
        <div className="mt-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
              <Images className="w-6 h-6 text-green-600" />
            </div>
            <h1 className="text-xl font-black text-gray-800">相簿選擇</h1>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar space-y-4 pb-24">
          {cameraPlants.length === 0 ? (
            <div className="text-center py-20">
              <div className="text-gray-400 font-bold">目前沒有綁定攝像頭的植物</div>
            </div>
          ) : (
            cameraPlants.map((plant) => (
              <button
                key={plant.id}
                onClick={() => setSelectedPlantId(plant.id)}
                className="w-full bg-white/70 backdrop-blur-xl rounded-[24px] p-4 shadow-sm border border-white/60 flex items-center gap-4 active:scale-95 transition-all"
              >
                <div className="w-14 h-14 rounded-2xl overflow-hidden bg-gray-100 flex-shrink-0">
                  <img src={plant.imageUrl || ""} alt={plant.name} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <div className="text-base font-black text-gray-800">{plant.name}</div>
                    <div className={`flex items-center gap-1 text-white text-[8px] font-black px-1.5 py-0.5 rounded-md shadow-sm transition-colors ${
                      plant.isConnected ? 'bg-green-500' : 'bg-red-500/80'
                    }`}>
                      <div className={`w-1 h-1 rounded-full bg-white ${plant.isConnected ? 'animate-pulse' : ''}`} />
                      <span>{plant.isConnected ? 'CONNECTED' : 'OFFLINE'}</span>
                    </div>
                  </div>
                  <div className="text-xs font-bold text-gray-400">點擊查看相簿與設定</div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-300" />
              </button>
            ))
          )}
        </div>
      </div>
    );
  }

  // 詳情頁面
  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="px-6 pb-4">
        <div className="bg-white/70 backdrop-blur-xl rounded-[24px] p-4 shadow-sm border border-white/60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setSelectedPlantId(null)}
                className="p-2 -ml-2 rounded-full hover:bg-gray-100 active:scale-90"
              >
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-100">
                <img src={selectedPlant?.imageUrl || ""} alt="" className="w-full h-full object-cover" />
              </div>
              <div>
                <div className="text-sm font-black text-gray-800">{selectedPlant?.name} 相簿</div>
                <div className="flex items-center gap-1.5">
                  <div className={`flex items-center gap-1 text-white text-[7px] font-black px-1.5 py-0.5 rounded-md shadow-sm transition-colors ${
                    selectedPlant?.isConnected ? 'bg-green-500' : 'bg-red-500/80'
                  }`}>
                    <div className={`w-1 h-1 rounded-full bg-white ${selectedPlant?.isConnected ? 'animate-pulse' : ''}`} />
                    <span>{selectedPlant?.isConnected ? 'CONNECTED' : 'OFFLINE'}</span>
                  </div>
                  <div className="text-[10px] font-bold text-gray-400">
                    {selectedPlant?.isConnected ? '定時拍照中' : '設備已斷開連結'}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => captureOnce(selectedPlantId)}
                className="px-3 py-2 rounded-2xl bg-green-500 text-white text-xs font-black shadow-md active:scale-95 flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${isCapturing ? "animate-spin" : ""}`} />
                <span>{isCapturing ? "拍照中" : "立即拍照"}</span>
              </button>
              <button
                onClick={clearAll}
                className="p-2 rounded-2xl bg-gray-100 text-gray-500 active:scale-95"
                aria-label="Clear"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="bg-white/70 rounded-2xl p-3 border border-gray-100">
              <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">拍照頻率</div>
              <select
                className="mt-2 w-full rounded-xl bg-gray-50 border border-gray-100 px-3 py-2 text-sm font-bold text-gray-700"
                value={intervalMinutes}
                onChange={(e) => setIntervalMinutes(Number(e.target.value))}
              >
                {intervalOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="bg-white/70 rounded-2xl p-3 border border-gray-100">
              <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">保留時間</div>
              <select
                className="mt-2 w-full rounded-xl bg-gray-50 border border-gray-100 px-3 py-2 text-sm font-bold text-gray-700"
                value={retentionHours}
                onChange={(e) => setRetentionHours(Number(e.target.value))}
              >
                {retentionOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-2 text-[10px] font-bold text-gray-400 text-center">
            定時拍照僅在 App 開啟且停留在相簿頁時運作
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-6 pb-24">
        {filteredItems.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center py-20">
            <div className="text-center">
              <div className="text-lg font-black text-gray-700">目前沒有照片</div>
              <div className="mt-1 text-sm font-medium text-gray-400">點「立即拍照」開始收集快照</div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {filteredItems.map((it) => (
              <div
                key={it.id}
                className="relative rounded-3xl overflow-hidden bg-white shadow-sm border border-gray-100 group"
              >
                <button
                  onClick={() => deleteSingle(it.id)}
                  className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-black/20 backdrop-blur-md text-white opacity-0 group-hover:opacity-100 transition-opacity active:scale-90"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                <div className="aspect-[4/3] bg-gray-100">
                  <img src={it.dataUrl} alt="snapshot" className="w-full h-full object-cover" />
                </div>
                <div className="px-3 py-2 bg-white">
                  <div className="text-xs font-black text-gray-800">
                    {new Date(it.capturedAtIso).toLocaleTimeString("zh-TW", { hour12: false })}
                  </div>
                  <div className="text-[10px] font-bold text-gray-400">
                    {new Date(it.capturedAtIso).toLocaleDateString("zh-TW")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <DeleteConfirmDialog 
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title={deleteTarget?.type === 'all' ? "清空相簿？" : "刪除照片？"}
        description={deleteTarget?.type === 'all' ? "這將刪除此植物的所有照片。" : "此照片刪除後將無法復原。"}
      />
    </div>
  );
}


