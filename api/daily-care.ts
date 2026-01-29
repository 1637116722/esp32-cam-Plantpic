import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * 每日養護建議 API (Gemini 版)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. 設定 CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // 2. 處理 OPTIONS 請求
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 3. 測試用 GET 請求
  if (req.method === 'GET') {
    return res.status(200).json({ 
      status: "alive", 
      message: "每日養護服務已就緒 (POST only)",
      endpoint: "/api/daily-care"
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { plantName, species, weather } = req.body;
  const targetPlant = species || plantName;

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return res.status(200).json({ 
      success: true, 
      moisture: "50%", 
      sunlight: "4小時",
      note: "Gemini API Key 未設定，使用預設值"
    });
  }

  try {
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const weatherInfo = weather ? `當前天氣：${weather.condition}，溫度：${weather.temp}°C (最高 ${weather.high}°C / 最低 ${weather.low}°C)。` : "當前天氣：晴朗，溫度：25°C。";

    const prompt = `你是一位資深的植物學家。請根據當前的天氣狀況與植物品種，提供今日精確的「建議濕度」與「建議日照時間」。
    植物：${targetPlant}
    ${weatherInfo}
    
    要求：
    1. 必須考慮植物的原始習性。
    2. 結合天氣動態調整。
    3. 回傳純 JSON 格式：{"moisture": "xx%", "sunlight": "x小時"}。
    4. 不要包含任何開場白或解釋，只回傳 JSON。`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    let careData = { moisture: "50%", sunlight: "4小時" };
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        careData = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.log("Gemini JSON Parse failed for daily-care (Vercel)");
    }

    res.status(200).json({ success: true, ...careData });
  } catch (error: any) {
    console.error("Daily Care Error (Gemini):", error);
    res.status(200).json({ 
      success: true, 
      moisture: "50%", 
      sunlight: "4小時",
      error: error.message 
    });
  }
}
