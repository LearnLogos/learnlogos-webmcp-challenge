import { contestMediaHandler } from '@/lib/webmcp/server/contest-services'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  return contestMediaHandler(request)
}
