# 如何在應用中使用 3D GLB 模型

## 步驟說明

### 1. 準備您的 GLB 文件
將您的 Unity 導出的 GLB 文件放置在項目的 `public` 文件夾中。例如：
```
public/
  models/
    character.glb
```

### 2. 在 App.tsx 中使用模型
更新 `/src/app/App.tsx` 文件，傳入模型路徑給 CharacterPlaceholder 組件：

```tsx
import { TimeWeatherHeader } from './components/TimeWeatherHeader';
import { CharacterPlaceholder } from './components/CharacterPlaceholder';
import { BottomNavigation } from './components/BottomNavigation';

export default function App() {
  return (
    <div className="size-full max-w-md mx-auto flex flex-col bg-[#F5F3F0] overflow-hidden">
      <TimeWeatherHeader />
      
      {/* 傳入 GLB 模型路徑 */}
      <CharacterPlaceholder modelPath="/models/character.glb" />
      
      <BottomNavigation />
    </div>
  );
}
```

### 3. 功能說明

**Character3D 組件** (`/src/app/components/Character3D.tsx`) 提供：
- 自動加載 GLB 格式的 3D 模型
- 環境光和方向光照明
- 軌道控制器（可以用鼠標旋轉查看模型）
- 懸浮加載狀態

**CharacterPlaceholder 組件** (`/src/app/components/CharacterPlaceholder.tsx`):
- 如果提供 `modelPath` 屬性，顯示 3D 模型
- 如果沒有提供路徑，顯示原有的佔位符動畫

### 4. 自定義 3D 模型設置

您可以在 `Character3D.tsx` 中調整以下參數：

```tsx
// 調整模型大小
<primitive object={scene} scale={1.5} />

// 調整相機位置和視野
<Canvas camera={{ position: [0, 0, 5], fov: 50 }}>

// 調整光照
<ambientLight intensity={0.5} />
<directionalLight position={[10, 10, 5]} intensity={1} />

// 調整控制器限制
<OrbitControls 
  enableZoom={true}
  enablePan={false}
  minPolarAngle={Math.PI / 4}
  maxPolarAngle={Math.PI / 1.5}
/>
```

### 5. 注意事項

- GLB 文件應該放在 `public` 文件夾中
- 路徑以 `/` 開頭（例如 `/models/character.glb`）
- 確保 GLB 文件大小合理，以保證加載速度
- 模型會在 264x264 像素的容器中顯示，與原有佔位符大小一致

### 6. 移除 3D 模型

如果您想恢復到原來的佔位符，只需在 App.tsx 中不傳入 modelPath：

```tsx
<CharacterPlaceholder />
```
