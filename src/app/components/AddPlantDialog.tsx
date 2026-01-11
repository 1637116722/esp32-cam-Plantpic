import { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Flower2, Sun, Loader2, Camera, Check } from 'lucide-react';
import { searchPlantImages } from '../../utils/pexelsClient';

interface AddPlantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (name: string, species: string, type: 'indoor' | 'outdoor', imageUrl?: string, cameraId?: string) => void;
}

export default function AddPlantDialog({ open, onOpenChange, onAdd }: AddPlantDialogProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [plantName, setPlantName] = useState('');
  const [plantSpecies, setPlantSpecies] = useState('');
  const [plantType, setPlantType] = useState<'indoor' | 'outdoor' | null>(null);
  const [cameraId, setCameraId] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isLoadingImages, setIsLoadingImages] = useState(false);
  const [manualImageUrl, setManualImageUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleNextStep = async () => {
    if (plantName.trim() && plantSpecies.trim() && plantType) {
      setStep(2);
      setIsLoadingImages(true);
      try {
        const results = await searchPlantImages(plantSpecies.trim() || plantName.trim(), 4);
        setImages(results);
      } catch (error) {
        console.error('Failed to fetch images:', error);
      } finally {
        setIsLoadingImages(false);
      }
    }
  };

  const handleSubmit = () => {
    const finalImage = manualImageUrl || selectedImage || undefined;
    onAdd(plantName.trim(), plantSpecies.trim(), plantType!, finalImage, cameraId.trim() || undefined);
    handleClose();
  };

  const handleClose = () => {
    setPlantName('');
    setPlantSpecies('');
    setPlantType(null);
    setCameraId('');
    setStep(1);
    setImages([]);
    setSelectedImage(null);
    setManualImageUrl('');
    onOpenChange(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setManualImageUrl(reader.result as string);
        setSelectedImage(null);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md overflow-hidden flex flex-col max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{step === 1 ? '添加植物' : '選擇植物照片'}</DialogTitle>
          <DialogDescription>
            {step === 1 ? '請輸入植物名稱並選擇類型' : `為「${plantName}」選擇一張照片或自行上傳`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4">
          {step === 1 ? (
            <div className="flex flex-col gap-6">
              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-700">植物名稱 (小名)</div>
                <Input
                  placeholder="例如：小綠、阿龜..."
                  value={plantName}
                  onChange={(e) => setPlantName(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-700">植物品種</div>
                <Input
                  placeholder="例如：龜背竹、黃金葛..."
                  value={plantSpecies}
                  onChange={(e) => setPlantSpecies(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-700">ESP32-CAM ID (選填)</div>
                <Input
                  placeholder="例如：esp32-cam-01"
                  value={cameraId}
                  onChange={(e) => setCameraId(e.target.value)}
                />
                <p className="text-[10px] text-gray-400">若有使用 ESP32-CAM，請輸入對應的 ID 以連結實時影像</p>
              </div>
              
              <div className="flex flex-col gap-2">
                <div className="text-sm font-medium text-gray-700">選擇類型</div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setPlantType('indoor')}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 transition-all ${
                      plantType === 'indoor'
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : 'border-gray-100 bg-gray-50 text-gray-500 hover:border-gray-200'
                    }`}
                  >
                    <Flower2 className="w-5 h-5" />
                    <span className="font-medium">室內</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlantType('outdoor')}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 transition-all ${
                      plantType === 'outdoor'
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : 'border-gray-100 bg-gray-50 text-gray-500 hover:border-gray-200'
                    }`}
                  >
                    <Sun className="w-5 h-5" />
                    <span className="font-medium">室外</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {isLoadingImages ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-400">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <p>正在搜尋植物照片...</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {images.map((url, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        setSelectedImage(url);
                        setManualImageUrl('');
                      }}
                      className={`relative aspect-square rounded-xl overflow-hidden cursor-pointer border-4 transition-all ${
                        selectedImage === url ? 'border-green-500 scale-[0.98]' : 'border-transparent opacity-80 hover:opacity-100'
                      }`}
                    >
                      <img src={url} alt={`Plant ${idx}`} className="w-full h-full object-cover" />
                      {selectedImage === url && (
                        <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center">
                          <div className="bg-white rounded-full p-1 shadow-lg">
                            <Check className="w-5 h-5 text-green-500" />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  
                  {/* Custom Upload Button */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className={`relative aspect-square rounded-xl overflow-hidden cursor-pointer border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-all ${
                      manualImageUrl ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
                    }`}
                  >
                    {manualImageUrl ? (
                      <>
                        <img src={manualImageUrl} alt="Preview" className="w-full h-full object-cover opacity-50" />
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                          <div className="bg-white rounded-full p-1 shadow-lg">
                            <Check className="w-5 h-5 text-green-500" />
                          </div>
                          <span className="text-xs font-bold text-green-700 bg-white/80 px-2 py-0.5 rounded-full">已選自定義</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <Camera className="w-8 h-8 text-gray-400" />
                        <span className="text-xs text-gray-500 font-medium">上傳照片</span>
                      </>
                    )}
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      accept="image/*"
                      onChange={handleFileChange}
                    />
                  </div>
                </div>
              )}
              
              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-700">或是貼上圖片網址</div>
                <Input
                  placeholder="https://..."
                  value={manualImageUrl && !manualImageUrl.startsWith('data:') ? manualImageUrl : ''}
                  onChange={(e) => {
                    setManualImageUrl(e.target.value);
                    setSelectedImage(null);
                  }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button
            variant="ghost"
            onClick={step === 1 ? handleClose : () => setStep(1)}
            className="text-gray-500"
          >
            {step === 1 ? '取消' : '上一步'}
          </Button>
          <Button
            onClick={step === 1 ? handleNextStep : handleSubmit}
            disabled={step === 1 ? (!plantName.trim() || !plantType) : (!selectedImage && !manualImageUrl)}
            className="bg-green-600 hover:bg-green-700 text-white min-w-[80px]"
          >
            {step === 1 ? '下一步' : '完成添加'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

