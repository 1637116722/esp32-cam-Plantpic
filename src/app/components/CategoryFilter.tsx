import { Home, Flower2, Sun } from 'lucide-react';
import React, { useRef, useState, useEffect } from 'react';

interface CategoryFilterProps {
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
}

const categories = [
  { id: 'my-garden', label: 'My Garden', subLabel: 'All Plants', icon: Home },
  { id: 'indoor', label: 'Indoor Plant', subLabel: 'Indoor Plant', icon: Flower2 },
  { id: 'outdoor', label: 'Outdoor Plant', subLabel: 'Outdoor Plant', icon: Sun },
];

export default React.memo(function CategoryFilter({
  selectedCategory,
  onCategoryChange,
}: CategoryFilterProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setStartX(e.pageX - (scrollRef.current?.offsetLeft || 0));
    setScrollLeft(scrollRef.current?.scrollLeft || 0);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    const x = e.pageX - (scrollRef.current?.offsetLeft || 0);
    const walk = (x - startX) * 2; // 滑動倍率
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollLeft - walk;
    }
  };

  return (
    <div className="w-full px-0 -mt-10 mb-2 overflow-visible relative z-30">
      {/* 減少容器高度並保持 overflow-visible，同時使用 -mt-10 向上移動 */}
      <div className="relative h-[160px] flex items-center overflow-visible">
        <div
          ref={scrollRef}
          onMouseDown={handleMouseDown}
          onMouseLeave={handleMouseLeave}
          onMouseUp={handleMouseUp}
          onMouseMove={handleMouseMove}
          className={`
            flex gap-5 overflow-x-auto h-full items-center px-2 py-4
            ${isDragging ? 'cursor-grabbing select-none' : 'cursor-grab'}
            scrollbar-hide
          `}
          style={{ 
            scrollbarWidth: 'none', 
            msOverflowStyle: 'none',
            WebkitOverflowScrolling: 'touch'
          }}
        >
          {categories.map((category) => {
            const Icon = category.icon;
            const isSelected = selectedCategory === category.id;

            return (
              <button
                key={category.id}
                onClick={() => {
                  if (!isDragging) onCategoryChange(category.id);
                }}
                className={`
                  flex-shrink-0
                  w-[140px] h-[90px]
                  rounded-[32px]
                  flex flex-col items-center justify-center
                  gap-2
                  transition-all duration-300 ease-out
                  ${
                    isSelected
                      ? `
                        bg-[#6FCF97]
                        text-white
                        -translate-y-[6px]
                        shadow-[0_16px_32px_rgba(111,207,151,0.45)]
                      `
                      : `
                        bg-white/95
                        text-[#4B5563]
                        shadow-[0_8px_20px_rgba(0,0,0,0.06)]
                        hover:shadow-[0_12px_24px_rgba(0,0,0,0.1)]
                      `
                  }
                  active:scale-95
                `}
              >
                <Icon
                  className={`w-6 h-6 mb-1 ${
                    isSelected ? 'text-white' : 'text-[#6B7280]'
                  }`}
                />

                <div className="text-sm font-bold leading-tight">
                  {category.label}
                </div>

                <div
                  className={`text-xs leading-none opacity-80 ${
                    isSelected ? 'text-white' : 'text-[#9CA3AF]'
                  }`}
                >
                  {category.subLabel}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
});
