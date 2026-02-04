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

    // 限制並行數，避免行動裝置或弱網路上大量請求失敗
    const concurrency = 3;
    const results: { url: string; isValid: boolean }[] = new Array(candidates.length);
    let cursor = 0;

    const worker = async () => {
      while (cursor < candidates.length) {
        const currentIndex = cursor++;
        const url = candidates[currentIndex];
        try {
          const isValid = await verifyImageWithPlant(url, englishQuery);
          results[currentIndex] = { url, isValid };
        } catch {
          results[currentIndex] = { url, isValid: false };
        }
      }
    };

    const workerCount = Math.min(concurrency, candidates.length);
    await Promise.all(Array.from({ length: workerCount }, worker));
    
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
