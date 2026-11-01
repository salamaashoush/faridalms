interface SeoProps {
  title: string;
  description: string;
  keywords?: string;
  image?: string;
}

export const seo = ({ title, description, keywords, image }: SeoProps) => {
  const tags = [
    { title },
    { name: "description", content: description },
    { name: "keywords", content: keywords },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:creator", content: "@salamaashoush" },
    { name: "twitter:site", content: "@salamaashoush" },
    { property: "og:type", content: "website" },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    ...(image
      ? [
          { name: "twitter:image", content: image },
          { name: "twitter:card", content: "summary_large_image" },
          { property: "og:image", content: image },
        ]
      : []),
  ];

  return tags;
};
