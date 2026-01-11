import { checkIfPlant, verifyImageWithPlant, translateToEnglish } from "./gptClient";

export async function searchVerifiedPlantImages(query: string, count: number = 1): Promise<string[]> {
  const englishQuery = await translateToEnglish(query);
  const isPlant = await checkIfPlant(englishQuery);
  if (!isPlant) return [];

  const apiKey = import.meta.env.VITE_PEXELS_API_KEY;
  if (!apiKey) return [];

  const plantQuery = `${englishQuery} plant botanical`;

  try {
    const response = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(plantQuery)}&per_page=${count * 3}&orientation=landscape`,
      {
        headers: {
          Authorization: apiKey,
        },
      }
    );

    if (!response.ok) return [];

    const data = await response.json();
    const photos = data.photos || [];
    const verifiedImages: string[] = [];

    for (const p of photos) {
      if (verifiedImages.length >= count) break;

      const imageUrl = p.src.large;
      const valid = await verifyImageWithPlant(imageUrl, query);
      if (valid) {
        verifiedImages.push(imageUrl);
      }
    }

    return verifiedImages;
  } catch (error) {
    console.error('Pexels API error:', error);
    return [];
  }
}

export async function searchPlantImages(query: string, count: number = 4): Promise<string[]> {
  const englishQuery = await translateToEnglish(query);
  const apiKey = import.meta.env.VITE_PEXELS_API_KEY;
  if (!apiKey) return [];

  const plantQuery = `${englishQuery} plant botanical`;

  try {
    const response = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(plantQuery)}&per_page=${count * 3}&orientation=landscape`,
      {
        headers: {
          Authorization: apiKey,
        },
      }
    );

    if (!response.ok) return [];

    const data = await response.json();
    const photos = data.photos || [];
    
    // 獲取候選圖片 URL
    const candidates = photos.map((p: any) => p.src.large);
    const verifiedImages: string[] = [];

    // 並行驗證所有圖片以提高速度
    const verificationPromises = candidates.map(async (url) => {
      try {
        const isValid = await verifyImageWithPlant(url, englishQuery);
        return { url, isValid };
      } catch {
        return { url, isValid: false };
      }
    });

    const results = await Promise.all(verificationPromises);
    
    // 過濾出通過驗證的圖片
    for (const result of results) {
      if (result.isValid) {
        verifiedImages.push(result.url);
      }
      if (verifiedImages.length >= count) break;
    }

    // 如果驗證後的圖片不足，補上一些未驗證但最相關的（保證用戶有得選）
    if (verifiedImages.length < count) {
      const remaining = candidates.filter(url => !verifiedImages.includes(url));
      verifiedImages.push(...remaining.slice(0, count - verifiedImages.length));
    }

    return verifiedImages.slice(0, count);
  } catch (error) {
    console.error('Pexels API error:', error);
    return [];
  }
}
