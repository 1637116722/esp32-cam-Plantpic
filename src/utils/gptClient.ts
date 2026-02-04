import { getApiUrl } from "./apiConfig";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function askPlantGPT(messages: ChatMessage[]) {
  try {
    const payload = {
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    };
    
     const apiUrl = getApiUrl('/api/chat');

     const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      console.error(`API Error (${apiUrl}):`, res.status, errorData);
      return null;
    }
    const data = await res.json();
    const text = data?.text ?? null;
    if (!text || typeof text !== "string") return null;
    return text;
  } catch {
    return null;
  }
}

export async function translateToEnglish(text: string): Promise<string> {
  const hasChinese = /[\u4e00-\u9fa5]/.test(text);
  if (!hasChinese) return text;

  const prompt = `將以下植物名稱翻譯成英文，只回傳英文名稱，不要有其他解釋：\n${text}`;
  
  try {
    const response = await askPlantGPT([
      { role: "user", content: prompt }
    ]);
    return response ? response.trim() : text;
  } catch (error) {
    console.error('Translation error:', error);
    return text;
  }
}

export async function checkIfPlant(name: string): Promise<boolean> {
  const prompt = `請判斷「${name}」是否為植物名稱（包含花、草、樹、多肉、蔬果等）。請僅回答「是」或「否」，不要有其他文字。`;
  
  try {
    const response = await askPlantGPT([
      { role: "user", content: prompt }
    ]);
    
    if (!response) return true;
    
    const cleanResponse = response.trim().replace(/[。！]/g, '');
    return cleanResponse.includes("是") || cleanResponse.toLowerCase().includes("yes");
  } catch (error) {
    console.error('Plant check error:', error);
    return true; 
  }
}

export async function verifyImageWithPlant(imageUrl: string, plantName: string): Promise<boolean> {
  const messages = [
    {
      role: "user",
      content: [
        { type: "text", text: `這張圖片內容是「${plantName}」植物嗎？請僅回答「是」或「否」。` },
        { type: "image_url", image_url: { url: imageUrl } }
      ]
    }
  ];

  try {
    const apiUrl = getApiUrl('/api/chat');

    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, type: 'vision' }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("Image verification failed:", res.status, errText.slice(0, 200));
      return false;
    }

    let data: any = null;
    try {
      data = await res.json();
    } catch (e) {
      const errText = await res.text().catch(() => "");
      console.error("Image verification bad JSON:", e, errText.slice(0, 200));
      return false;
    }
    const text = data?.text || "";
    
    return text.includes("是") || text.toLowerCase().includes("yes");
  } catch (error) {
    console.error('Image verification error:', error);
    return false;
  }
}
