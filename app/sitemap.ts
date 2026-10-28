import type { MetadataRoute } from 'next'

const baseUrl = 'https://speedroller.vercel.app'

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date().toISOString().split('T')[0]

  const site: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: lastModified,
      changeFrequency: 'monthly',
      priority: 1.0,
    },
  ]

  return site
}
