import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { imageUrl, plantName, species, currentMoisture } = req.body;
  if (!plantName && !species) {
    return res.status(400).json({ error: "plantName or species is required" });
  }

  const apiKey = process.env.HUGGING_FACE_API_KEY || process.env.VITE_HUGGING_FACE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Hugging Face API Key is missing on server" });
  }

  try {
    const targetPlant = species || plantName;
    const label = targetPlant;
    const confidence = 1.0;
    const method = "name-based-analysis";
    let analysis = null;

    try {
      const moistureInfo = currentMoisture !== undefined ? `目前花盆濕度數值為：${currentMoisture}%。` : "";
      const messages = [
        {
          role: "system",
          content: `你是一位植物專家。請針對植物品種提供養護指南。要求：
1. 標頭首行必須顯示「品種：[植物名稱]」。
2. 使用繁體中文。
3. 內容需包含：🌿日照（具體建議時數）、💧濕度（包含環境濕度建議與針對當前數值的評價）、📝重點。
4. 特別注意：如果提供當前濕度數值，請判斷該數值對於該植物是否合適（如：太乾、太濕或剛好），並給出具體建議。
5. 保持精簡但專業。`
        },
        {
          role: "user",
          content: `請分析「${targetPlant}」並提供養護重點。${moistureInfo}`
        }
      ];

      const llmResult = await callHFChatModel(
        "Qwen/Qwen2.5-7B-Instruct",
        apiKey,
        {
          messages,
          temperature: 0.6,
          max_tokens: 500
        }
      );

      analysis = llmResult.choices?.[0]?.message?.content || "";
    } catch (e: any) {
      console.error("LLM Error:", e);
      return res.status(200).json({ 
        success: false, 
        error: `AI 服務回傳錯誤: ${e.message || "未知錯誤"}` 
      });
    }

    if (!analysis) {
      return res.status(200).json({
        success: false,
        analysis: null,
        error: "AI 未能生成回應，請稍後再試。"
      });
    }

    res.status(200).json({
      success: true,
      analysis: analysis,
      targetPlant: targetPlant
    });

  } catch (error: any) {
    console.error("Analysis Error:", error);
    res.status(500).json({ error: error.message });
  }
}

async function callHFChatModel(modelId: string, apiKey: string, payload: any): Promise<any> {
  const fullUrl = `https://router.huggingface.co/v1/chat/completions`;
  
  const body = {
    model: modelId,
    ...payload
  };

  const fetchModel = async () => {
    return await fetch(fullUrl, {
      headers: { 
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      method: "POST",
      body: JSON.stringify(body),
    });
  };

  let response = await fetchModel();
  let result = await response.json().catch(() => ({ error: "Failed to parse JSON" }));

  if (!response.ok) {
    throw new Error(result.error?.message || result.error || `HF chat model failed with status ${response.status}`);
  }

  return result;
}
