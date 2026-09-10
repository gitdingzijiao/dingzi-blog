import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

/**
 * AI 智能绘图：自然语言 → draw.io 兼容 XML
 * POST /api/draw/generate  { prompt, currentXml? }
 */

const SYSTEM_PROMPT = `你是专业的 draw.io 图表生成器。用户用自然语言描述需求，你输出 draw.io 兼容的 diagram XML。

严格遵守：
1. 只输出 XML 本身，不要任何解释文字、不要 markdown 代码块标记。
2. 根元素用 <mxGraphModel>，结构为：
<mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">
  <root>
    <mxCell id="0" />
    <mxCell id="1" parent="0" />
    ... 节点和连线 ...
  </root>
</mxGraphModel>
3. 节点用：<mxCell id="n1" value="标签" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1"><mxGeometry x="120" y="80" width="160" height="60" as="geometry" /></mxCell>
4. 连线用：<mxCell id="e1" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=classic;" edge="1" parent="1" source="n1" target="n2"><mxGeometry relative="1" as="geometry" /></mxCell>
5. 布局要求：节点坐标对齐网格（10 的倍数），横向间距约 200，纵向间距约 120，整体从 x=80,y=60 开始，避免重叠。
6. 流程图用圆角矩形，判断节点用菱形（rhombus;），开始/结束用椭圆（ellipse;）。架构图分组用 swimlane 或 group 容器。
7. 文字用中文（跟随用户语言），需要换行时用 &#10; 或 <br>。
8. 连线必须带 source 和 target，指向真实存在的节点 id。
9. 图表规模控制在 6-20 个节点，清晰易读优先。`;

function cleanXml(raw: string): string {
  let content = (raw ?? "").trim();
  const fence = content.match(/```(?:xml)?\s*([\s\S]*?)```/i);
  if (fence) content = fence[1].trim();
  const start = content.indexOf("<mxGraphModel");
  if (start > 0) content = content.slice(start);
  const end = content.lastIndexOf("</mxGraphModel>");
  if (end !== -1) content = content.slice(0, end + "</mxGraphModel>".length);
  return content;
}

export const Route = createFileRoute("/api/draw/generate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { prompt?: string; currentXml?: string };
          const prompt = String(body.prompt ?? "").trim();

          if (!prompt) {
            return Response.json({ error: "缺少 prompt" }, { status: 400 });
          }

          const apiKey = env.DEEPSEEK_API_KEY;

          if (!apiKey) {
            return Response.json(
              { error: "服务端未配置 DEEPSEEK_API_KEY，请在 Worker 设置该 secret" },
              { status: 500 },
            );
          }

          const userContent = body.currentXml
            ? `当前图表 XML：\n${body.currentXml}\n\n用户要求：${prompt}\n\n请在当前图表基础上修改，输出修改后的完整 XML。`
            : `请根据以下需求生成图表：${prompt}`;

          const res = await fetch("https://api.deepseek.com/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: "deepseek-flash",
              messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: userContent },
              ],
              temperature: 0.3,
              max_tokens: 8000,
              stream: false,
            }),
          });

          if (!res.ok) {
            const errText = await res.text();
            return Response.json(
              { error: `DeepSeek API ${res.status}: ${errText.slice(0, 300)}` },
              { status: 502 },
            );
          }

          const json = (await res.json()) as {
            choices?: { message?: { content?: string } }[];
            usage?: unknown;
            model?: string;
          };

          const xml = cleanXml(json.choices?.[0]?.message?.content ?? "");

          if (!xml.includes("<mxGraphModel")) {
            return Response.json({ error: "模型未返回有效 XML，请重试" }, { status: 502 });
          }

          return Response.json({ xml, model: json.model ?? "deepseek-flash", usage: json.usage ?? null });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
