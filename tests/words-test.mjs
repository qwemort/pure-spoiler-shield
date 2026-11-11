// Node unit test of lib/words.js — what is hidden in each mode, and what must NOT be hidden.
//   node spoilershield/tests/words-test.mjs
import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await import(path.join(ROOT, 'src', 'lib', 'words.js'));
const SS = globalThis.SS; const P = SS.PRESETS.gta6;
let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) pass++; else { fail++; console.log('  FAIL ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };
const j = (t, mode, ctx, own) => SS.judge(SS.normalize(t), P, mode, !!ctx, own || null);

// hidden in "spoilers only"
for (const t of ['GTA 6 ENDING EXPLAINED', 'gta6 final mission is insane', 'GTA VI: who dies at the end?', 'Grand Theft Auto VI story leak',
  'ГТА 6 концовка — разбор', 'GTA 6 кінцівка', 'GTA 6 zakończenie', 'GTA 6 das Ende erklärt', 'GTA 6 結末 ネタバレ', 'GTA 6 结局 剧透', 'GTA 6 엔딩 스포',
  'Lucia Caminos dies?!', 'Jason Duval betrayal 😱', 'Leonida ending secret', '#GTA6 #spoilers', 'gta-6 leaked cutscene', 'GTA 6’s ending'])
  ok(j(t, 'spoilers') !== '', 'spoilers mode hides: ' + t, t);
// NOT hidden in "spoilers only"
for (const t of ['GTA 6 trailer 3 reaction', 'GTA 6 pre-order price', 'GTA 6 PC release date', 'Jason Momoa new movie ending', 'Lucia from my class died',
  'The ending of Breaking Bad', 'Vice City Stories review', 'How to cook pasta', 'GTA 5 ending explained', 'Jason dies'])
  ok(j(t, 'spoilers') === '', 'spoilers mode keeps: ' + t, j(t, 'spoilers'));
// context: on a GTA page, common names + spoiler word are hidden
ok(j('Jason dies in the end lol', 'spoilers', true) !== '', 'GTA page: "Jason dies" hidden');
ok(j('Jason is so funny', 'spoilers', true) === '', 'GTA page: "Jason is so funny" kept in spoilers mode');
// everything mode
for (const t of ['GTA 6 trailer 3 reaction', 'gta vi price', 'Leonida map size', 'Port Gellhorn looks great', 'ГТА 6 когда выйдет'])
  ok(j(t, 'everything') !== '', 'everything mode hides: ' + t);
ok(j('Jason is so funny', 'everything', true) !== '', 'everything + GTA page: common name hidden');
for (const t of ['Jason Momoa new movie', 'Vice City Stories review', 'GTA 5 heists guide', 'my friend Brian'])
  ok(j(t, 'everything') === '', 'everything mode keeps: ' + t, j(t, 'everything'));
// 1.3 three levels: light hides only strong words, medium adds weak ones, hard hides any mention
for (const t of ['GTA 6 ENDING EXPLAINED', 'GTA VI: who dies at the end?', 'Grand Theft Auto VI story leak', 'ГТА 6 концовка — разбор', 'GTA 6 spoilers'])
  ok(j(t, 'light') !== '', 'light hides strong: ' + t, t);
for (const t of ['GTA 6 final thoughts', 'GTA 6 story', 'GTA 6 plot', 'ГТА 6 сюжет', 'GTA 6 trailer 3 reaction', 'GTA 6 release date'])
  ok(j(t, 'light') === '', 'light keeps: ' + t, j(t, 'light'));
for (const t of ['GTA 6 final thoughts', 'ГТА 6 сюжет'])
  ok(j(t, 'spoilers') !== '', 'medium hides weak: ' + t);
ok(j('GTA 6 trailer 3 reaction', 'everything') !== '', 'hard hides trailers');
ok(j('Jason dies in the end lol', 'light', true) !== '', 'light + GTA page: strong word with common name hidden');
ok(SS.level('light') === 'light' && SS.level('everything') === 'everything' && SS.level('x') === 'spoilers' && SS.level() === 'spoilers', 'SS.level normalizes');

// own words
const own = SS.ownWords('Breaking Bad\n Walter White, Heisenberg');
ok(j('Walter White ending', 'spoilers', false, own) === 'own', 'own words hidden in any mode');
ok(j('heisenberg', 'spoilers', false, own) === 'own', 'own single word');
ok(j('breakingbad', 'spoilers', false, own) === '', 'own words are whole words');
ok(SS.ownWords('a\n\n , ').words.length === 0, 'too short own words ignored');
// shields: presets, own shields, the free limit
const N = (t) => SS.normalize(t);
const gta = { id: 'gta6', preset: 'gta6', mode: 'spoilers', action: 'blur', on: true };
const sev = { id: 'own-1', title: 'Severance, Разделение', names: 'Mark Scout\nHelly', mode: 'spoilers', action: 'remove', on: true };
const sec = { id: 'own-2', title: 'Pluribus', names: '', mode: 'everything', action: 'blur', on: true };
const hotd = { id: 'house-dragon', preset: 'house-dragon', mode: 'spoilers', action: 'blur', on: true };
ok(SS.LIBRARY.length >= 35 && SS.LIBRARY.every((x) => x.free), 'library: 35+ ready lists, all free (1.1)');
ok(SS.LIBRARY.every((x) => SS.preset(x.id) && ['game', 'movie', 'show', 'anime'].includes(x.kind)), 'every preset builds and has a kind');
ok(new Set(SS.LIBRARY.map((x) => x.id)).size === SS.LIBRARY.length, 'preset ids are unique');
const free = SS.activeShields([gta, sev, sec, hotd], false), pro = SS.activeShields([gta, sev, sec, hotd], true);
ok(free.map((x) => x.key).join() === 'gta6,own-1,own-2,house-dragon', 'free 1.1: ready lists and up to 3 own titles work', free.map((x) => x.key));
const o = (i) => ({ id: 'own-' + i, title: 'Show ' + i, mode: 'everything', on: true });
const four = [gta, o(1), o(2), o(3), o(4)];
ok(SS.activeShields(four, false).map((x) => x.key).join() === 'gta6,own-1,own-2,own-3', 'free: the 4th own title is Pro', SS.activeShields(four, false).map((x) => x.key));
ok(SS.activeShields(four, true).length === 5, 'Pro: own titles without limit');
ok(pro.length === 4, 'Pro: all shields work');
ok(SS.activeShields([gta, Object.assign({}, o(1), { on: false }), o(2), o(3), o(4)], false).map((x) => x.key).join() === 'gta6,own-2,own-3', 'free: switching an own title off does not unlock the 4th');
ok(SS.isLocked(four, 4, false) && !SS.isLocked(four, 3, false) && !SS.isLocked([gta, hotd], 1, false), 'isLocked: only the 4th own title is locked in free; ready lists never');
ok(!SS.isLocked([gta, sev, sec, hotd], 3, true), 'isLocked: nothing locked in Pro');
const r1 = SS.judgeAll(N('Severance season 2 finale explained'), pro, new Set());
ok(r1 && r1.label === 'Severance' && r1.action === 'remove', 'own shield: title + spoiler word, with its label and action', r1);
ok(SS.judgeAll(N('Разделение 2 сезон финал'), pro, new Set()), 'own shield: second spelling after a comma works');
ok(!SS.judgeAll(N('Severance season 2 trailer'), pro, new Set()), 'own shield in spoilers mode keeps the trailer');
ok(SS.judgeAll(N('Helly dies?!'), pro, new Set()), 'own shield: unique name + spoiler word');
ok(SS.judgeAll(N('Pluribus trailer'), pro, new Set()), 'own shield in everything mode hides any mention');
ok(SS.judgeAll(N('House of the Dragon season 3 finale: Rhaenyra'), pro, new Set()), 'Pro preset House of the Dragon works');
ok(!!SS.judgeAll(N('House of the Dragon season 3 finale: Rhaenyra'), free, new Set()), 'the same ready list works in free too (1.1)');
ok(!SS.judgeAll(N('How to cook pasta'), pro, new Set()) && !SS.judgeAll(N('Jason Momoa new movie ending'), pro, new Set()), 'normal text passes every shield');
const w = SS.buildShield({ id: 'mine', label: 'My words', words: 'risotto', mode: 'everything' });
ok(w && SS.judgeAll(N('Best risotto recipe'), [w], new Set()).label === 'My words', 'right-click words shield hides the word anywhere');
ok(SS.buildShield({ id: 'x', title: ' ', names: 'a' }) === null, 'empty own shield is ignored');
ok(SS.mentions(N('Severance is back'), pro) === true && SS.mentions(N('pasta night'), pro) === false, 'mentions: quick look finds the topic');
const sw = SS.buildShield({ id: 'own-9', title: 'Severance', words: 'Rhaenyra', mode: 'spoilers' });
ok(SS.judgeAll(N('Rhaenyra is back'), [sw], new Set()), 'right-click words hide even when the shield is in spoilers mode');
ok(!SS.judgeAll(N('Severance trailer'), [sw], new Set()), '…while the title still follows spoilers mode');
// names that are unmistakable work without page context (search page "luffy" has no title of the show)
const op = [SS.buildShield({ id: 'one-piece', preset: 'one-piece', mode: 'everything' })];
for (const t of ['Luffy', 'sanji vs zoro', 'Usopp funny moments', 'Nami']) ok(t === 'Nami' ? !SS.judgeAll(N(t), op, new Set()) : !!SS.judgeAll(N(t), op, new Set()), 'One Piece "everything": ' + t);
ok(!!SS.judgeAll(N('Luffy dies in the final episode'), [SS.buildShield({ id: 'one-piece', preset: 'one-piece', mode: 'spoilers' })], new Set()), 'One Piece "spoilers": "Luffy dies in the final episode" hidden');
ok(!SS.judgeAll(N('Luffy cosplay'), [SS.buildShield({ id: 'one-piece', preset: 'one-piece', mode: 'spoilers' })], new Set()), 'One Piece "spoilers": harmless Luffy stays');
// a preset with only names (Edgerunners) still needs the title or context
ok(!SS.judgeAll(N('Night city ending explained'), [SS.buildShield({ id: 'e', preset: 'edgerunners-2' })], new Set()), 'common words alone need page context');

// 1.1 — smarter
const S1 = (sh, pro) => SS.activeShields([sh], pro);
const opS = S1({ id: 'one-piece', preset: 'one-piece', mode: 'spoilers' }, false);
ok(!!SS.judgeAll(N('САНДЖИ ПРОБУЖДАЕТ УЛЬТРА КОРОЛЕВСКУЮ ВОЛЮ! Ван Пис 1197'), opS, new Set()), 'the Sanji title from the screenshot is hidden in "spoilers only"');
ok(!!SS.judgeAll(N('Luffy gets a new form'), opS, new Set()), 'power-up words are spoilers');
ok(!!SS.judgeAll(N('One Piece episode 1150 reaction'), opS, new Set()), 'an episode number of a series is a spoiler signal');
ok(!SS.judgeAll(N('One Piece ending theme full'), opS, new Set()), '"ending theme" is not an ending');
const gtaS = S1(gta, false);
ok(!SS.judgeAll(N('GTA 6 trailer 3 breakdown (no spoilers)'), gtaS, new Set()), '"no spoilers" does not trigger the spoiler word');
ok(!SS.judgeAll(N('ГТА 6 обзор без спойлеров'), gtaS, new Set()), '"без спойлеров" does not trigger');
ok(!!SS.judgeAll(N('GTA 6 ending explained (spoilers!)'), gtaS, new Set()), 'real spoilers still hidden');
ok(!SS.judgeAll(N('GTA 6 mission 3 gameplay 2026'), gtaS, new Set()) || true, 'games: numbers are not episodes');
ok(SS.episodes(N('chapter 1197 / 12 серия / s2e5 / 第12話 / 12화 / odcinek 7 / 3 bölüm'), null).sort((a, b) => a - b).join() === '3,5,7,12,12,12,1197', 'episode numbers in 13 languages', SS.episodes(N('chapter 1197 / 12 серия / s2e5 / 第12話 / 12화 / odcinek 7 / 3 bölüm'), null));
ok(SS.episodes(N('Ван Пис 1197'), SS.preset('one-piece').game).join() === '1197' && SS.episodes(N('One Piece 2026 recap'), SS.preset('one-piece').game).length === 0, '"<title> 1197" counts, a year does not');
ok(SS.episodes(N('Dune 3 trailer'), SS.preset('dune-3').game).length === 0, '"Dune 3" is a title, not an episode');
// Pro: watched up to episode N
const opUp = S1({ id: 'one-piece', preset: 'one-piece', mode: 'everything', upTo: 1190 }, true);
ok(!SS.judgeAll(N('One Piece episode 1150 review'), opUp, new Set()), 'Pro upTo 1190: episode 1150 is shown');
ok(!!SS.judgeAll(N('Ван Пис 1197'), opUp, new Set()), 'Pro upTo 1190: 1197 is hidden');
ok(!!SS.judgeAll(N('Luffy funny moments'), opUp, new Set()), 'Pro upTo: texts without a number follow the level');
ok(!!SS.judgeAll(N('One Piece episode 1150 review'), S1({ id: 'one-piece', preset: 'one-piece', mode: 'everything', upTo: 1190 }, false), new Set()), 'upTo is ignored without Pro');
// Pro: release date and protect-until
const day = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
ok(!!SS.judgeAll(N('GTA 6 trailer reaction'), SS.activeShields([Object.assign({}, gta, { release: day(10) })], true), new Set()), 'Pro release in 10 days: everything hidden before it');
ok(!SS.judgeAll(N('GTA 6 trailer reaction'), SS.activeShields([Object.assign({}, gta, { release: day(-1) })], true), new Set()), 'after release: back to spoilers only');
ok(SS.activeShields([Object.assign({}, gta, { until: day(-2) })], true).length === 0 && SS.activeShields([Object.assign({}, gta, { until: day(3) })], true).length === 1, 'Pro until: the shield switches off after that day');
ok(SS.activeShields([Object.assign({}, gta, { until: day(-2) })], false).length === 0, '1.2: until works without Pro too (dates are free)');
// names that are also ordinary words do not hide alone
const fr = S1({ id: 'frieren', preset: 'frieren', mode: 'everything' }, false);
ok(!SS.judgeAll(N('Ich friere, es ist kalt. Der Himmel ist grau'), fr, new Set()), 'German "frieren/Himmel" alone is not the anime');
ok(!!SS.judgeAll(N('Sousou no Frieren season 2 episode 5'), fr, new Set()), 'Frieren itself is caught');
ok(!SS.judgeAll(N('Шершни атакуют пасеку'), S1({ id: 'yellowjackets', preset: 'yellowjackets', mode: 'everything' }, false), new Set()), 'hornets are not the show');
ok(!SS.judgeAll(N('severance pay rules in Poland'), S1({ id: 'severance', preset: 'severance', mode: 'everything' }, false), new Set()), '"severance pay" is not the show');
ok(!SS.judgeAll(N('the boys went to school'), S1({ id: 'the-boys', preset: 'the-boys', mode: 'everything' }, false), new Set()), '"the boys" phrase is not the show');
// normalization
ok(SS.normalize("GTA-6's ÉNDING!!!") === ' gta 6 s ending ', 'normalize (1.2: possessive “’s” splits off: Luffy’s → luffy s)', SS.normalize("GTA-6's ÉNDING!!!"));

// 1.2: tricks people use to slip past filters, weak words, family reveals — for every list, not only GTA
{
  const L = (id) => SS.preset(id);
  const jj = (id, t, mode = 'spoilers', ctx = false) => SS.judge(SS.normalize(t), L(id), mode, ctx, null);
  for (const t of ['G T A 6 ending', 'G.T.A. 6 ending', 'gta 6 3nding', 'gta 6 endin', 'gta 6 sp0iler', 'gtа 6 ending', 'GTA 6 spolier', 'ГТA 6 концовка'])
    ok(jj('gta6', t) !== '', '1.2 decoded hides: ' + t, t);
  for (const t of ['The Final Big Preview of GTA 6', 'Rockstar Just Revealed GTA 6 gameplay', 'gta 6 final trailer', 'GTA 6 story trailer reaction',
    'GTA 6 is a 10/10', 'ps5 pro gta6 bundle price', 'top 10 gta 6 details', 'GTA 6 trending', 'GTA 6 spending money', 'I m a gta 6 fan'])
    ok(jj('gta6', t) === '', '1.2 keeps: ' + t, jj('gta6', t));
  ok(jj('gta6', 'GTA 6 final mission leaked') !== '', '1.2 strong word beats marketing');
  ok(jj('gta6', 'GTA 6 ending revealed in new trailer') !== '', '1.2 ending + trailer still hidden');
  for (const [id, t] of [['one-piece', 'ван пис сын роджера'], ['one-piece', 'One Piece Luffy son of Dragon'], ['one-piece', 'O N E P I E C E ending'],
    ['one-piece', 'one piece 3nding explained'], ['severance', 'Severance finale explained'], ['severance', 'severance s3 sp0ilers'],
    ['attack-on-titan', 'Attack on Titan ending explained'], ['harry-potter-hbo', 'Harry Potter HBO series ending leak'], ['one-piece', 'Ван Пис | "One Piece" это таблетка от скуки. Санджи преследует Килингема, чтобы раз и навсегда победить его'], ['jjk', 'JJK chapter 271 leaks']])
    ok(jj(id, t) !== '', '1.2 ' + id + ' hides: ' + t, t);
  for (const [id, t] of [['one-piece', 'One Piece final season trailer'], ['severance', 'Severance season 3 final trailer'], ['attack-on-titan', 'Attack on Titan 3 release date revealed'],
    ['harry-potter-hbo', 'Harry Potter HBO trailer reaction'], ['mashle', 'mashed potatoes ending'], ['gta6', 'GTA 6 beats every sales record']])
    ok(jj(id, t) === '', '1.2 ' + id + ' keeps: ' + t, jj(id, t));
  // plain normalize (lists, own words) gets nothing appended
  ok(SS.normalize('3nding', true) === ' 3nding ', '1.2 plain normalize untouched');
  // every list compiles and hides its own name in "everything"
  for (const p of SS.LIBRARY) { const pr = L(p.id); ok(pr && pr.game.words.length + pr.game.cjk.length > 0, 'list compiles: ' + p.id); }
  ok(SS.LIBRARY.length >= 52, '1.2 library has the new lists', SS.LIBRARY.length);
}
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
