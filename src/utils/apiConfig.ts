
/**
 * API 設定工具
 * 用於處理本地開發與生產環境（手機 App / Vercel）的 API 路徑切換
 */

export const VERCEL_URL = 'https://plantalk-app.vercel.app';

export const getApiUrl = (path: string): string => {
  // 判斷是否在 Capacitor 環境 (iOS/Android App)
  const isCapacitor = typeof window !== 'undefined' && 
    (window.location.protocol === 'capacitor:' || window.location.protocol === 'http:');
    
  // 判斷是否為本地開發網頁 (localhost)
  const isLocalWeb = typeof window !== 'undefined' && 
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
    window.location.protocol !== 'capacitor:';

  // 確保路徑以 / 開頭
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  // 強制規則：
  // 1. 如果是 Capacitor (App)，絕對要使用 Vercel URL
  // 2. 如果是本地開發網頁，使用相對路徑 (Vite Proxy)
  // 3. 其他情況 (如直接訪問 Vercel 網頁)，使用相對路徑即可
  if (isCapacitor) {
    return `${VERCEL_URL}${cleanPath}`;
  }
  
  return cleanPath;
};
