const express = require('express');
const multer = require('multer');
const cors = require('cors');
const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// 儲存最新照片與時間的記憶體空間
let latestImage = null; 
let lastUploadTime = null;
let lastHeartbeatTime = null; // 新增：最後一次與 ESP32 通訊的時間
let lastUploadRequestId = null;
let photoRequestTime = null; // 用來標記 App 何時請求了新照片
let photoRequestId = null;

// 相簿與定時設定
let appSettings = {
  captureInterval: 300, // 預設 5 分鐘 (秒)
  retentionHours: 24,
  autoDelete: true
};

// 照片歷史記錄
let photoHistory = [];
const MAX_HISTORY_SIZE = 100;

// 定時拍照邏輯 (伺服器主動標記需要拍照)
let lastAutoCaptureTime = Date.now();

app.use(cors());
app.use(express.json());

// 首頁測試 (恢復顯示狀態)
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    message: 'ESP32-CAM Relay Server is running!',
    settings: appSettings,
    historyCount: photoHistory.length,
    pendingRequest: !!photoRequestTime
  });
});

// App 請求拍照的接口
app.get('/api/request-photo', (req, res) => {
  photoRequestTime = new Date().toISOString();
  photoRequestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  console.log(`App 請求拍照，requestId=${photoRequestId}`);
  res.json({ status: 'requested', time: photoRequestTime, requestId: photoRequestId });
});

// 獲取相簿歷史
app.get('/api/photos', (req, res) => {
  res.json(photoHistory.map(p => ({
    id: p.id,
    timestamp: p.timestamp
  })));
});

// 獲取單張歷史照片
app.get('/api/image/:id', (req, res) => {
  const photo = photoHistory.find(p => p.id === req.params.id);
  if (photo) {
    res.set('Content-Type', 'image/jpeg');
    res.send(photo.buffer);
  } else {
    res.status(404).send('Photo not found');
  }
});

// 儲存設定
app.post('/api/settings', (req, res) => {
  appSettings = { ...appSettings, ...req.body };
  console.log('更新設定:', appSettings);
  res.json({ status: 'ok', settings: appSettings });
});

// ESP32-CAM 檢查是否有拍照請求的接口
app.get('/api/check-request', (req, res) => {
  lastHeartbeatTime = new Date().toISOString(); // 更新心跳時間
  const now = Date.now();
  const secondsSinceLastAuto = (now - lastAutoCaptureTime) / 1000;

  // 判斷是否觸發定時拍照
  let shouldAutoCapture = false;
  if (secondsSinceLastAuto >= appSettings.captureInterval) {
    shouldAutoCapture = true;
    lastAutoCaptureTime = now;
    photoRequestId = `auto-${now}`; // 給定時拍照一個 ID
  }

  if (photoRequestTime || shouldAutoCapture) {
    res.json({ 
      shouldCapture: true, 
      requestId: photoRequestId 
    });
    photoRequestTime = null; // 處理完後重置
    photoRequestId = null;
  } else {
    res.json({ shouldCapture: false, requestId: null });
  }
});

// 獲取最新照片資訊 (時間)
app.get('/api/info', (req, res) => {
  res.json({
    lastUploadTime: lastUploadTime,
    lastHeartbeatTime: lastHeartbeatTime,
    lastUploadRequestId: lastUploadRequestId,
    serverTime: new Date().toISOString()
  });
});

// ESP32-CAM 上傳接口
app.post('/api/upload', upload.single('image'), (req, res) => {
  lastHeartbeatTime = new Date().toISOString(); // 上傳也算心跳
  if (req.file) {
    const uploadTime = new Date().toISOString();
    latestImage = req.file.buffer;
    lastUploadTime = uploadTime;
    lastUploadRequestId = typeof req.query.requestId === 'string' ? req.query.requestId : null;
    
    // 新增到照片歷史記錄 (相簿)
    const photoId = Date.now().toString();
    photoHistory.unshift({
      id: photoId,
      timestamp: uploadTime,
      buffer: req.file.buffer
    });
    
    // 保持歷史記錄大小限制
    if (photoHistory.length > MAX_HISTORY_SIZE) {
      photoHistory.pop();
    }

    // 處理自動刪除過期照片 (根據 retentionHours)
    if (appSettings.autoDelete) {
      const cutoff = Date.now() - (appSettings.retentionHours * 60 * 60 * 1000);
      photoHistory = photoHistory.filter(p => new Date(p.timestamp).getTime() > cutoff);
    }

    console.log(`收到來自 ESP32 的新照片，時間：${lastUploadTime} requestId=${lastUploadRequestId ?? 'null'}`);
    res.status(200).send('OK');
  } else {
    res.status(400).send('未收到圖片');
  }
});

// App 讀取接口
// App 會發送 GET 請求來獲取最新的一張照片
app.get('/api/image', (req, res) => {
  if (latestImage) {
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');
    if (lastUploadTime) res.set('X-Last-Upload-Time', lastUploadTime);
    if (lastUploadRequestId) res.set('X-Last-Upload-Request-Id', lastUploadRequestId);
    res.send(latestImage);
  } else {
    // 若尚未有照片，可以回傳一個 404 或預設訊息
    res.status(404).send('目前沒有可用的照片');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`伺服器已啟動：http://localhost:${PORT}`);
});
