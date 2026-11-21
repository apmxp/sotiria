import socialImage from '@/assets/balanced-world.jpg';

export const SITE_ORIGIN = 'https://sotiria.ap12app12.workers.dev';
export const DEVELOPER_NAME = 'Selam Alemayehu Giday';
export const ANDROID_APK_URL = 'https://github.com/apmxp/sotiria/releases/download/v0.1.0/app-debug.apk';

const organizationId = `${SITE_ORIGIN}/#organization`;
const developerId = `${SITE_ORIGIN}/#selam-alemayehu-giday`;
const applicationId = `${SITE_ORIGIN}/#android-app`;

export const SOTIRIA_STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': organizationId,
      name: 'Sotiría',
      url: SITE_ORIGIN,
    },
    {
      '@type': 'Person',
      '@id': developerId,
      name: DEVELOPER_NAME,
      jobTitle: 'Developer and creator of Sotiría',
      url: `${SITE_ORIGIN}/#about-the-developer`,
      creatorOf: { '@id': applicationId },
    },
    {
      '@type': 'SoftwareApplication',
      '@id': applicationId,
      name: 'Sotiría',
      description: 'An Android app for child digital wellbeing and family screen-time awareness.',
      applicationCategory: 'LifestyleApplication',
      operatingSystem: 'Android',
      softwareVersion: '0.1.0',
      identifier: 'com.sotiria.companion',
      url: SITE_ORIGIN,
      downloadUrl: ANDROID_APK_URL,
      creator: { '@id': developerId },
      publisher: { '@id': organizationId },
    },
  ],
} as const;

type PageHeadOptions = {
  path?: string;
  indexable?: boolean;
  author?: string;
  structuredData?: Record<string, unknown>;
};

export function pageHead(
  title: string,
  description: string,
  options: PageHeadOptions = {},
) {
  const indexable = Boolean(options.indexable && options.path);
  const pageTitle = title.includes('Sotiría') ? title : `${title} | Sotiría`;
  const canonicalUrl = indexable ? new URL(options.path!, SITE_ORIGIN).toString() : undefined;
  const imageUrl = new URL(socialImage, SITE_ORIGIN).toString();

  return {
    meta: [
      { title: pageTitle },
      { name: 'description', content: description },
      { name: 'robots', content: indexable ? 'index,follow' : 'noindex,nofollow' },
      ...(options.author ? [{ name: 'author', content: options.author }] : []),
      { property: 'og:title', content: pageTitle },
      { property: 'og:description', content: description },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'Sotiría' },
      ...(canonicalUrl ? [{ property: 'og:url', content: canonicalUrl }] : []),
      ...(indexable
        ? [
            { property: 'og:image', content: imageUrl },
            {
              property: 'og:image:alt',
              content: 'Children drawing, reading, and flying a paper airplane together in a peaceful park',
            },
            { name: 'twitter:card', content: 'summary_large_image' },
            { name: 'twitter:title', content: pageTitle },
            { name: 'twitter:description', content: description },
            { name: 'twitter:image', content: imageUrl },
          ]
        : [{ name: 'twitter:card', content: 'summary' }]),
      ...(options.structuredData
        ? [{ 'script:ld+json': options.structuredData }]
        : []),
    ],
    links: canonicalUrl ? [{ rel: 'canonical', href: canonicalUrl }] : [],
  };
}
