import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * 植物養護建議 API (Gemini 版)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { plantName, species, currentMoisture, imageUrl } = req.body;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!geminiKey) {
    return res.status(500).json({ error: "Gemini API Key is missing on server" });
  }

  try {
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    let base64Data = "";
    let mimeType = "image/jpeg";

    if (imageUrl && imageUrl.startsWith("http")) {
      const imgRes = await fetch(imageUrl);
      const arrayBuffer = await imgRes.arrayBuffer();
      base64Data = Buffer.from(arrayBuffer).toString("base64");
      mimeType = imgRes.headers.get("content-type") || "image/jpeg";
    } else if (imageUrl) {
      base64Data = imageUrl.includes(",") ? imageUrl.split(",")[1] : imageUrl;
      mimeType = imageUrl.includes("data:") ? imageUrl.split(";")[0].split(":")[1] : "image/jpeg";
    }

    const prompt = `你是一位資深植物專家。
    請根據以下資訊提供一份「精簡」的養護報告：
    植物：${species || plantName}
    目前濕度：${currentMoisture}%
    
    要求：
    1. 必須使用繁體中文回覆。
    2. 回傳格式為純 JSON：
    {
      "analysis": "Markdown 格式報告",
      "moisture": "建議濕度%",
      "sunlight": "建議日照時間"
    }
    3. 報告總字數 150 字以內。
    4. 不要包含任何開場白或解釋，只回傳 JSON。`;

    const parts: any[] = [prompt];
    if (base64Data) {
      parts.push({
        inlineData: {
          data: base64Data,
          mimeType: mimeType,
        },
      });
    }

    const result = await model.generateContent(parts);
    const response = await result.response;
    const text = response.text();

    let finalResult = {
      analysis: "分析暫時不可用",
      moisture: "50%",
      sunlight: "4小時"
    };

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        finalResult = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.log("Gemini JSON Parse failed, using raw text");
      finalResult.analysis = text;
    }

    return res.status(200).json(finalResult);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Gemini analysis failed' });
  }
}
