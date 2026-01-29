import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * 植物對話 API (Gemini 版)
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
      message: "植物對話服務已就緒 (POST only)",
      endpoint: "/api/chat"
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { messages } = req.body;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!geminiKey) {
    return res.status(200).json({ text: "Gemini API 金鑰未設定，請聯繫管理員。" });
  }

  try {
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const systemMsg = "你是專注植物栽培與照護的助手。回答必須使用繁體中文，且內容具體、可操作。當被詢問濕度或健康度時，請務必提供具體的數值百分比。若問題不屬於植物照護，請簡短說明你僅回覆植物相關問題。";
    
    const userMessages = messages?.filter((m: any) => m.role !== 'system') || [];
    const lastMsg = userMessages[userMessages.length - 1];
    
    let parts: any[] = [systemMsg];

    if (lastMsg) {
      if (typeof lastMsg.content === 'string') {
        parts.push(`使用者問題：${lastMsg.content}`);
      } else if (Array.isArray(lastMsg.content)) {
        // 處理多模態訊息 (vision)
        for (const part of lastMsg.content) {
          if (part.type === 'text') {
            parts.push(part.text);
          } else if (part.type === 'image_url' && part.image_url?.url) {
            const imageUrl = part.image_url.url;
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

            parts.push({
              inlineData: {
                data: base64Data,
                mimeType: mimeType,
              },
            });
          }
        }
      }
    }

    const result = await model.generateContent(parts);
    const response = await result.response;
    const text = response.text();

    return res.status(200).json({ text: text || "抱歉，我現在無法回答這個問題。" });
  } catch (error: any) {
    console.error("Chat API Error (Gemini):", error);
    return res.status(500).json({ text: `發生錯誤：${error.message}` });
  }
}
