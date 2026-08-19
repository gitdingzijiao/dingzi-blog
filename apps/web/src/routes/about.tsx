import { localizeSiteSettings } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowRightIcon, ExternalLinkIcon, MailIcon, SparklesIcon } from "lucide-react";

import { SiteShell } from "#/components/site-shell";
import { $getAboutPageData } from "#/lib/cms-server";
import { getCurrentLocale } from "#/lib/i18n";

export const Route = createFileRoute("/about")({
  loader: () => $getAboutPageData(),
  head: () => {
    const locale = getCurrentLocale();

    return {
      meta: [
        {
          title: locale === "zh" ? "关于 钉子の飞机" : "About Dingzi Blog",
        },
        {
          name: "description",
          content:
            locale === "zh"
              ? "钉子の飞机是阿丁交的个人博客，记录技术学习、生活思考与有趣的项目。"
              : "Dingzi's personal blog about tech learning, life thoughts, and fun projects.",
        },
      ],
    };
  },
  component: AboutPage,
});

function AboutPage() {
  const data = Route.useLoaderData();
  const locale = getCurrentLocale();
  const siteSettings = localizeSiteSettings(data.siteSettings, locale);
  const copy = getAboutCopy(locale);

  return (
    <SiteShell siteSettings={siteSettings}>
      <div className="bg-background">
        <section className="border-b border-border">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,0.62fr)_minmax(280px,0.38fr)] lg:px-8 lg:py-16">
            <div>
              <p className="text-sm font-semibold tracking-wide text-link uppercase">
                {copy.eyebrow}
              </p>
              <h1 className="mt-5 max-w-4xl text-5xl leading-[0.98] font-semibold text-balance sm:text-6xl">
                {copy.title}
              </h1>
              <p className="mt-6 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
                {copy.description}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button
                  render={<a href="/blog" aria-label={copy.primaryAction} />}
                  nativeButton={false}
                >
                  {copy.primaryAction}
                  <ArrowRightIcon />
                </Button>
                <Button
                  render={<a href="https://github.com/gitdingzijiao" aria-label={copy.secondaryAction} />}
                  variant="outline"
                  nativeButton={false}
                >
                  {copy.secondaryAction}
                  <ExternalLinkIcon />
                </Button>
              </div>
            </div>

            <aside className="border border-border bg-muted/35 p-5">
              <img
                src="/avatar.jpg"
                alt="dingzijiao"
                className="aspect-square w-full object-cover"
              />
              <div className="mt-5">
                <p className="text-sm font-semibold text-link uppercase">dingzijiao</p>
                <p className="mt-2 text-2xl font-semibold">{copy.profileTitle}</p>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{copy.profileBody}</p>
              </div>
            </aside>
          </div>
        </section>

        <section className="border-b border-border bg-muted/35">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[0.36fr_0.64fr] lg:px-8 lg:py-16">
            <div>
              <p className="text-sm font-semibold text-link uppercase">{copy.whyEyebrow}</p>
              <h2 className="mt-3 text-3xl font-semibold text-balance">{copy.whyTitle}</h2>
            </div>
            <div className="grid gap-4">
              {copy.principles.map((principle) => (
                <article key={principle.title} className="border-t border-border pt-4">
                  <div className="flex items-start gap-3">
                    <SparklesIcon className="mt-1 size-4 shrink-0 text-link" />
                    <div>
                      <h3 className="text-xl font-semibold">{principle.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {principle.description}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section>
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
            <div className="grid gap-px border border-border bg-border md:grid-cols-3">
              {copy.paths.map((path) => (
                <a
                  key={path.href}
                  href={path.href}
                  className="bg-background p-5 transition hover:bg-muted/45"
                >
                  <p className="text-xs font-semibold tracking-wide text-link uppercase">
                    {path.eyebrow}
                  </p>
                  <h3 className="mt-3 text-2xl font-semibold">{path.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{path.description}</p>
                </a>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-border pt-6">
              <a
                href="mailto:2104362966@qq.com"
                className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-link hover:underline"
              >
                <MailIcon className="size-4" />
                2104362966@qq.com
              </a>
              <a
                href="https://github.com/gitdingzijiao"
                className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-link hover:underline"
              >
                GitHub
                <ExternalLinkIcon className="size-4" />
              </a>
            </div>
          </div>
        </section>
      </div>
    </SiteShell>
  );
}

function getAboutCopy(locale: ReturnType<typeof getCurrentLocale>) {
  if (locale === "zh") {
    return {
      eyebrow: "关于本站",
      title: "钉子の飞机的个人博客",
      description:
        "这里是阿丁交（dingzijiao）的个人博客，记录技术学习、生活思考与有趣的项目。hallo啊盆有，欢迎来做客！",
      primaryAction: "阅读博客",
      secondaryAction: "我的 GitHub",
      profileTitle: "阿丁交 · 独立博客作者",
      profileBody:
        "一枚热爱折腾的开发者，用 Cloudflare 原生技术栈搭建了这座小站，持续记录学习与实践的足迹。",
      whyEyebrow: "理念",
      whyTitle: "这个博客写什么",
      principles: [
        {
          title: "记录与分享",
          description: "把学习过程和踩坑经验写下来，既为自己复盘，也为后来者指路。",
        },
        {
          title: "动手实践",
          description: "优先写真实项目里验证过的方法，不空谈理论。",
        },
        {
          title: "持续更新",
          description: "慢慢写、长期写，把博客当作自己的数字花园。",
        },
      ],
      paths: [
        {
          eyebrow: "Start",
          title: "阅读文章",
          description: "浏览博客里最新的技术笔记和生活随笔。",
          href: "/blog",
        },
        {
          eyebrow: "Work",
          title: "我的 GitHub",
          description: "查看我的开源项目和代码仓库。",
          href: "https://github.com/gitdingzijiao",
        },
        {
          eyebrow: "Home",
          title: "回到首页",
          description: "了解更多关于这座小站的故事。",
          href: "/",
        },
      ],
    };
  }

  return {
    eyebrow: "About this site",
    title: "Dingzi's personal blog",
    description:
      "A personal blog by dingzijiao about tech learning, life thoughts, and fun side projects. Hello there, welcome!",
    primaryAction: "Read the blog",
    secondaryAction: "My GitHub",
    profileTitle: "dingzijiao · independent blogger",
    profileBody:
      "A developer who loves tinkering, built this site on the Cloudflare-native stack, and keeps documenting the journey.",
    whyEyebrow: "Principles",
    whyTitle: "What this blog is about",
    principles: [
      {
        title: "Record and share",
        description: "Write down the learning process and pitfalls — for myself and for others.",
      },
      {
        title: "Hands-on first",
        description: "Prefer methods proven in real projects over empty theory.",
      },
      {
        title: "Keep writing",
        description: "Write slowly and consistently, treating the blog as a digital garden.",
      },
    ],
    paths: [
      {
        eyebrow: "Start",
        title: "Read articles",
        description: "Browse the latest tech notes and life essays.",
        href: "/blog",
      },
      {
        eyebrow: "Work",
        title: "My GitHub",
        description: "Check out my open-source projects and repositories.",
        href: "https://github.com/gitdingzijiao",
      },
      {
        eyebrow: "Home",
        title: "Back to home",
        description: "Learn more about the story of this little site.",
        href: "/",
      },
    ],
  };
}
