// Query cleanup is deliberately lexical. It does not interpret stored instructions or call a model.
const normalize = value => String(value || '').normalize('NFKC').toLocaleLowerCase('en-US');
const stopWords = new Set(('a an and are as at be before can could did do does for from give had has have how i in is it me my of on or please remember should tell that the their them there they this to was were what when where which who why will with would you your about into say says said ' +
    'search find look looking lookup up retrieve recall show summarize summary explain saved imported local memory memories note notes file files source sources content contents').split(' '));

// Chinese function words and question scaffolding. Content words such as 测试 or 偏好 remain search terms.
const chineseStopWords = new Set(('的 地 得 了 着 过 是 在 有 和 跟 与 及 或 也 都 就 还 又 再 很 最 更 把 被 给 对 向 从 到 让 用 吗 呢 吧 啊 呀 么 嘛 哦 不 没 去 来 ' +
    '我 你 您 他 她 它 这 那 哪 谁 个 些 里 上 下 中 内 外 前 后 要 想 能 会 该 说 请 帮 查 找 搜 ' +
    '我们 你们 他们 她们 它们 咱们 自己 大家 这个 那个 这些 那些 这里 那里 这儿 那儿 这样 那样 这么 那么 什么 怎么 怎样 怎么样 如何 为什么 为何 ' +
    '哪里 哪儿 哪些 哪个 多少 几个 什么时候 时候 以及 或者 还是 但是 不过 而且 并且 如果 因为 所以 然后 之前 之后 以前 以后 现在 曾经 已经 一直 ' +
    '一下 一些 一个 有没有 没有 是否 是不是 可以 可能 能够 应该 需要 想要 告诉 知道 记得 记住 提到 提过 说过 关于 有关 请问 帮忙 一起 ' +
    '干什么 干嘛 做什么 一般 平时 通常 经常 总是 常常 查询 查找 检索 搜索 查看 里面 之中 内容 记忆 记录').split(' '));
// Traditional forms of the characters above, so 我們 or 什麼時候 are recognized like 我们 or 什么时候.
// Folding is only for this check; a search term keeps the characters the question used.
const simplified = Object.fromEntries([...'著着過过與与還还給给對对從从讓让嗎吗麼么麽么這这誰谁個个裡里裏里內内後后會会該该說说們们兒儿樣样為为幾几時时並并現现經经沒没夠够應应訴诉記记關关於于請请問问幫帮幹干總总詢询檢检憶忆錄录來来甚什兩两隻只條条張张輛辆塊块種种點点場场雙双']
    .flatMap((char, index, chars) => index % 2 ? [] : [[char, chars[index + 1]]]));
const fold = word => [...word].map(char => simplified[char] || char).join('');
// A count such as 一只, 三个 or 这次 says how many, not what; 那本书 keeps only 书.
const counted = /^[\d一二两三四五六七八九十百千几每某这那哪上下][个只本条张件次份位辆台块种些点回遍场封篇首部双对套杯瓶碗]/u;
const withoutCount = word => [...word].slice(counted.test(fold(word)) ? 2 : 0).join('');
// 我的, 我是 or 过的 is made only of function characters and is scaffolding as a whole.
const scaffolding = word => { const plain = fold(word); return chineseStopWords.has(plain) || [...plain].every(char => chineseStopWords.has(char)); };
const han = /\p{Script=Han}/u;
// Han text has no spaces, so a whole question would otherwise become one unmatched term. Split it into
// dictionary words. Without ICU word data the segmenter returns single characters; use bigrams then.
const segmenter = (() => {
    if (typeof Intl.Segmenter !== 'function') return null;
    const words = new Intl.Segmenter('zh', { granularity: 'word' });
    return [...words.segment('测试数据')].some(part => part.isWordLike && part.segment.length > 1) ? words : null;
})();
// A run of single characters longer than a name (李明喝) also yields its pairs, so the name can select the
// person's notes, and its characters, which help rank them.
const parts = run => { const chars = [...run]; return chars.length > 2 && chars.every(char => han.test(char)) ? [...chars.slice(1).map((char, index) => chars[index] + char), ...chars] : []; };
function queryWords(run) {
    if (!han.test(run)) return [run];
    if (segmenter) return [...segmenter.segment(run)].filter(part => part.isWordLike).map(part => part.segment);
    return (run.match(/\p{Script=Han}+|[^\p{Script=Han}]+/gu) || []).flatMap(part => {
        const chars = [...part];
        return !han.test(part) || chars.length < 3 ? [part] : chars.slice(1).map((char, index) => chars[index] + char);
    });
}

