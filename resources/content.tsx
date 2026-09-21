import {
  ArrowUpRight,
  BotIcon,
  BoxIcon,
  CompassIcon,
  HandshakeIcon,
  LightbulbIcon,
  type LucideIcon,
  PaletteIcon,
} from 'lucide-react'
import { type ReactNode } from 'react'

import Panel from '@/components/ui/panel/Panel'
import { PanelHeader } from '@/components/ui/panel/PanelHeader'
import type { TextCanvasOptions } from '@/hooks/useTextCanvas'
import { CollectibleID } from '@/model/schema'

export type HeadingContent = {
  text: string
  textCanvasOptions?: Partial<TextCanvasOptions>
}

export const COLLECTIBLES_CONTENT: Record<
  CollectibleID,
  { content: ReactNode; Icon: LucideIcon }
> = {
  [CollectibleID.DesignTools]: {
    Icon: PaletteIcon,
    content: (
      <>
        <a
          href="https://developers.threenix.io/"
          target="_blank"
          className="flex items-center gap-2 font-bold underline-offset-3 hover:underline lg:text-lg"
          rel="noopener noreferrer">
          Threenix Developer Resources
          <ArrowUpRight />
        </a>
        <span className="mt-1 block text-sm font-medium text-neutral-300">
          Free, open-source Agent Skills and components for Three.js, React Three Fiber, WebGPU
          and TSL.
        </span>
      </>
    ),
  },
  [CollectibleID.AI_Prompts]: {
    Icon: BotIcon,
    content: (
      <>
        <a
          href="https://github.com/prag-matt-ic/threenix-plugin/tree/main#review--refactor"
          target="_blank"
          className="flex items-center gap-2 font-bold underline-offset-3 hover:underline lg:text-lg"
          rel="noopener noreferrer">
          Three.js Optimization Prompts
          <ArrowUpRight />
        </a>
        <span className="mt-1 block text-sm font-medium text-white/80">
          Catch performance problems, remove unnecessary complexity, and make Three.js, R3F, and
          TSL code easier to maintain.
        </span>
      </>
    ),
  },
  [CollectibleID.Consultation]: {
    Icon: HandshakeIcon,
    content: (
      <>
        <a
          href="https://cal.com/threenix/15min"
          target="_blank"
          className="flex items-center gap-2 font-bold underline-offset-3 hover:underline lg:text-lg"
          rel="noopener noreferrer">
          Free 15 Minute Consultation
          <ArrowUpRight />
        </a>
        <span className="mt-1 block text-sm font-medium text-white/80">
          Our team at Threenix would love to discuss your 3D or AI web project. Get in touch
          via the website.
        </span>
      </>
    ),
  },
}

// The message of the site

const BASE_HEADING_FONT_SIZE = 66
const LONG_HEADING_FONT_SIZE = 56

export const HEADINGS_CONTENT: HeadingContent[] = [
  {
    text: 'This is the era of big web ideas',
    textCanvasOptions: { fontSize: BASE_HEADING_FONT_SIZE },
  },
  {
    text: 'From scroll-driven storytelling to fully interactive worlds',
    textCanvasOptions: { fontSize: LONG_HEADING_FONT_SIZE },
  },
  {
    text: 'Build your projects faster than ever with AI',
    textCanvasOptions: { fontSize: LONG_HEADING_FONT_SIZE },
  },
  {
    text: 'What will you launch?',
    textCanvasOptions: { fontSize: BASE_HEADING_FONT_SIZE },
  },
  {
    text: 'Roll Again. But Faster.',
    textCanvasOptions: { fontSize: BASE_HEADING_FONT_SIZE },
  },
]

export const INFO_ZONES_CARD_CONTENT: ReactNode[] = [
  <Panel key="info-welcome" className="p-4 xl:p-8" strength={3}>
    <PanelHeader icon={CompassIcon} label="Explore the map" />

    <p className="max-w-md text-sm leading-relaxed font-semibold xl:text-lg">
      Practice movement and explore the platform before competing against the clock to claim
      your place on the leaderboard.
    </p>
  </Panel>,

  <Panel key="info-ai" className="p-4 xl:p-8" strength={3}>
    <PanelHeader icon={LightbulbIcon} label="The era of ideas" />

    <p className="max-w-md text-sm xl:text-lg">
      As AI-charged creators, we have more time than ever to focus on unique ideas and crafting
      memorable user experiences.
      <br />
      <br />
      <b>We are entering the era of ideas - and it&apos;s a great time to be a creator.</b>
    </p>
  </Panel>,

  <Panel key="info-technologies" className="p-4 xl:p-8" strength={3}>
    <PanelHeader icon={BoxIcon} label="Technologies Used" />
    <ul className="list-inside list-disc text-sm xl:text-lg">
      <li>
        <b>React Three Fiber</b> for 3D rendering
      </li>
      <li>
        <b>Rapier</b> for physics and collision events
      </li>
      <li>
        <b>WebGL</b> for materials and particle effects
      </li>
      <li>
        <b>Zustand</b> for state management
      </li>
      <li>
        <b>GSAP</b> for animations
      </li>
      <li>
        <b>Next.js</b> as the web framework
      </li>
      <li>
        <b>Tailwind CSS</b> for UI styling
      </li>
      <li>
        <b>Postgres</b> database
      </li>
    </ul>
  </Panel>,
]
