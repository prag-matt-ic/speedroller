import { notFound } from 'next/navigation'
import CourseEditor from '@/components/editor/CourseEditor'

export default function CourseEditorPage() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <CourseEditor />
}
