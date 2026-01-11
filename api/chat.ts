import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).end();
  }
  const { messages, type } = req.body;
  
  try {
    const token = process.env.HUGGING_FACE_API_KEY;
    if (!token) {
      return res.status(200).json({ text: "Hugging Face API 金鑰未設定。" });
    }

    // 使用 Qwen2.5 以獲得更穩定的中文回覆
    const model = type === 'vision' 
      ? "meta-llama/Llama-3.2-11B-Vision-Instruct" 
      : "Qwen/Qwen2.5-7B-Instruct";

    const body = {
      model,
      messages: type === 'vision' ? messages : [
        {
          role: "system",
          content: "你是專注植物栽培與照護的助手。回答必須使用繁體中文，且內容具體、可操作。若問題不屬於植物照護，請簡短說明你僅回覆植物相關問題。",
        },
        ...messages,
      ],
      temperature: 0.7,
      max_tokens: 500,
    };

    const r = await fetch(`https://router.huggingface.co/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await r.json().catch(() => null);
    if (!r.ok) {
      return res.status(200).json({ text: "否", error: data?.error });
    }
    
    const text = data?.choices?.[0]?.message?.content || "";
    res.status(200).json({ text: text.trim() });
  } catch (err) {
    res.status(200).json({ text: "否" });
  }
}
