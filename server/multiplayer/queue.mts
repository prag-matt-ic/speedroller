import { LIMITS } from '../../shared/multiplayer/protocol.mts'

export function queueAction(bufferedBytes: number, congestedSince: number | null, now: number, replaceable: boolean) {
  if (bufferedBytes <= LIMITS.softQueueBytes) return 'send'
  if (!replaceable || bufferedBytes > LIMITS.hardQueueBytes ||
    (congestedSince !== null && now - congestedSince >= LIMITS.congestionMs)) return 'close'
  return 'skip'
}
