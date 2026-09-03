import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import ContestExperience from './ContestExperience'
import { contestWebMcpRequestIsEnabled, resolveWebMcpRuntime } from '@/lib/webmcp/runtime/config'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'WebMCP Challenge Learning Assistant',
  description: 'An isolated LearnLogos WebMCP contest experience.',
  robots: { index: false, follow: false },
}

export default async function WebMcpChallengePage() {
  const runtime = resolveWebMcpRuntime(process.env)
  const requestHeaders = await headers()
  const host = requestHeaders.get('host') ?? ''
  if (!contestWebMcpRequestIsEnabled(runtime, host)) notFound()
  return <ContestExperience />
}
