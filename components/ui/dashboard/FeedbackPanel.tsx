'use client'
import { LoaderIcon, MessageCircle, SendHorizonal } from 'lucide-react'
import { type FC, useState } from 'react'
import { twJoin } from 'tailwind-merge'

import { submitFeedback } from '@/app/actions'
import { useGameStore } from '@/components/GameProvider'
import { Input } from '@/components/ui/input/Input'
import Panel from '@/components/ui/panel/Panel'
import { PanelHeader } from '@/components/ui/panel/PanelHeader'
import type { FeedbackSubmission } from '@/model/schema'

export const FeedbackPanel: FC = () => {
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const username = useGameStore((s) => s.username)

  const canSubmit = message.trim().length > 8 && !isSubmitting

  const onSubmit = async () => {
    if (!username) return
    setIsSubmitting(true)

    try {
      const data: FeedbackSubmission = {
        message: message.trim(),
        username,
      }
      const result = await submitFeedback(data)
      if (!!result) {
        setHasSubmitted(true)
        setMessage('')
      }
    } catch (error) {
      console.error('Error submitting feedback:', error)
      setError(
        'Failed to submit feedback. Please try again.' +
          (error instanceof Error ? ` ${error.message}` : ''),
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Panel
      strength={1}
      className="flex flex-col justify-between gap-3"
      attractorClassName="bg-neutral-400/15">
      <PanelHeader icon={MessageCircle} iconClassName="text-white" label="Feedback" />

      {hasSubmitted ? (
        <p className="text-sm xl:text-base">Thanks for your feedback!</p>
      ) : (
        <p className="text-sm xl:text-base">Share your ideas or report a bug.</p>
      )}

      <div className="flex gap-2">
        <Input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="We appreciate your feedback..."
          className="text-sm font-medium xl:text-base"
          maxLength={500}
          isValid={canSubmit}
          error={error}
          disabled={isSubmitting}
          endAdornment={
            <button
              className={twJoin(
                'relative flex h-full shrink-0 items-center gap-2.5 border-none bg-none px-4 font-medium uppercase outline-none',
                canSubmit ? 'text-amber-200' : 'cursor-not-allowed opacity-40',
              )}
              onClick={onSubmit}
              disabled={!canSubmit}>
              Send{' '}
              {isSubmitting ? (
                <LoaderIcon className="animate-spin" size={20} />
              ) : (
                <SendHorizonal size={20} />
              )}
            </button>
          }
        />
      </div>
    </Panel>
  )
}
