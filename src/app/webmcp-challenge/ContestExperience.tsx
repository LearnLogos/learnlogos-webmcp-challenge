'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { ContestSearchEnvelope } from '@/lib/webmcp/contracts/v1/contest-search'
import { resolveBrowserModelContext } from '@/lib/webmcp/registration/browser-model-context'
import { registerWebMcpTools } from '@/lib/webmcp/registration/register-tools'
import { createSearchTrainingWebMcpTool } from '@/lib/webmcp/registration/search-training-tool'
import styles from './ContestExperience.module.css'

type RegistrationStatus = 'starting' | 'registered' | 'unsupported' | 'error'
type SearchItem = ContestSearchEnvelope['data']['results'][number]

const DEMO_QUESTIONS = [
  'How do I set program scaling to a specific percentage?',
  'How can I make the Logos interface larger?',
  'How do I save a scaling command to Favorites?',
  'How do I change scaling from the toolbar?',
  'How do I jump to my next reading?',
  'How do I use the reading-plan calendar?',
  'How do I mark my reading progress complete?',
  'How do I move to the next reading in my plan?',
] as const

function useWebMcpRegistration(tool: ReturnType<typeof createSearchTrainingWebMcpTool>) {
  const [status, setStatus] = useState<RegistrationStatus>('starting')
  useEffect(() => {
    let disposed = false
    let dispose: () => void = () => undefined
    const modelContext = resolveBrowserModelContext(document, navigator)
    void registerWebMcpTools({ enabled: true, modelContext, tools: [tool] })
      .then((registration) => {
        dispose = registration.dispose
        if (disposed) return dispose()
        setStatus(registration.status === 'registered' ? 'registered' : 'unsupported')
      })
      .catch(() => { if (!disposed) setStatus('error') })
    return () => { disposed = true; dispose() }
  }, [tool])
  return status
}

function SearchResultItem({ item }: { item: SearchItem }) {
  return (
    <li className={styles.resultCard}>
      <h2 className={styles.resultTitle}>{item.title}</h2>
      <p className={styles.summary}>{item.summary}</p>
      <p className={styles.source}>
        Source: <cite>{item.source.citation}</cite>
      </p>
      <p className={styles.access}>
        {item.access === 'free' ? 'Free contest excerpt' : 'Owned content'}
      </p>
      {item.playback && (
        <>
          <p aria-label="Public content and licensing" className={styles.mediaQualifier}>
            Rights-safe public excerpt: LearnLogos-owned narration, captions, and instructional
            graphics, licensed CC BY 4.0. LearnLogos is independent and is not sponsored or
            endorsed by Logos.
          </p>
          <video
            aria-label={`Play ${item.title}`}
            className={styles.video}
            controls
            preload="metadata"
            src={item.playback.url}
          >
            <track default kind="captions" label="English" src={item.playback.captionsUrl} srcLang="en" />
          </video>
        </>
      )}
    </li>
  )
}

function SearchResult({ result }: { result: ContestSearchEnvelope }) {
  return (
    <div className={styles.results} data-testid="contest-result">
      <p className={styles.persona}>{result.persona.displayName}</p>
      <p className={styles.boundary}>Access: approved contest content only</p>
      <p aria-live="polite" className={styles.count}>
        {result.data.total === 0
          ? 'No approved demonstration result is available for that question yet.'
          : `${result.data.total} approved result(s) found.`}
      </p>
      {result.data.results.length > 0 && (
        <ul className={styles.resultList}>
          {result.data.results.map((item) => (
            <SearchResultItem item={item} key={item.segmentId} />
          ))}
        </ul>
      )}
    </div>
  )
}

function ContestSearchForm({ tool }: { tool: ReturnType<typeof createSearchTrainingWebMcpTool> }) {
  const [question, setQuestion] = useState<string>(DEMO_QUESTIONS[0])
  const [result, setResult] = useState<ContestSearchEnvelope | null>(null)
  const [error, setError] = useState('')
  const latestRequest = useRef(0)

  async function runSearch(selectedQuestion: string) {
    const request = ++latestRequest.current
    setError('')
    setResult(null)
    try {
      const response = await tool.execute(
        { question: selectedQuestion, limit: 1 },
        { signal: new AbortController().signal },
      )
      if (request === latestRequest.current) setResult(response as ContestSearchEnvelope)
    } catch {
      if (request === latestRequest.current) {
        setResult(null)
        setError('The contest search is temporarily unavailable.')
      }
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void runSearch(question)
  }

  return (
    <>
      <form className={styles.form} onSubmit={submit}>
        <label className={styles.srOnly} htmlFor="contest-question">Learning question</label>
        <select
          id="contest-question"
          className={styles.input}
          onChange={(event) => {
            setQuestion(event.target.value)
            void runSearch(event.target.value)
          }}
          value={question}
        >
          {DEMO_QUESTIONS.map((demoQuestion) => (
            <option key={demoQuestion} value={demoQuestion}>{demoQuestion}</option>
          ))}
        </select>
        <button className={styles.button} type="submit">
          Search training
        </button>
      </form>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {result && <SearchResult result={result} />}
    </>
  )
}

export default function ContestExperience() {
  const tool = useMemo(() => createSearchTrainingWebMcpTool(), [])
  const status = useWebMcpRegistration(tool)
  return (
    <div className={styles.shell}>
      <main className={styles.main}>
        <p className={styles.eyebrow}>WebMCP Challenge</p>
        <h1 className={styles.title}>Ask a question. Watch the exact lesson.</h1>
        <p className={styles.lede}>
          LearnLogos turns a natural-language question into a cited, timestamped teaching excerpt
          that an agent can discover through a structured WebMCP tool.
        </p>
        <p className={styles.isolation}>
          This demonstration is isolated from the production LearnLogos website and searches only
          the two exact contest excerpts approved for public use.
        </p>

        <section className={styles.panel}>
          <p aria-live="polite" className={styles.status} data-testid="webmcp-status" role="status">
            WebMCP status: {status}
          </p>
          <ContestSearchForm tool={tool} />
        </section>
      </main>
    </div>
  )
}
