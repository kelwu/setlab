// Genre-model regression checks. Run: npm run check:genres (also runs in CI).
//
// Sweeps EVERY genre the builder offers (GENRE_GROUPS) instead of spot-checking a
// few, because the bugs here were per-genre: "Nu-Disco" silently classified as
// 'other' (which switches the genre gate off entirely), and logic that judged a
// Disco House / Nu-Disco gig on the primary genre alone. Add a case here whenever
// a genre bug is fixed.
import { GENRE_GROUPS } from '../src/lib/setdrop/constants';
import {
  superFamily, genreRelevance, passesGenreGate, gigGenreMatch, gigGenreLabel,
} from '../src/lib/setdrop/genre';
import { songKey } from '../src/lib/setdrop/song-key';

let failures = 0;
function check(ok: boolean, msg: string) {
  if (!ok) { failures++; console.error(`FAIL  ${msg}`); }
}

const ALL = GENRE_GROUPS.flatMap(g => g.genres);

// 1. Every builder genre is classified, so the gate actually filters for it.
for (const g of ALL) {
  check(superFamily(g) !== 'other', `"${g}" classifies as 'other' — a ${g} set would admit every genre`);
}

// 2. Every builder genre matches itself under the spellings DJs and tag sources
//    actually use (case, hyphen vs space).
const variants = (g: string) => [g, g.toLowerCase(), g.toUpperCase(), g.replace(/-/g, ' '), g.replace(/ /g, '-')];
for (const g of ALL) {
  for (const v of variants(g)) {
    const tier = genreRelevance(g, v).tier;
    check(tier === 'exact', `"${v}" vs gig "${g}" → ${tier}, expected exact`);
    const back = genreRelevance(v, g).tier;
    check(back === 'exact', `gig "${v}" vs track "${g}" → ${back}, expected exact`);
  }
}

// 3. The super-family wall: no electronic gig admits a tagged open-format track
//    and vice versa (bridges like Disco are allowed by design).
const electronic = ALL.filter(g => superFamily(g) === 'electronic');
const openFormat = ['Hip-Hop', 'R&B', 'Trap', 'Reggaeton', 'Dancehall'];
for (const gig of electronic) {
  for (const t of openFormat) {
    check(!passesGenreGate(gig, t), `${gig} gig admits tagged ${t}`);
  }
}

// 4. Secondary genre counts everywhere: a Nu Disco track is an exact match for a
//    Disco House / Nu-Disco gig, and the label names both.
check(gigGenreMatch('Disco House', 'Nu-Disco', 'Nu Disco').tier === 'exact', 'secondary genre not counted as exact');
check(gigGenreMatch('Disco House', 'Nu-Disco', 'Nu Disco').inGenre, 'secondary genre not admitted');
check(!gigGenreMatch('Disco House', 'Nu-Disco', 'Hip-Hop').inGenre, 'Disco House / Nu-Disco gig admits Hip-Hop');
check(gigGenreLabel('Disco House', 'Nu-Disco') === 'Disco House or Nu-Disco', 'gigGenreLabel');
check(gigGenreLabel('House', '') === 'House', 'gigGenreLabel without secondary');

// 5. Version dedupe: DJ-pool versions collapse, real remixes don't.
const same = (a: [string, string], b: [string, string]) => songKey(...a) === songKey(...b);
check(same(['Q-Tip', 'Vivrant Thing (Sergio Villanueva Remix) (Clean Extended)'],
           ['Q-Tip', 'Vivrant Thing (Sergio Villanueva Remix) (Dirty Extended)']), 'clean/dirty versions not collapsed');
check(same(["HUGEL, Imael Angel & Ultra Nate", "Movin' To The Sun (Clean Extended)"],
           ["Ultra Nate, Hugel, Imael Angel", "Movin' To The Sun (Extended Mix)"]), 'artist order / mix label not collapsed');
check(!same(['Purple Disco Machine ft Eyelar', 'Dopamine (Clean Extended)'],
            ['Purple Disco Machine ft Eyelar', 'Dopamine (John Summit Remix) (Clean Extended)']), 'remix wrongly collapsed');

if (failures) {
  console.error(`\n${failures} genre check(s) failed.`);
  process.exit(1);
}
console.log(`Genre checks passed (${ALL.length} builder genres).`);
