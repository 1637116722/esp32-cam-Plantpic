import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { askPlantGPT, type ChatMessage } from "../../utils/gptClient";
import { PlantItem } from "./PlantGrid";

export type Msg = { role: "user" | "assistant"; text: string };

interface SearchViewProps {
  plants?: PlantItem[];
  messages: Msg[];
  onMessagesChange: (msgs: Msg[] | ((prev: Msg[]) => Msg[])) => void;
  onUpdatePlant?: (plant: PlantItem) => void;
}

export default function SearchView({ plants = [], messages, onMessagesChange, onUpdatePlant }: SearchViewProps) {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const q = input.trim();
      if (!q) return;
      
      onMessagesChange((m) => [...m, { role: "user", text: q }]);
      setInput("");
      setIsLoading(true);

      // 智慧搜尋：檢查輸入中或對話歷史是否提到主頁的植物名稱
      let contextInfo = "";
      // 掃描當前輸入，看是否有提到植物名稱
      const qLower = q.toLowerCase();
      
      // 優化匹配：先精確匹配，再部分匹配
      const mentionedPlant = plants.find(p => {
        const pName = p.name.toLowerCase();
        const pSpecies = p.species?.toLowerCase() || "";
        // 1. 完全包含名稱 (例如 "esp" 在 "esp32" 中)
        // 2. 或者名稱包含輸入 (例如 "向日葵" 在 "這朵向日葵" 中)
        return qLower.includes(pName) || (pSpecies && qLower.includes(pSpecies));
      });
      
      if (mentionedPlant) {
        // 檢查是否詢問健康狀況或「怎麼了」
        const isAskingHealth = qLower.includes("怎麼了") || qLower.includes("健康") || qLower.includes("生病") || qLower.includes("還好嗎") || qLower.includes("狀況");
        
        let healthDiagnosisInfo = "";
        if (isAskingHealth && mentionedPlant.healthAnalysis) {
          const diseases = mentionedPlant.healthAnalysis.diseases || [];
          if (diseases.length > 0) {
            healthDiagnosisInfo = `
【🚨 診斷紀錄：生成深度報告 🚨】
問題：${diseases.map(d => `${d.name}(${(d.probability * 100).toFixed(0)}%): ${d.treatment?.biological || d.treatment || '無'}`).join("; ")}
要求：回覆末尾附上專業報告，格式：
1. **🌿健康狀態**: 
2. **🔍問題診斷**: 
3. **💧給水建議**: 
4. **💡環境調整**: 
5. **🛠️治療方案**: `;
          }
        }

        contextInfo = `
【對話主體】
- 名稱：${mentionedPlant.name} (品種: ${mentionedPlant.species || '未知'})
- 狀態：濕度 ${mentionedPlant.moisture}%，健康度 ${mentionedPlant.health}%
- 建議：${mentionedPlant.dailyRecommendation ? `濕度 ${mentionedPlant.dailyRecommendation.moisture}，日照 ${mentionedPlant.dailyRecommendation.sunlight}` : "專業建議"}
${healthDiagnosisInfo}
⚠️ 禁止：稱呼使用者為「${mentionedPlant.name}」。使用者是「主人」。`;
      }
      
      const conversationMessages: ChatMessage[] = [
        {
          role: "system",
          content: `你是一個專業植物管家。
職責：協助主人照顧植物。
清單：${plants.map(p => `「${p.name}」(${p.species || '未知'})`).join(", ")}
準則：
1. 植物暱稱不是使用者的名字。
2. 語氣資深專業且精簡。
3. 詢問數據時回覆具體數值。
4. 始終繁體中文。
5. **回覆請保持精煉，避免贅字**。
${contextInfo}`,
        },
        ...messages.slice(1).map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.text,
        })),
        { 
          role: "user", 
          content: mentionedPlant 
            ? `(系統提示：使用者正在詢問他的植物「${mentionedPlant.name}」，這是一棵「${mentionedPlant.species}」。請記住「${mentionedPlant.name}」是植物，不是使用者。)\n\n${q}` 
            : q 
        },
      ];

      const gpt = await askPlantGPT(conversationMessages);
      setIsLoading(false);
      
      if (gpt) {
        onMessagesChange((m) => [...m, { role: "assistant", text: gpt }]);
        
        // 如果是針對健康狀況的回答，且有找到植物，則更新該植物的深度分析報告
        if (mentionedPlant && onUpdatePlant) {
          const qLower = q.toLowerCase();
          const isAskingHealth = qLower.includes("怎麼了") || qLower.includes("健康") || qLower.includes("生病") || qLower.includes("還好嗎") || qLower.includes("狀況");
          
          if (isAskingHealth) {
             onUpdatePlant({
                 ...mentionedPlant,
                 aiAnalysis: gpt
             });
          }
        }
      } else {
        onMessagesChange((m) => [
          ...m,
          { role: "assistant", text: "抱歉，目前無法取得回覆。請確認：\n1）已在專案根目錄 .env 設定 GEMINI_API_KEY（或使用 vercel env add）\n2）使用 vercel login、vercel link 後執行 vercel dev\n3）/api/chat 正常可用（後端以 Gemini API 代理）" },
        ]);
      }
    },
    [input, messages, plants, onMessagesChange]
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div ref={listRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "flex justify-end"
                : "flex justify-start"
            }
          >
            <div
              className={
                m.role === "user"
                  ? "max-w-[80%] rounded-2xl px-4 py-2 bg-foreground/10 text-foreground"
                  : "max-w-[80%] rounded-2xl px-4 py-2 bg-white/60 backdrop-blur-sm text-foreground shadow-sm"
              }
              style={{ fontWeight: 500 }}
            >
              {m.role === "assistant" ? (
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({children}) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
                    ul: ({children}) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
                    ol: ({children}) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
                    li: ({children}) => <li className="leading-relaxed">{children}</li>,
                    strong: ({children}) => <strong className="font-bold text-green-700">{children}</strong>,
                    h1: ({children}) => <h1 className="text-lg font-bold mb-2">{children}</h1>,
                    h2: ({children}) => <h2 className="text-base font-bold mb-1">{children}</h2>,
                    code: ({children}) => <code className="bg-black/5 px-1 rounded text-sm font-mono">{children}</code>,
                  }}
                >
                  {m.text}
                </ReactMarkdown>
              ) : (
                m.text
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-2xl px-4 py-2 bg-white/60 backdrop-blur-sm text-foreground">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          </div>
        )}
      </div>
      <form onSubmit={handleSubmit} className="px-6 pb-6">
        <div className="flex items-center gap-2 bg-white/60 backdrop-blur-2xl rounded-2xl border border-gray-200/30 px-4 py-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="詢問栽培與照護，例如：怎麼種大蒜？"
            className="flex-1 min-w-0 bg-transparent outline-none text-foreground placeholder:text-gray-600/60"
          />
          <button
            type="submit"
            className="shrink-0 px-4 py-2 rounded-xl bg-foreground/10 text-foreground hover:bg-foreground/20 transition-colors"
          >
            發送
          </button>
        </div>
      </form>
    </div>
  );
}