export function memoryWord(value) {
    const word = normalize(value);
    // Small, explicit English variants; filenames such as feedback_language_preferences.md also match.
    const variants = { preferences: 'preference', prefer: 'preference', prefers: 'preference', preferred: 'preference', preferring: 'preference', promised: 'promise', promises: 'promise', promising: 'promise', working: 'work', works: 'work', styles: 'style', languages: 'language' };
    return variants[word] || (word.length > 5 && word.endsWith('ies') ? word.slice(0, -3) + 'y' : word.length > 4 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word);
}

export function memoryQueryTerms(query) {
    const words = [];
    for (const run of normalize(query).match(/[\p{L}\p{N}]+/gu) || []) {
        let single = '';
        // Unknown names often segment into single characters (李|明), and dates into 5|月; keep such a sequence together.
        for (const segment of [...queryWords(run), '']) {
            const word = withoutCount(segment);
            if (/^\p{N}+$/u.test(word) || han.test(word) && [...word].length === 1 && !scaffolding(word)) { single += word; continue; }
            if (single) words.push(single, ...parts(single));
            single = '';
            if (word) words.push(word);
        }
    }
    // A lone Han character (猫) stays a term; retrieval lets it rank sources but not select one by itself.
    const terms = words.filter(word => han.test(word) ? !scaffolding(word) : word.length > 1 && !stopWords.has(word));
    return [...new Set(terms.map(memoryWord))].slice(0, 40);
}

/** Only an explicit memory-source reference scopes a query. A topic merely mentioning Claude does not. */
export function analyzeMemoryQuery(question) {
    let query = String(question || '');
    const providers = new Set();
    const take = phrase => { for (const match of phrase.matchAll(/\b(codex|claude)\b/gi)) providers.add(match[1].toLowerCase()); return ' '; };
    const names = '(?:codex|claude(?:\\s+code)?)(?:\\s*(?:and|or|&|,|/|和|与|及)\\s*(?:codex|claude(?:\\s+code)?))?';
    const memory = '(?:memor(?:y|ies)|notes?|files?|记忆|记录)';
    query = query.replace(new RegExp(`\\b${names}\\s*(?:['’]s\\s*)?(?:local\\s+)?${memory}`, 'gi'), take);
    query = query.replace(new RegExp(`${memory}\\s+(?:from|in|of)\\s+(?:my\\s+)?${names}\\b`, 'gi'), take);
    query = query.replace(new RegExp(`\\b${names}\\s+(?:remember|know)(?:s)?\\b`, 'gi'), take);
    query = query.replace(new RegExp(`\\b${names}\\s*(?:里|中|的)(?:的)?\\s*${memory}`, 'gi'), take);
    // "My Claude working-style-pragmatic memory" names a provider and a topic/file.
    // Bound the intervening phrase and forbid crossing sentences; keep it as search content.
    query = query.replace(new RegExp(`\\b(?:my|imported|saved|local)\\s+(${names})\\s+((?:(?![.!?]\\s)[^\\r\\n]){1,100}?)\\s+${memory}\\b`, 'gi'), (whole, providerNames, topic) => {
        if (topic.trim().split(/\s+/).length > 12) return whole;
        take(providerNames);
        return ` ${topic} `;
    });
    const semantic = memoryQueryTerms(query);
    return { query: semantic.join(' '), providers: [...providers].sort() };
}

export function isMemoryRecallRequest(value) {
    const text = String(value || '').trim();
    if (/^(?:please\s+)?(?:remember this|save this|note this|remind me|draft\b|(?:create|add)\s+(?:a\s+)?task\b|记住|记录一下|保存|提醒我|创建任务)/i.test(text)) return false;
    if (analyzeMemoryQuery(text).providers.length) return true;
    return /(?:\b(?:search|find|retrieve|recall|show|what|which|tell|look up)\b[\s\S]*\b(?:memor(?:y|ies)|saved (?:notes?|content)|imported (?:notes?|files?))\b|(?:查询|检索|搜索|查找|查看)[\s\S]*(?:记忆|记录))/i.test(text);
}
