import { localizeSiteSettings } from "@repo/core";
import { createFileRoute } from "@tanstack/react-router";
import { SiGithub } from "@icons-pack/react-simple-icons";
import { ExternalLinkIcon, FolderGit2Icon } from "lucide-react";

import { SiteShell } from "#/components/site-shell";
import { $getAboutPageData } from "#/lib/cms-server";
import { getCurrentLocale } from "#/lib/i18n";

export const Route = createFileRoute("/projects")({
  loader: () => $getAboutPageData(),
  head: () => {
    const locale = getCurrentLocale();

    return {
      meta: [
        {
          title: locale === "zh" ? "项目 · 钉子の飞机" : "Projects · Ding Blog",
        },
        {
          name: "description",
          content:
            locale === "zh"
              ? "阿丁交做过的项目：游戏、网站、小工具。"
              : "Projects built by dingzijiao: games, websites, and small tools.",
        },
      ],
    };
  },
  component: ProjectsPage,
});

type ProjectItem = {
  readonly name: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly href?: string;
  readonly status: "live" | "building" | "planned";
};

// ── 项目数据：后续上传新项目时往这里加 ────────────────────────
function getProjects(locale: ReturnType<typeof getCurrentLocale>): readonly ProjectItem[] {
  if (locale === "zh") {
    return [
      {
        name: "AI 智能绘图工具（DingDraw）",
        description: "用自然语言生成可编辑的流程图/架构图/思维导图。基于 draw.io 开源编辑器二次开发，DeepSeek 生成 draw.io 兼容 XML，支持连续对话修改与实时预览。",
        tags: ["AI", "draw.io", "DeepSeek", "全栈"],
        href: "/draw/",
        status: "live",
      },
      {
        name: "拳击格斗（Fight!）",
        description: "纯前端 Canvas 格斗小游戏：与电脑 AI 实时对打，出拳判定、受击硬直、血条对战。几十 KB，秒开即玩。",
        tags: ["HTML5", "Canvas", "游戏"],
        href: "/fight/",
        status: "live",
      },
      {
        name: "吾乎村 3D 地图",
        description: "用 Blender 依据真实 DEM 高程与卫星影像重建的甘南藏寨三维场景：52 栋藏式民居、金顶寺院、白塔经幡、700 棵云杉。浏览器里可环绕俯瞰，也能切到地面视角在村里行走。",
        tags: ["Three.js", "Blender", "3D", "GIS"],
        href: "/village-map/",
        status: "live",
      },
      {
        name: "小人地图行走（DingGame）",
        description: "用 Godot 开发的 2D 行走小游戏：无限生成地图、金币收集、相机跟随。支持 Windows / Android。",
        tags: ["Godot", "GDScript", "游戏"],
        status: "building",
      },
    ];
  }

  return [
    {
      name: "DingDraw — AI Diagram Tool",
      description: "Turn natural language into editable flowcharts, architecture diagrams, and mind maps. Built on the open-source draw.io editor; DeepSeek generates draw.io-compatible XML with continuous chat-based editing and live preview.",
      tags: ["AI", "draw.io", "DeepSeek", "Full-stack"],
      href: "/draw/",
      status: "live",
    },
    {
      name: "Fight! — Boxing Game",
      description: "A lightweight Canvas fighting game: fight the AI in real time with punch detection, hit stun, and health bars. A few dozen KB, instant to load.",
      tags: ["HTML5", "Canvas", "Game"],
      href: "/fight/",
      status: "live",
    },
    {
      name: "Wuhu Village 3D",
      description: "A Tibetan village rebuilt in Blender from real DEM elevation and satellite imagery: 52 Tibetan houses, a golden-roofed temple, stupas and prayer flags, and 700 conifers. Orbit from above in the browser, or switch to a ground-level walk mode.",
      tags: ["Three.js", "Blender", "3D", "GIS"],
      href: "/village-map/",
      status: "live",
    },
    {
      name: "DingGame — Walk the Map",
      description: "A Godot 2D walking game with procedurally generated endless maps, coin collection, and camera follow. Windows / Android.",
      tags: ["Godot", "GDScript", "Game"],
      status: "building",
    },
  ];
}

function ProjectsPage() {
  const data = Route.useLoaderData();
  const locale = getCurrentLocale();
  const siteSettings = localizeSiteSettings(data.siteSettings, locale);
  const projects = getProjects(locale);

  return (
    <SiteShell siteSettings={siteSettings}>
      <div className="bg-background">
        <section className="border-b border-border">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16 xl:px-12">
            <p className="text-sm font-semibold tracking-wide text-link uppercase">
              {locale === "zh" ? "项目" : "Projects"}
            </p>
            <h1 className="mt-4 text-4xl leading-[0.98] font-semibold text-balance sm:text-5xl">
              {locale === "zh" ? "做过的东西" : "Things I have built"}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              {locale === "zh"
                ? "游戏、网站、小工具，陆续上传中。"
                : "Games, websites, and small tools — being uploaded over time."}
            </p>
          </div>
        </section>

        <section>
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16 xl:px-12">
            <div className="grid gap-5 md:grid-cols-2">
              {projects.map((project) => (
                <article
                  key={project.name}
                  className="flex flex-col rounded-lg border border-border bg-muted/20 p-6 transition hover:bg-muted/35"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <FolderGit2Icon className="size-5 shrink-0 text-link" />
                      <h2 className="text-xl font-semibold">{project.name}</h2>
                    </div>
                    <StatusBadge status={project.status} locale={locale} />
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{project.description}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {project.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-border bg-background px-2.5 py-0.5 text-xs text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="mt-5 flex items-center gap-4">
                    {project.href ? (
                      <a
                        href={project.href}
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-link hover:underline"
                      >
                        {locale === "zh" ? "查看项目" : "View project"}
                        <ExternalLinkIcon className="size-3.5" />
                      </a>
                    ) : null}
                    <a
                      href="https://github.com/gitdingzijiao"
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
                    >
                      <SiGithub className="size-4" />
                      GitHub
                    </a>
                  </div>
                </article>
              ))}
            </div>

            {projects.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                {locale === "zh" ? "项目正在准备中，敬请期待。" : "Projects are on the way. Stay tuned."}
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </SiteShell>
  );
}

function StatusBadge({
  status,
  locale,
}: {
  readonly status: ProjectItem["status"];
  readonly locale: ReturnType<typeof getCurrentLocale>;
}) {
  const label =
    locale === "zh"
      ? { live: "已上线", building: "开发中", planned: "规划中" }[status]
      : { live: "Live", building: "In progress", planned: "Planned" }[status];

  const color =
    status === "live"
      ? "bg-emerald-500/10 text-emerald-600"
      : status === "building"
        ? "bg-amber-500/10 text-amber-600"
        : "bg-muted text-muted-foreground";

  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}
