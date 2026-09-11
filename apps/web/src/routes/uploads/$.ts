import { createFileRoute } from "@tanstack/react-router";

import { getR2Asset } from "#/lib/cms-r2";

/**
 * 从 R2 提供上传的资源。
 *
 * 关键：支持 HTTP Range 请求（视频/音频拖进度条必需）。
 * 之前的实现忽略 Range 头，导致浏览器只能线性缓冲，
 * 大文件拖到未缓冲位置会卡住。
 */
export const Route = createFileRoute("/uploads/$")({
  server: {
    handlers: {
      GET: async ({ params, request }: { params: { _splat?: string }; request: Request }) => {
        const key = `uploads/${params._splat ?? ""}`;
        const rangeHeader = request.headers.get("range");

        // 有 Range 就让 R2 做分片读取（传 Headers 对象），避免把整个对象读进内存
        const object = rangeHeader
          ? await getR2Asset(key, request.headers)
          : await getR2Asset(key);

        if (!object?.body) {
          return new Response("Not found", { status: 404 });
        }

        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set("etag", object.httpEtag);
        headers.set("accept-ranges", "bytes");
        if (!headers.has("cache-control")) {
          headers.set("cache-control", "public, max-age=31536000, immutable");
        }

        const range = object.range as { offset?: number; length?: number; suffix?: number } | undefined;

        if (rangeHeader && range) {
          const size = object.size;
          let offset: number;
          let length: number;

          if (typeof range.suffix === "number") {
            length = Math.min(range.suffix, size);
            offset = size - length;
          } else {
            offset = range.offset ?? 0;
            length = range.length ?? size - offset;
          }

          headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${size}`);
          headers.set("content-length", String(length));

          return new Response(object.body, { status: 206, headers });
        }

        headers.set("content-length", String(object.size));

        return new Response(object.body, { status: 200, headers });
      },
    },
  },
});
