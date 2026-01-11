import { Droplets, Bug, X, CheckCircle2 } from 'lucide-react';

export interface ToastMessage {
  id: string;
  plantName: string;
  type: 'watering' | 'health' | 'resolved';
  message: string;
}

interface ToastNotificationProps {
  notifications: ToastMessage[];
  onClose: (id: string) => void;
  onClick: (id: string) => void;
}

export default function ToastNotification({ notifications, onClose, onClick }: ToastNotificationProps) {
  return (
    <div className="absolute top-24 right-4 z-[9999] flex flex-col gap-2 pointer-events-none w-[180px]">
      {notifications.map((toast) => (
        <div
          key={toast.id}
          className="
            pointer-events-auto
            bg-white/98 backdrop-blur-md 
            rounded-2xl p-2.5
            shadow-[0_8px_20px_rgba(0,0,0,0.1)] 
            border border-gray-100/50
            flex items-center gap-2.5
            animate-in slide-in-from-right duration-500
          "
          onClick={() => onClick(toast.id)}
        >
          <div className={`
            shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-white
            ${toast.type === 'watering' ? 'bg-blue-500' : 
              toast.type === 'health' ? 'bg-red-500' : 
              'bg-green-500'}
          `}>
            {toast.type === 'watering' ? <Droplets className="w-4 h-4" /> : 
             toast.type === 'health' ? <Bug className="w-4 h-4" /> : 
             <CheckCircle2 className="w-4 h-4" />}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-black text-gray-900 truncate leading-none mb-1">
              {toast.plantName}
            </div>
            <div className="text-[9px] font-bold text-gray-500 leading-tight">
              {toast.message}
            </div>
          </div>

          <button 
            onClick={(e) => {
              e.stopPropagation();
              onClose(toast.id);
            }}
            className="shrink-0 w-5 h-5 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-300"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
