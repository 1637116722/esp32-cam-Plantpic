import { PlantItem } from "../components/PlantGrid";

/**
 * 【植物數據同步檔】
 * 此檔案由 App 自動同步更新，您也可以手動修改這裡的數值，重新整理 App 後會生效。
 */
export const initialPlants: PlantItem[] = [
  {
    "id": "小西-1768125095385",
    "name": "小西",
    "species": "青蛙",
    "type": "indoor",
    "imageUrl": "https://images.pexels.com/photos/4609689/pexels-photo-4609689.jpeg?auto=compress&cs=tinysrgb&h=650&w=940",
    "moisture": 100,
    "health": 100,
    "aiAnalysis": "很抱歉，但「青蛙」不是一株植物，而是一種動物。如果您需要了解某種植物的養護指南，請提供具體的植物名稱，我將為您提供詳細的養護指南。",
    "dailyRecommendation": {
      "moisture": "60%",
      "sunlight": "4小時",
      "lastUpdated": "2026-01-11"
    }
  },
  {
    "id": "esp-1768125148019",
    "name": "esp",
    "species": "梔子花",
    "type": "indoor",
    "imageUrl": "https://images.pexels.com/photos/666839/pexels-photo-666839.jpeg?auto=compress&cs=tinysrgb&h=650&w=940",
    "cameraId": "01",
    "moisture": 100,
    "health": 100,
    "aiAnalysis": "品種：梔子花\n\n🌿日照：梔子花喜歡半陰的環境，避免直射太陽光，尤其是在下午的高溫時段。今日標準建議將其移至散射光充足的地方，避免烈日暴曬。\n\n💧濕度：目前花盆的濕度數值為100%，根據今日養護標準，此濕度略嫌過高。梔子花雖喜濕，但過濕易導致根部腐爛。建議適當排水，保持土壤微濕即可。\n\n📝重點：\n1. 控制好濕度，避免過濕。\n2. 確保充足的散射光。\n3. 定期檢查根部健康，如有腐爛應立即處理。",
    "dailyRecommendation": {
      "moisture": "50%",
      "sunlight": "4小時",
      "lastUpdated": "2026-01-11"
    }
  }
];
