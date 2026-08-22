import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { Nunito, Tinos, Gelasio, Cousine } from 'next/font/google'
import './globals.css'

/* The faces for print.
 *
 * The printed edition is set to the conventions of Nakamoto's Bitcoin paper,
 * which the user named as the target. That document is Times New Roman 10.1pt on
 * a 396pt measure with Century Schoolbook Bold for the title and the section
 * headings, Courier New for code, and Arial inside the diagrams — four faces,
 * three of them metric-defined rather than chosen.
 *
 * None of those three are licensable for embedding, so each is replaced by its
 * metric-compatible sibling, which is what makes the substitution honest rather
 * than approximate:
 *
 *   Times New Roman      -> Tinos    (same widths, same 10.1pt colour)
 *   Courier New          -> Cousine  (same 0.6em advance)
 *   Century Schoolbook   -> Gelasio  (no metric twin exists; Gelasio is the
 *                                     nearest schoolbook-genre bold, and the
 *                                     role it plays — a rounder, heavier face
 *                                     contrasting a Times body — survives)
 *
 * Arial is left to the system stack in print, exactly as the source document
 * does: it appears only inside diagram labels and it subsets to a few dozen
 * glyphs. Source Serif is gone. It was the right face for a paper that was
 * typeset as a paper; it is the wrong one for a paper typeset as THIS paper.
 *
 * `next/font` self-hosts all three at build time, so the PDF embeds fonts the
 * project owns rather than fonts that happen to be installed on whoever renders
 * it. Only print consumes them; the screen never loads them. */
const serif = Tinos({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
})

const serifDisplay = Gelasio({
  subsets: ['latin'],
  display: 'swap',
  weight: ['600', '700'],
  variable: '--font-serif-display',
})

const serifMono = Cousine({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '700'],
  variable: '--font-serif-mono',
})

/* The text face for the screen.
 *
 * Duolingo's own faces — Feather Bold and duolingo-sans — are not licensable.
 * Nunito is the substitute Duolingo names on its identity page, which makes it
 * the only legally clean route to this feel rather than an approximation of it.
 * It is also the reason the whole type scale moved up in weight: Nunito's
 * rounded terminals absorb optical weight, so 500 is its regular and 800 is what
 * reads as bold. 900 exists for display sizes only.
 *
 * Geist Sans stays loaded — the machine canvas still uses it for the record
 * views, where a rounded face would be dishonest about what it is showing. */
const nunito = Nunito({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-nunito',
})

export const metadata: Metadata = {
  title: 'Persistent memory architecture for agents — a review of Notion’s Lore',
  description:
    'A review of Notion’s Lore, the open-source agent memory system backed by five Notion databases, '
    + 'analysed as a database design and reimplemented on SQLite and PostgreSQL to measure what the '
    + 'substrate cannot express or refuse.',
  authors: [
    { name: 'Harshit Khemani' },
    { name: 'Kush Ahuja' },
    { name: 'Madhav Bassi' },
    { name: 'Kushagra Agrawal' },
  ],
  keywords: [
    'DBMS', 'database management systems', 'agent memory', 'Lore', 'Notion',
    'Model Context Protocol', 'MCP', 'entity-relationship model', 'normalization', 'BCNF',
    'functional dependency', 'temporal database', 'valid time', 'transaction time',
    'bitemporal', 'exclusion constraint', 'referential integrity', 'lost update',
    'entity resolution', 'record linkage', 'provenance', 'full-text search',
    'PostgreSQL', 'SQLite', 'knowledge graph',
  ],
  openGraph: {
    title: 'Persistent memory architecture for agents',
    description:
      'Notion’s Lore answers a realistic recall workload correctly — and needs 1 447 HTTP requests '
      + 'per question to do it, where one SQL statement suffices. A review, with measurements.',
    type: 'article',
  },
}

/* Light only. Declaring a dark theme-color would let the browser tint its own
   chrome to a colour this page never paints.

   This is the one literal colour in the codebase and it has to be: `theme-color`
   is read before any stylesheet applies, so it cannot reference a custom
   property. The value is `--bg` from globals.css; changing one without the other
   is the only way the two can drift. */
export const viewport = {
  themeColor: '#ffffff',
  colorScheme: 'light' as const,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={
        `${nunito.variable} ${GeistSans.variable} ${GeistMono.variable} `
        + `${serif.variable} ${serifDisplay.variable} ${serifMono.variable}`
      }
      style={{ colorScheme: 'light' }}
    >
      <head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
      </head>
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        {children}
      </body>
    </html>
  )
}
