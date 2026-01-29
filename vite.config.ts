import 'dotenv/config'
import { defineConfig, type Plugin, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { GoogleGenerativeAI } from "@google/generative-ai"

import { VitePWA } from 'vite-plugin-pwa'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const plantChatApiPlugin: Plugin = {
  name: 'plant-chat-api',
  configureServer(server) {
    server.middlewares.use('/api/save-plants', async (req, res, next) => {
      if (req.method !== 'POST') {
        res.statusCode = 405
        res.end()
        return
      }
      try {
        let raw = ''
        req.on('data', (chunk) => (raw += chunk))
        await new Promise<void>((resolve) => req.on('end', () => resolve()))
        const { plants } = JSON.parse(raw || '{}')
        
        if (Array.isArray(plants)) {
          const filePath = path.resolve(__dirname, './src/app/data/plantsData.ts')
          const content = `import { PlantItem } from "../components/PlantGrid";\n\n/**\n * 【植物數據同步檔】\n * 此檔案由 App 自動同步更新，您也可以手動修改這裡的數值，重新整理 App 後會生效。\n */\nexport const initialPlants: PlantItem[] = ${JSON.stringify(plants, null, 2)};\n`
          fs.writeFileSync(filePath, content, 'utf-8')
          
          res.statusCode = 200
          res.end(JSON.stringify({ success: true }))
        } else {
          res.statusCode = 400
          res.end(JSON.stringify({ success: false, error: 'Invalid data format' }))
        }
      } catch (err: any) {
        res.statusCode = 500
        res.end(JSON.stringify({ success: false, error: err.message }))
      }
    })

    server.middlewares.use('/api/identify-plant', async (req, res, next) => {
      if (req.method !== 'POST') {
        res.statusCode = 405
        res.end()
        return
      }
      try {
        const env = loadEnv('', process.cwd(), '')
        let raw = ''
        req.on('data', (chunk) => (raw += chunk))
        await new Promise<void>((resolve) => req.on('end', () => resolve()))

        let payload
        try {
          payload = JSON.parse(raw || '{}')
        } catch {
          res.statusCode = 400
          res.end(JSON.stringify({ error: 'Invalid JSON payload' }))
          return
        }

        const { imageUrl, moisture, plantName, species } = payload
        if (!imageUrl) {
          res.statusCode = 400
          res.end(JSON.stringify({ error: 'imageUrl is required' }))
          return
        }

        const geminiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY
        res.setHeader('Content-Type', 'application/json')

        if (!geminiKey) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: 'Gemini API Key is missing (Local)' }))
          return
        }

        const genAI = new GoogleGenerativeAI(geminiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        let base64Data = "";
        let mimeType = "image/jpeg";

        if (imageUrl.startsWith("http")) {
          const imgRes = await fetch(imageUrl);
          const arrayBuffer = await imgRes.arrayBuffer();
          base64Data = Buffer.from(arrayBuffer).toString("base64");
          mimeType = imgRes.headers.get("content-type") || "image/jpeg";
        } else {
          base64Data = imageUrl.includes(',') ? imageUrl.split(',')[1] : imageUrl;
          mimeType = imageUrl.includes('data:') ? imageUrl.split(';')[0].split(':')[1] : 'image/jpeg';
        }

        const prompt = `你是一位資深的植物學家與植保專家。
        請分析這張植物照片，並結合以下資訊：
        - 使用者提供的植物名稱：${plantName || "未提供"}
        - 可能的品種：${species || "未知"}
        - 目前環境濕度：${moisture || "未知"}%

        請執行以下任務：
        1. 辨識植物品種（如果使用者提供的名稱不準確，請更正）。
        2. 評估植物的健康狀態。
        3. 如果有病徵，請識別病名、原因及提供救治建議。
        4. 計算一個 0-100 的健康分數 (healthScore)。

        請務必以繁體中文回覆，且格式必須為純 JSON，不得包含任何 Markdown 標記或開場白：
        {
          "isHealthy": boolean,
          "healthScore": number,
          "species": "辨識出的植物品種名稱",
          "label": "主要狀態或病徵名稱",
          "diseases": [
            {
              "name": "病徵名稱",
              "probability": 0.xx,
              "cause": "病因分析",
              "treatment": {
                "biological": ["物理或生物防治方法"],
                "chemical": ["建議藥劑"],
                "prevention": ["預防措施"]
              }
            }
          ],
          "advice": "總體建議 (Markdown 格式)"
        }
        
        注意：如果植物非常健康，diseases 陣列可以為空，但 label 應設為 \"健康\"。`;

        const result = await model.generateContent([
          prompt,
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType,
            },
          },
        ]);

        const response = await result.response;
        const text = response.text();
        
        let finalData;
        try {
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            finalData = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error("Could not find JSON in Gemini response");
          }
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: "Gemini 回傳格式錯誤" }));
          return;
        }

        res.statusCode = 200
        res.end(JSON.stringify({
          success: true,
          ...finalData
        }))

      } catch (err: any) {
        res.statusCode = 500
        res.end(JSON.stringify({ success: false, error: err.message }))
      }
    })

    server.middlewares.use('/api/analyze-plant', async (req, res, next) => {
      if (req.method !== 'POST') {
        res.statusCode = 405
        res.end()
        return
      }
      try {
        let raw = ''
        req.on('data', (chunk) => (raw += chunk))
        await new Promise<void>((resolve) => req.on('end', () => resolve()))

        let payload
        try {
          payload = JSON.parse(raw || '{}')
        } catch (e) {
          res.statusCode = 400
          res.end(JSON.stringify({ error: 'Invalid JSON payload' }))
          return
        }

        const { plantName, species, currentMoisture, imageUrl, healthAnalysis } = payload
        const env = loadEnv('', process.cwd(), '')
        const geminiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY
        res.setHeader('Content-Type', 'application/json')

        if (!geminiKey) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: 'Gemini API Key is missing (Local)' }))
          return
        }

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

        let prompt = "";
        if (healthAnalysis) {
          prompt = `資深植物專家報告：
          植物：${species || plantName}，濕度：${currentMoisture}%
          診斷：${JSON.stringify(healthAnalysis)}
          
          Markdown 格式章節（嚴格遵守）：
          1. 🌿 植物現狀評估
          2. 💧 水分管理建議
          3. ☀️ 光照與環境
          4. 🏥 專業診斷與處方
          5. 💡 專家小叮嚀

          要求：繁體中文，純 JSON：
          {
            "analysis": "Markdown 報告",
            "moisture": "建議濕度%",
            "sunlight": "建議日照時間"
          }
          不要開場白。`;
        } else {
          prompt = `精簡養護報告 (150字內)：
          植物：${species || plantName}，濕度：${currentMoisture}%
          繁體中文，純 JSON：
          {
            "analysis": "Markdown 報告",
            "moisture": "建議濕度%",
            "sunlight": "建議日照時間"
          }
          不要開場白。`;
        }

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
          analysis: text || "分析暫時不可用",
          moisture: "50%",
          sunlight: "4小時"
        }

        try {
          const jsonMatch = text.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            finalResult = JSON.parse(jsonMatch[0])
          }
        } catch (e) {}

        res.statusCode = 200
        res.end(JSON.stringify(finalResult))
      } catch (err: any) {
        res.statusCode = 500
        res.end(JSON.stringify({ error: err.message || 'Gemini analysis failed' }))
      }
    })

    server.middlewares.use('/api/daily-care', async (req, res, next) => {
      if (req.method !== 'POST') {
        res.statusCode = 405
        res.end()
        return
      }
      try {
        let raw = ''
        req.on('data', (chunk) => (raw += chunk))
        await new Promise<void>((resolve) => req.on('end', () => resolve()))
        
        let payload;
        try {
          payload = JSON.parse(raw || '{}');
        } catch (e) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
          return;
        }
        
        const { plantName, species, weather } = payload;
        const env = loadEnv('', process.cwd(), '')
        const geminiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY
        res.setHeader('Content-Type', 'application/json')
        
        if (!geminiKey) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: 'Gemini API Key is missing (Local)' }))
          return
        }

        const genAI = new GoogleGenerativeAI(geminiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const targetPlant = species || plantName || 'Unknown Plant'
        const weatherInfo = weather ? `當前天氣：${weather.condition}，溫度：${weather.temp}°C (最高 ${weather.high}°C / 最低 ${weather.low}°C)。` : "當前天氣：晴朗，溫度：25°C。";

        const prompt = `植物專家：請給予建議。
        植物：${targetPlant}
        ${weatherInfo}
        要求：純 JSON，繁體中文，無贅字：
        {
          "moisture": "xx%",
          "sunlight": "x小時"
        }`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        let careData = { moisture: "50%", sunlight: "4小時" }
        try {
          const jsonMatch = text.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            careData = JSON.parse(jsonMatch[0])
          }
        } catch (e) {}

        res.statusCode = 200
        res.end(JSON.stringify({ success: true, ...careData }))
      } catch (err: any) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ success: false, error: err.message }))
      }
    })

    server.middlewares.use('/api/chat', async (req, res, next) => {
      if (req.method !== 'POST') {
        res.statusCode = 405
        res.end()
        return
      }
      try {
        let raw = ''
        req.on('data', (chunk) => (raw += chunk))
        await new Promise<void>((resolve) => req.on('end', () => resolve()))
        
        let payload;
        try {
          payload = JSON.parse(raw || '{}') as {
            messages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
          };
        } catch (e) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
          return;
        }

        const env = loadEnv('', process.cwd(), '')
        const geminiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY
        res.setHeader('Content-Type', 'application/json')

        if (!geminiKey) {
          res.statusCode = 500
          res.end(JSON.stringify({ text: 'Gemini API Key 未設定，請在 .env 加入金鑰。' }))
          return
        }

        const genAI = new GoogleGenerativeAI(geminiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const systemMsg = payload.messages?.find(m => m.role === 'system')?.content || 
                         '你是專注植物栽培與照護的助手。回答必須使用繁體中文，且內容具體、可操作。當被詢問濕度或健康度時，請務必提供具體的數值百分比。若問題不屬於植物照護，請簡短說明你僅回覆植物相關問題。';
        
        const userMessages = payload.messages?.filter(m => m.role !== 'system') || [];
        const lastMsg = userMessages[userMessages.length - 1];
        
        let parts: any[] = [systemMsg];

        if (lastMsg) {
          if (typeof lastMsg.content === 'string') {
            parts.push(`使用者問題：${lastMsg.content}`);
          } else if (Array.isArray(lastMsg.content)) {
            // 處理多模態訊息 (vision)
            for (const part of (lastMsg.content as any[])) {
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

        res.statusCode = 200
        res.end(JSON.stringify({ text: text || "抱歉，我現在無法回答這個問題。" }))
      } catch (err: any) {
        res.statusCode = 500
        res.end(JSON.stringify({ text: `發生錯誤：${err.message}` }))
      }
    })
  },
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // 將環境變數注入 process.env 供後端中間件使用
  process.env.GEMINI_API_KEY = env.GEMINI_API_KEY

  return {
    plugins: [
      // The React and Tailwind plugins are both required for Make, even if
      // Tailwind is not being actively used – do not remove them
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
        manifest: {
          name: 'PlanTalk',
          short_name: 'PlanTalk',
          description: '智慧植物管家系統',
          theme_color: '#ffffff',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png'
            }
          ]
        }
      }),
      plantChatApiPlugin,
    ],
    resolve: {
      alias: {
        // Alias @ to the src directory
        '@': path.resolve(__dirname, './src'),
      },
      dedupe: ['react', 'react-dom', 'three'],
    },
    optimizeDeps: {
      include: ['three', '@react-three/fiber', '@react-three/drei'],
      exclude: [],
    },
  }
})
