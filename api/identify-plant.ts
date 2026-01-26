import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * 植物狀態分析 API (Gemini 全能版)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { imageUrl, moisture, plantName, species } = req.body || {};
  if (!imageUrl) {
    return res.status(400).json({ error: "imageUrl is required" });
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return res.status(500).json({ error: "Gemini API Key is missing on server" });
  }

  try {
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    let base64Data = "";
    let mimeType = "image/jpeg";

    if (imageUrl.startsWith("http")) {
      const imgRes = await fetch(imageUrl);
      const arrayBuffer = await imgRes.arrayBuffer();
      base64Data = Buffer.from(arrayBuffer).toString("base64");
      mimeType = imgRes.headers.get("content-type") || "image/jpeg";
    } else {
      base64Data = imageUrl.includes(",") ? imageUrl.split(",")[1] : imageUrl;
      mimeType = imageUrl.includes("data:") ? imageUrl.split(";")[0].split(":")[1] : "image/jpeg";
    }

    const prompt = `你是一位資深的植物學家與植保專家。
    請分析這張植物照片，並結合以下資訊：
    - 使用者提供的植物名稱：${plantName || "未提供"}
    - 可能的品種：${species || "未知"}
    - 目前環境濕度：${moisture || "未知"}%

    請執行以下任務：
    1. 辨識植物品種（如果使用者提供的名稱不準確，請更正）。
    2. 評估植物的健康狀態。
    3. 如果有病徵，請識別病名、原因及提供救治建議。
    4. 計算一個 0-100 的健康分數 (healthScore)。

    請務必以繁體中文回覆，且格式必須為純 JSON，不得包含任何 Markdown 標記或開場白：
    {
      "isHealthy": boolean,
      "healthScore": number,
      "species": "辨識出的植物品種名稱",
      "label": "主要狀態或病徵名稱",
      "diseases": [
        {
          "name": "病徵名稱",
          "probability": 0.xx,
          "cause": "病因分析",
          "treatment": {
            "biological": ["物理或生物防治方法"],
            "chemical": ["建議藥劑"],
            "prevention": ["預防措施"]
          }
        }
      ],
      "advice": "總體建議 (Markdown 格式)"
    }
    
    注意：如果植物非常健康，diseases 陣列可以為空，但 label 應設為 \"健康\"。`;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: base64Data,
          mimeType: mimeType,
        },
      },
    ]);

    const response = await result.response;
    const text = response.text();
    
    // 提取 JSON
    let finalData;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        finalData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Could not find JSON in Gemini response");
      }
    } catch (e) {
      console.error("Gemini Parse Error:", e, text);
      throw new Error("Gemini 回傳格式錯誤");
    }

    res.status(200).json({
      success: true,
      ...finalData
    });

  } catch (error: any) {
    console.error("Analysis API Error (Gemini):", error);
    res.status(500).json({ error: error.message });
  }
}
