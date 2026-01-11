import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { askPlantGPT, type ChatMessage } from "../../utils/gptClient";

type Msg = { role: "user" | "assistant"; text: string };

export default function SearchView() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", text: "你好，我是植物照護助手。你可以問我任何關於植物栽培、澆水、光照、土壤、施肥等問題。" },
  ]);
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
      
      setMessages((m) => [...m, { role: "user", text: q }]);
      setInput("");
      setIsLoading(true);
      
      // 构建消息历史（包含之前的对话）
      const conversationMessages: ChatMessage[] = [
        {
          role: "system",
          content: "你是專注植物栽培與照護的助手。僅回覆植物相關的栽培、澆水、光照、土壤、施肥、病蟲害與故障排除。不回覆非植物主題。回答簡潔、具體、可操作，必要時列步驟與數值範圍。",
        },
        ...messages.slice(1).map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.text,
        })),
        { role: "user", content: q },
      ];

      const gpt = await askPlantGPT(conversationMessages);
      setIsLoading(false);
      
      if (gpt) {
        setMessages((m) => [...m, { role: "assistant", text: gpt }]);
      } else {
        setMessages((m) => [
          ...m,
          { role: "assistant", text: "抱歉，目前無法取得回覆。請確認：\n1）已在專案根目錄 .env 設定 HUGGING_FACE_API_KEY（或使用 vercel env add）\n2）使用 vercel login、vercel link 後執行 vercel dev\n3）/api/chat 正常可用（後端以 Hugging Face Inference API 代理）" },
        ]);
      }
    },
    [input, messages]
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
            placeholder="詢問栽培與照護，例如：怎麼種大蒜？大蒜發黃怎麼辦？"
            className="flex-1 bg-transparent outline-none text-foreground placeholder:text-gray-600/60"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-foreground/10 text-foreground hover:bg-foreground/20 transition-colors"
          >
            發送
          </button>
        </div>
      </form>
    </div>
  );
}
