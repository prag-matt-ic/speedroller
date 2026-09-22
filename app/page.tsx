import dynamic from 'next/dynamic'
import { type FC } from 'react'
import { twJoin } from 'tailwind-merge'

import { insertSpeedRun } from '@/app/actions'
import { GameProvider } from '@/components/GameProvider'
import { QueryProvider } from '@/components/QueryProvider'
import { SoundProvider } from '@/components/SoundProvider'
// import PWAInstall from '@/components/ui/PWAInstall'
import LandingOverlay from '@/components/ui/landing/LandingOverlay'
import isMobileServer from '@/utils/isMobileServer'

const Main = dynamic(() => import('@/components/Main'))

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function Home(props: PageProps) {
  const isMobile = await isMobileServer()
  const searchParams = await props.searchParams
  const isDebug = searchParams?.debug === 'true'

  return (
    <>
      <main
        className={twJoin('w-full overflow-hidden select-none', isMobile ? 'h-dvh' : 'h-vh')}>
        <SoundProvider>
          <QueryProvider>
            <GameProvider isMobile={isMobile} insertSpeedRun={insertSpeedRun}>
              <LandingOverlay isMobile={isMobile} />
              <Main isMobile={isMobile} isDebug={isDebug} />
              {/* <PWAInstall isMobile={isMobile} /> */}
            </GameProvider>
          </QueryProvider>
        </SoundProvider>
      </main>
      <StructuredData />
    </>
  )
}

const FAQS: { question: string; answer: string }[] = [
  {
    question: 'What is Speedroller?',
    answer: 'A 3D racing game you play in the browser.',
  },
  {
    question: 'How do I move my player?',
    answer: 'On desktop use WASD or the arrow keys. On mobile, use the virtual joystick.',
  },
  {
    question: 'Is Speedroller free to play?',
    answer: 'Yes. It is free and runs entirely in your web browser.',
  },
  {
    question: 'Which devices and browsers are supported?',
    answer:
      'Any modern desktop or mobile browser that supports WebGPU and JavaScript. Chrome is the recommended browser.',
  },
  {
    question: 'What is the goal of the game?',
    answer:
      'Navigate your marble across the terrain, collect rings, and complete speedruns as fast as possible.',
  },
  {
    question: 'Can I change my marble colour?',
    answer: 'Yes. Roll onto a colour picker tile to change your colour.',
  },
  {
    question: 'How does performance adapt to my device?',
    answer:
      'A Three.js performance monitor automatically adjusts visual quality and device pixel ratio to maintain smooth frame rates.',
  },
  {
    question: 'What technologies power the 3D web game?',
    answer:
      'Next.js, React Three Fiber, Rapier physics, custom WebGPU shader materials, Zustand for state, GSAP for animation, and Tailwind for UI.',
  },
  {
    question: 'Who designed Speedroller?',
    answer: 'Threenix developers. Learn more about them here at https://threenix.io',
  },
]

const StructuredData: FC = () => {
  const faqEntities = FAQS.map(({ question, answer }) => ({
    '@type': 'Question',
    name: question,
    acceptedAnswer: { '@type': 'Answer', text: answer },
  }))

  const BASE_URL = 'https://speedroller.vercel.app'

  return (
    <>
      {/* Organization (minimal) for the Speedroller site */}
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Organization',
            '@id': `${BASE_URL}/#organization`,
            name: 'Pragmattic Ltd',
            url: BASE_URL,
            logo: `${BASE_URL}/web-app-manifest-512x512.png`,
            image: `${BASE_URL}/opengraph-image.jpg`,
            sameAs: ['https://github.com/prag-matt-ic'],
          }),
        }}
      />
      {/* Software Application details for the Speedroller game */}
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': ['SoftwareApplication', 'WebApplication', 'VideoGame'],
            '@id': `${BASE_URL}/#software-application`,
            name: 'Speedroller',
            url: BASE_URL,
            applicationCategory: 'GameApplication',
            operatingSystem: 'WEB',
            browserRequirements: 'Requires WebGPU and JavaScript enabled',
            description:
              'A free 3D speedrolling game for the web. Navigate a marble over challenging terrain, collect rings, and race the clock to the finish line.',
            image: [`${BASE_URL}/screenshots/home.jpg`],
            genre: ['Arcade', 'Trivia', 'Educational'],
            inLanguage: 'en-GB',
            offers: { '@type': 'Offer', price: 0 },
            publisher: { '@id': `${BASE_URL}/#organization` },
            author: { '@id': `${BASE_URL}/#organization` },
          }),
        }}
      />

      {/* WebSite entity for the domain */}
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            '@id': `${BASE_URL}/#website`,
            url: BASE_URL,
            name: 'Speedroller',
            inLanguage: 'en-GB',
            publisher: { '@id': `${BASE_URL}/#organization` },
          }),
        }}
      />

      {/* FAQs */}
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            '@id': `${BASE_URL}/#faq`,
            mainEntity: faqEntities,
          }),
        }}
      />
    </>
  )
}
