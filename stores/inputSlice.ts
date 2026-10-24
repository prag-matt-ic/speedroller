import {
  type CreateGameStoreParams,
  type GameSliceCreator,
  type InputSlice,
  InputType,
  type PlayerInput,
  isAttemptLocked,
} from './types'

const zeroInput = (): PlayerInput => ({
  up: 0,
  down: 0,
  left: 0,
  right: 0,
})

export const getResetInputState = (): Pick<
  InputSlice,
  'playerInput' | 'playerInputIntent'
> => ({
  playerInput: zeroInput(),
  playerInputIntent: zeroInput(),
})

export const createInputSlice =
  (isMobile: CreateGameStoreParams['isMobile']): GameSliceCreator<InputSlice> =>
  (set, get) => {
    const initialInputType: InputType = isMobile ? InputType.JOYSTICK : InputType.KEYS
    return {
      ...getResetInputState(),
      isMobile,
      inputType: initialInputType,
      joystickPosition: 'right',
      leaderboardFilter: initialInputType,
      setInputType: (type: InputType) => {
        if (isAttemptLocked(get().speedRunStage)) return
        set({ inputType: type })
      },
      setJoystickPosition: (position) => {
        set({ joystickPosition: position })
      },
      setPlayerInputIntent(input) {
        set({ playerInputIntent: input })
      },
      setPlayerInput(input) {
        set({ playerInput: input })
      },
      setLeaderboardFilter: (filter: InputType) => {
        set({ leaderboardFilter: filter })
      },
    }
  }
