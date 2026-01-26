#include <esp_camera.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ===========================
// 1. 修改你的 WiFi 資訊
// ===========================
const char* ssid = "H3C_2F801D";
const char* password = "15063890008";

// =========================== 
// 2. 你的雲端伺服器網址 
// =========================== 
const char* baseUrl = "https://esp32-cam-relay-oqmh.onrender.com";

int wifiFailureCount = 0;
const int maxWifiFailures = 3; // 連接失敗 3 次後自動重啟

// ===========================
// ESP32-CAM 引腳定義 (AI-THINKER 模組)
// ===========================
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

void setup() {
  Serial.begin(115200);
  
  // 設定相機
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM; // 3.x 版本改名為 sccb_sda
  config.pin_sccb_scl = SIOC_GPIO_NUM; // 3.x 版本改名為 sccb_scl
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;

  if(psramFound()){
    config.frame_size = FRAMESIZE_VGA;
    config.jpeg_quality = 10;
    config.fb_count = 2;
  } else {
    config.frame_size = FRAMESIZE_SVGA;
    config.jpeg_quality = 12;
    config.fb_count = 1;
  }

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed with error 0x%x", err);
    return;
  }

  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  int setupRetry = 0;
  while (WiFi.status() != WL_CONNECTED && setupRetry < 40) { // 最多等 20 秒
    delay(500);
    Serial.print(".");
    setupRetry++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected");
  } else {
    Serial.println("\nWiFi connection failed in setup, will retry in loop");
  }
}

// 建議每 10 秒執行一次輪詢
void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\nWiFi 斷開，正在嘗試重新連接...");
    WiFi.disconnect();
    WiFi.begin(ssid, password);
    
    int retryCount = 0;
    while (WiFi.status() != WL_CONNECTED && retryCount < 20) {
      delay(500);
      Serial.print(".");
      retryCount++;
    }
    
    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("\nWiFi 已重新連接");
      wifiFailureCount = 0; // 重置失敗計數
    } else {
      wifiFailureCount++;
      Serial.printf("\nWiFi 連接失敗 (%d/%d)\n", wifiFailureCount, maxWifiFailures);
      
      if (wifiFailureCount >= maxWifiFailures) {
        Serial.println("多次連接失敗，正在重啟 ESP32...");
        delay(1000);
        ESP.restart();
      }
      return;
    }
  }

  // 1. 檢查伺服器是否有拍照請求 (包含手動刷新與自動排程)
  HTTPClient http;
  String checkUrl = String(baseUrl) + "/api/check-request";
  
  http.begin(checkUrl);
  int httpCode = http.GET();
  
  if (httpCode == 200) {
    String payload = http.getString();
    
    // 解析 JSON
    StaticJsonDocument<200> doc;
    DeserializationError error = deserializeJson(doc, payload);
    
    if (!error) {
      bool shouldCapture = doc["shouldCapture"] | false;
      String requestId = doc["requestId"] | "";
      
      if (shouldCapture) {
        Serial.println("收到拍照請求，RequestId: " + requestId);
        // 2. 執行拍照並上傳
        captureAndUpload(requestId);
      }
    } else {
      Serial.print("JSON 解析失敗: ");
      Serial.println(error.f_str());
    }
  }
  http.end();
  
  delay(10000); // 每 10 秒檢查一次
}

void captureAndUpload(String requestId) {
  camera_fb_t * fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("Camera capture failed");
    return;
  }

  HTTPClient http;
  // 3. 上傳照片，務必帶上 requestId
  String uploadUrl = String(baseUrl) + "/api/upload";
  if (requestId != "") {
    uploadUrl += "?requestId=" + requestId;
  }
  
  http.begin(uploadUrl);
  http.setTimeout(30000); 

  String boundary = "ESP32Boundary";
  http.addHeader("Content-Type", "multipart/form-data; boundary=" + boundary);

  String head = "--" + boundary + "\r\nContent-Disposition: form-data; name=\"image\"; filename=\"esp32.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n";
  String tail = "\r\n--" + boundary + "--\r\n";
  
  size_t totalLen = head.length() + fb->len + tail.length();
  uint8_t *full_payload = (uint8_t *)malloc(totalLen);
  if (full_payload) {
    memcpy(full_payload, head.c_str(), head.length());
    memcpy(full_payload + head.length(), fb->buf, fb->len);
    memcpy(full_payload + head.length() + fb->len, tail.c_str(), tail.length());

    int httpResponseCode = http.sendRequest("POST", full_payload, totalLen);

    if (httpResponseCode > 0) {
      Serial.printf("Upload success, Response code: %d\n", httpResponseCode);
    } else {
      Serial.printf("Upload failed, Error: %s\n", http.errorToString(httpResponseCode).c_str());
    }
    free(full_payload);
  }

  http.end();
  esp_camera_fb_return(fb);
}