import 'dotenv/config'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

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
        const { imageUrl, plantName, species, currentMoisture, dailyStandard } = JSON.parse(raw || '{}')
        
        const token = process.env.HUGGING_FACE_API_KEY || process.env.VITE_HUGGING_FACE_API_KEY
        res.setHeader('Content-Type', 'application/json')
        
        if (!token) {
          res.statusCode = 200
          res.end(JSON.stringify({ error: 'API Key missing' }))
          return
        }

        const targetPlant = species || plantName || 'Unknown Plant'

        // LLM Analysis
        const modelId = "Qwen/Qwen2.5-7B-Instruct"
        const moistureInfo = currentMoisture !== undefined ? `目前花盆濕度數值為：${currentMoisture}%。` : "";
        const standardInfo = dailyStandard ? `今日養護標準為：建議濕度 ${dailyStandard.moisture}，建議日照 ${dailyStandard.sunlight}。` : "";
        
        const body = {
          model: modelId,
          messages: [
            {
              role: "system",
              content: `你是一位植物專家。請針對植物品種提供養護指南。要求：
1. 標頭首行必須顯示「品種：[植物名稱]」。
2. 使用繁體中文。
3. 內容需包含：🌿日照（根據今日標準給出具體建議）、💧濕度（根據今日標準評價當前數值）、📝重點。
4. 特別注意：請嚴格參考提供的「今日養護標準」來評價當前狀態。
5. 保持精簡但專業。`
            },
            {
              role: "user",
              content: `請分析「${targetPlant}」並提供養護重點。${moistureInfo} ${standardInfo}`
            }
          ],
          temperature: 0.6,
          max_tokens: 500
        }

        const llmResp = await fetch('https://router.huggingface.co/v1/chat/completions', {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          method: 'POST',
          body: JSON.stringify(body),
        })
        let llmResult = await llmResp.json().catch(() => ({ error: 'Failed to parse JSON' }))

        if (!llmResp.ok) {
          throw new Error(llmResult.error?.message || llmResult.error || `HF chat model failed with status ${llmResp.status}`)
        }

        const analysis = llmResult.choices?.[0]?.message?.content

        if (!analysis) {
          throw new Error('AI returned empty response')
        }

        res.statusCode = 200
        res.end(JSON.stringify({ success: true, analysis, targetPlant }))
      } catch (err: any) {
        res.statusCode = 200
        res.end(JSON.stringify({ success: false, error: err.message || 'Analysis failed locally' }))
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
        const { plantName, species, weather } = JSON.parse(raw || '{}')
        
        const token = process.env.HUGGING_FACE_API_KEY || process.env.VITE_HUGGING_FACE_API_KEY
        res.setHeader('Content-Type', 'application/json')
        
        if (!token) {
          res.statusCode = 200
          res.end(JSON.stringify({ error: 'API Key missing' }))
          return
        }

        const targetPlant = species || plantName || 'Unknown Plant'
        const weatherInfo = weather ? `當前天氣：${weather.condition}，溫度：${weather.temp}°C (最高 ${weather.high}°C / 最低 ${weather.low}°C)。` : "當前天氣：晴朗，溫度：25°C。";

        const body = {
          model: "Qwen/Qwen2.5-7B-Instruct",
          messages: [
            {
              role: "system",
              content: `你是一位植物養護專家。請根據當前的天氣狀況，為特定植物提供今日的「建議濕度」與「建議日照時間」。
要求：
1. 回傳 JSON 格式：{"moisture": "xx%", "sunlight": "x小時"}。
2. 考慮天氣對植物的影響（例如：天氣熱且晴朗，日照時間應適中但需注意防曬，濕度需求可能增加）。
3. 只回傳 JSON 字串，不要有其他文字。`
            },
            {
              role: "user",
              content: `植物：${targetPlant}。${weatherInfo}`
            }
          ],
          temperature: 0.4,
          max_tokens: 100
        }

        const llmResp = await fetch('https://router.huggingface.co/v1/chat/completions', {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          method: 'POST',
          body: JSON.stringify(body),
        })
        let llmResult = await llmResp.json()
        const content = llmResult.choices?.[0]?.message?.content
        
        // 嘗試解析 JSON
        let careData = { moisture: "50%", sunlight: "4小時" }
        try {
          const jsonMatch = content.match(/\{.*\}/s)
          if (jsonMatch) {
            careData = JSON.parse(jsonMatch[0])
          }
        } catch (e) {
          console.error("Failed to parse AI daily care JSON:", content)
        }

        res.statusCode = 200
        res.end(JSON.stringify({ success: true, ...careData }))
      } catch (err: any) {
        res.statusCode = 200
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
        const payload = JSON.parse(raw || '{}') as {
          messages?: Array<{ role: 'user' | 'assistant'; content: string }>
        }
        const token =
          process.env.HUGGING_FACE_API_KEY ||
          process.env.VITE_HUGGING_FACE_API_KEY
        const model =
          process.env.HUGGING_FACE_MODEL || 'meta-llama/Llama-3.1-8B-Instruct'
        res.setHeader('Content-Type', 'application/json')
        if (!token) {
          res.statusCode = 200
          res.end(
            JSON.stringify({
              text:
                'HUGGING_FACE_API_KEY 未設定，請在專案根目錄 .env 加入 HUGGING_FACE_API_KEY=你的金鑰，然後重新啟動開發伺服器。',
            }),
          )
          return
        }
        const body = {
          model,
          messages: [
            {
              role: 'system',
              content:
                '你是專注植物栽培與照護的助手。回答必須具體、可操作，必要時提供數值範圍。僅回覆植物相關問題。',
            },
            ...((payload.messages || []).map((m) => ({
              role: m.role,
              content: m.content,
            })) as Array<{ role: 'user' | 'assistant'; content: string }>),
          ],
          temperature: 0.3,
          top_p: 0.9,
          max_tokens: 500,
        }
        const r = await fetch('https://router.huggingface.co/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        })
        const data = await r.json().catch(() => null)
        if (!r.ok) {
          const errMsg =
            typeof data?.error === 'string' ? data.error : 'Hugging Face API error'
          res.statusCode = 200
          res.end(JSON.stringify({ text: errMsg }))
          return
        }
        const text =
          data?.choices?.[0]?.message?.content ||
          data?.choices?.[0]?.delta?.content ||
          ''
        res.statusCode = 200
        res.end(JSON.stringify({ text: text || '暫無回覆，請稍後再試。' }))
      } catch (err) {
        res.statusCode = 200
        res.end(
          JSON.stringify({
            text:
              '後端處理失敗，請確認 .env 的 HUGGING_FACE_API_KEY 是否正確以及模型是否可用。',
          }),
        )
      }
    })
  },
}

export default defineConfig({
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
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
})
