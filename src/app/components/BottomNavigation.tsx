import { House, Images, ScanLine, Calendar, Search, AlertTriangle } from 'lucide-react';

const navItems = [
  { id: 'scan', icon: ScanLine, label: '掃描' },
  { id: 'photos', icon: Images, label: '相簿' },
  { id: 'home', icon: House, label: '首頁' },
  { id: 'journal', icon: Calendar, label: '日誌' },
  { id: 'search', icon: Search, label: '搜尋' },
];

interface BottomNavigationProps {
  activeTab: string;
  onChange: (tabId: string) => void;
  hasPendingJournal?: boolean;
}

export default function BottomNavigation({ activeTab, onChange, hasPendingJournal }: BottomNavigationProps) {
  return (
    <div className="w-full px-4 pb-6 pt-4">
      {/* Navigation bar matching the image style */}
      <div className="relative">
        {/* Outer glow/shadow */}
        <div className="absolute inset-0 bg-gradient-to-b from-gray-200/30 to-gray-300/40 blur-xl rounded-[2rem]" />
        
        {/* Main navigation container */}
        <div className="relative bg-white rounded-[2rem] shadow-lg px-2 py-3">
          <div className="flex items-center justify-around">
            {navItems.map((item, index) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              const isHome = item.id === 'home';
              const isJournal = item.id === 'journal';
              
              return (
                <button
                  key={item.id}
                  onClick={() => onChange(item.id)}
                  className="relative flex flex-col items-center gap-1 px-3 py-2 transition-all"
                >
                  {/* Light green circle background for home button */}
                  {isHome && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-12 h-12 rounded-full bg-green-100/80"></div>
                    </div>
                  )}
                  
                  {/* Journal pending indicator */}
                  {isJournal && hasPendingJournal && (
                    <div className="absolute top-1 right-1 z-20 animate-pulse">
                      <AlertTriangle className="w-3 h-3 text-yellow-500 fill-yellow-500/20" />
                    </div>
                  )}

                  <Icon 
                    className={`relative z-10 w-6 h-6 transition-colors ${
                      isActive 
                        ? 'text-green-600' 
                        : 'text-gray-400'
                    }`}
                    strokeWidth={isActive ? 2 : 1.5}
                  />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
