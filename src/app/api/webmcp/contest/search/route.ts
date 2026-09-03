import { contestSearchHandler } from '@/lib/webmcp/server/contest-services'

export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  return contestSearchHandler(request)
}
