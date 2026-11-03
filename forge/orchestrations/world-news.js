// Use case 2: daily world news.
// Parallel regional/beat scouts -> verifier (dedupe + cross-check) -> editor writes the brief.
// Output: forge/reports/news/YYYY-MM-DD.md
//
//   forge run world-news                    all default beats
//   forge run world-news 'beats=["Asia-Pacific","AI & tech"]' lang=English

export const meta = {
  name: 'world-news',
  description: 'Scout agents sweep world news from the last 24h in parallel, verify and dedupe, then write a daily brief.',
  team: 'news-scouts',
  args: {
    beats: 'Optional list of regions/beats to scout (default: 10 global beats)',
    lang: 'Language of the brief (default English)',
  },
}

import fs from 'node:fs'
import path from 'node:path'

const DEFAULT_BEATS = [
  'North America (US, Canada, Mexico)',
  'Latin America & Caribbean',
  'Europe & UK (incl. EU institutions, Russia/Ukraine)',
  'Middle East & North Africa',
  'Sub-Saharan Africa',
  'South & Central Asia (India, Pakistan, Bangladesh, Central Asia)',
  'East Asia (China, Japan, Koreas, Taiwan)',
  'Southeast Asia & Oceania',
  'Global markets, economy & business',
  'Science, technology, AI, health & climate',
]

const STORIES = {
  type: 'object',
  properties: {
    stories: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          headline: { type: 'string' },
          summary: { type: 'string' },
          beat: { type: 'string' },
          countries: { type: 'array', items: { type: 'string' } },
          category: { type: 'string' },
          importance: { type: 'integer' },
          published: { type: 'string' },
          sources: { type: 'array', items: { type: 'string' } },
        },
        required: ['headline', 'summary', 'importance', 'sources'],
        additionalProperties: false,
      },
    },
  },
  required: ['stories'],
  additionalProperties: false,
}

export default async function ({ agent, parallel, phase, log, save, args, run }) {
  const date = new Date().toISOString().slice(0, 10)
  const beats = Array.isArray(args.beats) && args.beats.length ? args.beats : DEFAULT_BEATS

  phase('Scout')
  const reports = await parallel(beats.map(beat => () => agent('news-scout',
    `Today is ${date}. Your beat: ${beat}.\nFind the 6-10 most significant news stories from the last 24 hours on this beat. Rate importance 1-5 (5 = globally significant). Include source URLs you opened.`,
    { schema: STORIES, label: `scout:${beat.split(' ')[0].toLowerCase()}` })))
  const stories = reports.filter(Boolean).flatMap(r => r.stories)
  log(`${stories.length} raw stories from ${reports.filter(Boolean).length}/${beats.length} scouts`)
  if (!stories.length) throw new Error('no scout returned stories')
  save('raw-stories.json', stories)

  phase('Verify')
  const verified = await agent('news-verifier',
    `Today is ${date}. Here are raw stories from ${beats.length} regional scouts as JSON. Merge duplicates, cross-check the most important claims, drop anything unsubstantiated, mark single-source items in the summary with "(single source)". Keep importance ratings honest.\n\n${JSON.stringify(stories)}`,
    { schema: STORIES, label: 'verify' })
  const final = verified?.stories?.length ? verified.stories : stories
  save('verified-stories.json', final)

  phase('Edit')
  const brief = await agent('news-editor',
    `Write today's (${date}) world news brief in ${args.lang ?? 'English'} using the news-brief-style skill, from these verified stories (JSON). Use your journal for "Developing stories". Output only the Markdown brief.\n\n${JSON.stringify(final)}`,
    { label: 'editor' })
  if (!brief) throw new Error('editor failed')

  const outDir = path.join(run.reports, 'news')
  fs.mkdirSync(outDir, { recursive: true })
  const file = path.join(outDir, `${date}.md`)
  fs.writeFileSync(file, brief)
  save('brief.md', brief)
  log(`brief written to ${file}`)
  return brief
}
