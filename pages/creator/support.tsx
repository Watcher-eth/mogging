import { CreatorShell } from '@/components/creator/creator-shell'
import { CreatorSupportChat } from '@/components/creator/support/support-chat'
import Link from 'next/link'
import { MessageCircle } from 'lucide-react'
export default function CreatorSupportPage() {
  return <CreatorShell><div className="mb-3 flex justify-end"><Link href="/creator/discord" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><MessageCircle className="size-3.5" aria-hidden="true" />Discord support</Link></div><CreatorSupportChat /></CreatorShell>
}
