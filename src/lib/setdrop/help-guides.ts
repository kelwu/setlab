// Content for the /help visual guides. Kept as data so the index and the
// [slug] page render from one source. Copy is grounded in the real flows
// (see knowledge.ts + the actual builder UIs) — keep it in sync when the
// product changes.

export interface HelpImage {
  /** Asset under /public/help/. When absent (or `pending`), a labeled
   *  placeholder box is shown instead so it's obvious what screenshot goes
   *  here — drop the file in and set `src` to swap it in. */
  src?: string;
  /** Description of the shot — also rendered inside the placeholder. */
  alt: string;
  caption?: string;
  pending?: boolean;
}

export interface HelpStep {
  heading: string;
  /** One or more paragraphs (split on blank lines). */
  body: string;
  image?: HelpImage;
  /** Small callout rendered under the step. */
  note?: string;
}

export interface HelpSection {
  /** e.g. "Serato" / "Rekordbox". Omit for a single-track guide. */
  title?: string;
  intro?: string;
  steps: HelpStep[];
}

export interface HelpGuide {
  slug: string;
  eyebrow: string;
  title: string;
  summary: string;
  minutes: number;
  sections: HelpSection[];
}

export const HELP_GUIDES: HelpGuide[] = [
  {
    slug: 'import',
    eyebrow: 'Guide',
    title: 'IMPORT YOUR LIBRARY',
    summary: 'Get your Serato or Rekordbox collection into SetLab — the one step everything else builds on.',
    minutes: 3,
    sections: [
      {
        title: 'Serato',
        intro: 'Serato stores your whole library in a single file. You just need to find it and hand it to SetLab.',
        steps: [
          {
            heading: 'Open your Serato folder',
            body:
              'Serato keeps your library in a folder called _Serato_.\n\n' +
              'On Windows it lives at C:\\Users\\<you>\\Music\\_Serato_. On Mac it\'s at ~/Music/_Serato_ — in Finder press ⌘⇧G and paste that path. If your library is on an external drive, look for a _Serato_ folder at the root of that drive instead.',
          },
          {
            heading: 'Find the file named "database V2"',
            body:
              'Inside _Serato_ there is a file literally named database V2 — with no file extension. That single file is your entire library.\n\n' +
              'Don\'t open, move, or rename it — you\'re just going to point SetLab at a copy of it.',
            image: {
              src: '/help/serato-database-v2.png',
              alt: 'The _Serato_ folder with the extensionless "database V2" file highlighted',
              caption: 'Inside Music/_Serato_ — "database V2", with no file extension.',
            },
          },
          {
            heading: 'Drop it into SetLab',
            body:
              'In SetLab, open Library and drag database V2 onto the upload area — or click to browse and select it.',
          },
          {
            heading: 'Let it parse',
            body:
              'SetLab reads the metadata — artist, title, BPM, key, genre, year — and your tracks appear. Large libraries upload straight to storage, so nothing times out.',
            note: 'SetLab only ever reads metadata. It never opens, moves, or modifies your audio files or your original Serato database.',
          },
        ],
      },
      {
        title: 'Rekordbox',
        intro: 'Rekordbox exports its collection as an XML file. Export it once, then upload it.',
        steps: [
          {
            heading: 'Export your collection as XML',
            body:
              'In Rekordbox, go to File → Export Collection in xml format.\n\n' +
              'If you don\'t see that option, open Preferences → Advanced → Database and set an "Imported Library" xml path first, then export.',
          },
          {
            heading: 'Save the .xml somewhere easy',
            body: 'Pick your Desktop or Downloads folder so it\'s easy to find in the next step.',
          },
          {
            heading: 'Upload it to SetLab',
            body:
              'In SetLab → Library, choose the Rekordbox XML you just exported. SetLab parses it right in your browser and syncs your tracks.',
            note: 'Heads up: Rekordbox XML often leaves out release years, so era-based features (like "2000s only") work best with a Serato library.',
          },
        ],
      },
    ],
  },
  {
    slug: 'plan-a-set',
    eyebrow: 'Guide',
    title: 'PLAN A SET',
    summary: 'Turn a gig brief into an ordered, sequenced set — start to finish, with transitions and an energy arc.',
    minutes: 2,
    sections: [
      {
        steps: [
          {
            heading: 'Open Plan Set',
            body: 'Click Plan Set in the top nav.',
          },
          {
            heading: 'Describe the gig',
            body:
              'Set the crowd, lineup slot, and duration — the required pieces. Then optionally narrow the pool by genre, era, artist, or vibe.',
          },
          {
            heading: 'Shape the energy arc',
            body:
              'Drag the arc — or pick a preset like Peak Hour — to tell SetLab how the energy should rise and fall across the set.',
          },
          {
            heading: 'Add seeds (optional)',
            body: 'Anchor the set with a seed track, a SoundCloud mix URL, or a word for Wordplay.',
          },
          {
            heading: 'Drop the Set',
            body:
              'Hit Drop the Set. You land on the output page with an ordered set — each track shows why it was chosen, how to transition to the next, and the harmonic-mixing logic.',
          },
          {
            heading: 'Tweak & export',
            body:
              'Swap or reorder anything — the AI gives you a draft, you make the calls — then export to Serato, Rekordbox, or M3U.',
          },
        ],
      },
    ],
  },
  {
    slug: 'build-a-crate',
    eyebrow: 'Guide',
    title: 'BUILD A CRATE',
    summary: 'Group tracks from your library into a reusable, themed bin you can pull from whenever.',
    minutes: 2,
    sections: [
      {
        steps: [
          {
            heading: 'Open Crates',
            body: 'Click Crates in the top nav.',
          },
          {
            heading: 'Name it and set filters',
            body:
              'Give the crate a name — this becomes the crate name in Serato and the playlist name in Rekordbox. Then optionally narrow by genre, BPM range, year range, or crate size.',
          },
          {
            heading: 'Build Crate',
            body:
              'Hit Build Crate. SetLab scans your whole library and fills the crate to your target size — topping up from the wider genre family if exact matches fall short, and telling you the split.',
          },
          {
            heading: 'Review the bin',
            body:
              'You get a grid of matching tracks with BPM, key, year, and genre. Swap out anything that doesn\'t fit the vibe.',
            image: {
              src: '/help/crate-grid.png',
              alt: 'SetLab crate output — the grid of record-tiles',
              caption: 'A crate is a bin, not an ordered set — each tile shows BPM, key, year, and genre.',
            },
          },
          {
            heading: 'Export',
            body: 'Download as a Serato .crate, Rekordbox XML, or M3U.',
            note: 'Crates only use tracks you already own — they won\'t suggest music you don\'t have.',
          },
        ],
      },
    ],
  },
];

export function getGuide(slug: string): HelpGuide | undefined {
  return HELP_GUIDES.find((g) => g.slug === slug);
}
