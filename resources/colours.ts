import { CollectibleID } from '@/model/schema'

export const INFO_ZONE_SPHERE_COLOUR: string = '#37D6C7'

export const GOLD_PARTICLE_PALETTE: readonly string[] = [
  '#f6b253',
  '#ffcc3e',
  '#ffb328',
  '#ffc82c',
  '#ffdd3f',
  '#ffbd1f',
  '#ffb51d',
  '#ffaf07',
  '#ffe55e',
  '#f7ebda',
  '#fff7ec',
  '#fde5d2',
]

export const BLUE_PARTICLE_PALETTE: readonly string[] = [
  '#6a68e7',
  '#e4d8ff',
  '#debcff',
  '#b8bfff',
  '#b1c0ff',
  '#d8c1ff',
  '#e7c4ff',
  '#e8ceff',
  '#eec6ff',
  '#e4e1f9',
  '#e9e3fc',
  '#fffaff',
]

export const GREEN_PARTICLE_PALETTE: readonly string[] = [
  '#5ed35e',
  '#47ec5e',
  '#97ff7c',
  '#74e45d',
  '#80f662',
  '#6ae557',
  '#5ce62c',
  '#60ea48',
  '#4eff83',
  '#eeffe9',
  '#e7fce1',
  '#e6ffdd',
]

export const GEM_COLOURS = ['#F6B253', '#6A68E7', '#5ED35E'] as const

export const GEMS_COLOURS_BY_ID: Record<
  CollectibleID,
  { colour: string; particlesPalette: readonly string[] }
> = {
  [CollectibleID.DesignTools]: {
    colour: GEM_COLOURS[0],
    particlesPalette: GOLD_PARTICLE_PALETTE,
  },
  [CollectibleID.AI_Prompts]: {
    colour: GEM_COLOURS[1],
    particlesPalette: BLUE_PARTICLE_PALETTE,
  },
  [CollectibleID.Consultation]: {
    colour: GEM_COLOURS[2],
    particlesPalette: GREEN_PARTICLE_PALETTE,
  },
} as const

export const CONFETTI_PARTICLE_COLOURS_GOLD: readonly string[] = [
  '#fce05b',
  '#d9bd3e',
  '#ffe93d',
  '#ffdf30',
  '#efcd25',
  '#fff048',
  '#ffd800',
  '#ffe200',
  '#dcca09',
  '#ffcc00',
  '#fffde5',
  '#f7f5eb',
  '#656336',
  '#656333',
  '#ffd23a',
  '#ffe644',
  '#ffff27',
  '#fffc12',
  '#ebd700',
  '#ffe525',
  '#e8d733',
  '#ffed47',
  '#f9f4eb',
  '#eee9c7',
  '#84774b',
  '#584a1f',
]

export const CONFETTI_PARTICLE_COLOURS_TEAL: readonly string[] = [
  '#44e2b0',
  '#4bea59',
  '#00ffd6',
  '#00ffcf',
  '#00ffa7',
  '#00ffcd',
  '#00f384',
  '#00fa9d',
  '#c3eddd',
  '#c1f5e6',
  '#56ad8e',
  '#136645',
  '#00f466',
  '#6ce625',
  '#9dff63',
  '#85ff68',
  '#74ff6d',
  '#76ff71',
  '#00e978',
  '#e0f6d1',
  '#e0f5df',
  '#5a815d',
  '#6d8e58',
]

export const CONFETTI_PARTICLE_COLOURS_GREEN: readonly string[] = [
  '#37d6c7',
  '#00ffd9',
  '#00ffe5',
  '#00f4aa',
  '#00e8f6',
  '#00e9a7',
  '#00ffcf',
  '#00ffe3',
  '#00ffff',
  '#00fff4',
  '#ddfffb',
  '#c9eeec',
  '#dbf5f1',
  '#d1eded',
  '#4aa196',
  '#007872',
  '#31907f',
  '#54a594',
]
